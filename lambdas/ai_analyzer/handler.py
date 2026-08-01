import json
import math
import os
import statistics
import time
import requests
import boto3
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from dotenv import load_dotenv
from boto3.dynamodb.conditions import Key

try:
    import ml_model  # Lambda's zip root has handler.py and ml_model.py as siblings
    import recommendations
except ImportError:
    from lambdas.ai_analyzer import ml_model, recommendations  # local/test imports go through the package

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
SNS_TOPIC_ARN = os.getenv("SNS_TOPIC_ARN")

# Deterministic thresholds — anomaly is always saved if these are breached,
# regardless of what Gemini says. Acts as a safety net.
CPU_AVG_CRITICAL_THRESHOLD = 80.0
CPU_MAX_CRITICAL_THRESHOLD = 90.0
SUSTAINED_MINUTES_THRESHOLD = 15  # minutes above 80% to count as sustained spike
MEM_CRITICAL_THRESHOLD = 90.0
MEM_HIGH_THRESHOLD = 80.0
DISK_CRITICAL_THRESHOLD = 90.0
DISK_HIGH_THRESHOLD = 80.0


def get_all_users():
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table('cloud-guardian-users')
        result = table.scan()
        return result.get('Items', [])
    except Exception as e:
        print(f"Error getting users: {e}")
        return []


class RoleAssumptionError(Exception):
    """Raised when assuming the customer's IAM role fails — callers must fail
    closed rather than fall back to the Lambda's own AWS credentials, which
    could act on the wrong AWS account."""

# Assumed-role credentials cached per role_arn, keyed for the life of this
# warm Lambda execution environment. STS sessions here last 15 minutes, so
# reusing them avoids re-calling STS on every invocation that hits the same
# account while the container stays warm.
_ROLE_CREDENTIALS_CACHE = {}
_CREDENTIAL_REFRESH_MARGIN_SECONDS = 60

def get_assumed_client(service, role_arn, region):
    if not role_arn:
        return boto3.client(service, region_name=region)

    cached = _ROLE_CREDENTIALS_CACHE.get(role_arn)
    if not cached or cached['expiry'] - time.time() < _CREDENTIAL_REFRESH_MARGIN_SECONDS:
        try:
            sts = boto3.client('sts')
            assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName='CloudGuardianAIAnalyzer')
            creds = assumed['Credentials']
            cached = {
                'access_key_id': creds['AccessKeyId'],
                'secret_access_key': creds['SecretAccessKey'],
                'session_token': creds['SessionToken'],
                'expiry': creds['Expiration'].timestamp(),
            }
            _ROLE_CREDENTIALS_CACHE[role_arn] = cached
        except Exception as e:
            raise RoleAssumptionError(f"Role assumption failed for {role_arn}: {e}") from e

    return boto3.client(service, region_name=region,
        aws_access_key_id=cached['access_key_id'],
        aws_secret_access_key=cached['secret_access_key'],
        aws_session_token=cached['session_token'])


# Warm-container cache — a given instance's ambiguous-metric diagnosis rarely
# changes between consecutive collector cycles, so reuse it for a while instead
# of re-asking Gemini every invocation. Doesn't survive cold starts, but cuts
# real request volume (unlike retry/backoff, which just delays the same calls).
_GEMINI_CACHE = {}
GEMINI_CACHE_TTL_SECONDS = 900  # 15 minutes


def _cache_get(instance_id):
    cached = _GEMINI_CACHE.get(instance_id)
    if not cached:
        return None
    checked_at, diagnosis = cached
    if time.time() - checked_at > GEMINI_CACHE_TTL_SECONDS:
        return None
    return diagnosis


def _cache_set(instance_id, diagnosis):
    _GEMINI_CACHE[instance_id] = (time.time(), diagnosis)


def call_gemini(metrics_data):
    """
    Send enriched 24h metrics context to Gemini for anomaly analysis.
    metrics_data must include:
      - cpu_avg         : latest 5-min average CPU %
      - cpu_max         : peak CPU % over last 24h
      - cpu_avg_24h     : mean CPU % over last 24h
      - sustained_high_minutes : total minutes cpu_avg > 80% in last 24h
    """
    prompt = f"""You are an AWS infrastructure monitoring expert.
Analyze the following EC2 metrics collected over the last 24 hours and detect anomalies. Metrics may include CPU,
network (network_in_avg/network_out_avg), disk (ebs_read_ops_avg/ebs_write_ops_avg), status_check_failed, and
(if the CloudWatch Agent is installed) mem_used_percent/disk_used_percent.

CRITICAL RULES:
1. Only flag "High CPU" if the CURRENT cpu_avg > 75%.
2. Do NOT flag an anomaly based purely on past spikes (e.g., high cpu_max or past sustained_high_minutes) if the current cpu_avg is normal (<= 75%).
3. Consider cpu_avg_24h (overall trend) alongside cpu_avg (latest snapshot).
4. If current cpu_avg is normal (<= 75%), set anomaly_detected to false.
5. If cpu_avg < 5% consistently, flag as "Underutilized Instance" with severity "low".
6. Do NOT treat every metric as a CPU problem — a high network_in/network_out with normal CPU is a network/traffic issue, not a CPU issue; a high ebs_read_ops/ebs_write_ops with normal CPU is a disk I/O issue.
7. status_check_failed=1 (or status_check_failed_24h_max > 0) is always a real anomaly regardless of other metrics.
8. Avoid false positives — only flag real current issues.

Metrics data:
{json.dumps(metrics_data, indent=2)}

Respond ONLY in this exact JSON format (no markdown, no extra text):
{{"anomaly_detected": true or false, "severity": "low" or "medium" or "high" or "critical",
"summary": "one line summary", "likely_cause": "cause", "recommended_action": "action",
"estimated_monthly_cost_impact": "cost impact"}}"""

    headers = {"Content-Type": "application/json"}
    body = {
        "systemInstruction": {
            "parts": [{"text": "You are an AWS infrastructure expert. Always respond in valid JSON only. No markdown fences."}]
        },
        "contents": [
            {"parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 500
        }
    }
    response = requests.post(GEMINI_API_URL, headers=headers, json=body)
    response.raise_for_status()
    try:
        raw_text = response.json()['candidates'][0]['content']['parts'][0]['text'].strip()
    except Exception as e:
        print(f"Error parsing Gemini response: {e}, {response.text}")
        raise

    # Strip markdown fences if model ignores the instruction
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    return json.loads(raw_text.strip())


def call_gemini_batch(metrics_list):
    """
    Same analysis as call_gemini, but for multiple instances in a single
    request — this is what actually cuts Gemini request volume, since the
    free-tier quota is shared across every Lambda invocation and every
    instance being analyzed. Returns {instance_id: diagnosis}.
    """
    if not metrics_list:
        return {}

    prompt = f"""You are an AWS infrastructure monitoring expert.
Analyze EACH of the following EC2 instances' metrics (collected over the last 24 hours) and detect anomalies independently, per instance. Metrics may
include CPU, network (network_in_avg/network_out_avg), disk (ebs_read_ops_avg/ebs_write_ops_avg), status_check_failed, and (if the CloudWatch Agent is
installed) mem_used_percent/disk_used_percent.

CRITICAL RULES (apply per-instance):
1. Only flag "High CPU" if the CURRENT cpu_avg > 75%.
2. Do NOT flag an anomaly based purely on past spikes (e.g., high cpu_max or past sustained_high_minutes) if the current cpu_avg is normal (<= 75%).
3. Consider cpu_avg_24h (overall trend) alongside cpu_avg (latest snapshot).
4. If current cpu_avg is normal (<= 75%), set anomaly_detected to false.
5. If cpu_avg < 5% consistently, flag as "Underutilized Instance" with severity "low".
6. Do NOT treat every metric as a CPU problem — a high network_in/network_out with normal CPU is a network/traffic issue, not a CPU issue; a high ebs_read_ops/ebs_write_ops with normal CPU is a disk I/O issue.
7. status_check_failed=1 (or status_check_failed_24h_max > 0) is always a real anomaly regardless of other metrics.
8. Avoid false positives — only flag real current issues.

Instances (keyed by instance_id):
{json.dumps({m['instance_id']: m for m in metrics_list}, indent=2)}

Respond ONLY with a JSON object keyed by instance_id (no markdown, no extra text). Every instance_id above must appear as a key. Each value must have this exact shape:
{{"anomaly_detected": true or false, "severity": "low" or "medium" or "high" or "critical",
"summary": "one line summary", "likely_cause": "cause", "recommended_action": "action",
"estimated_monthly_cost_impact": "cost impact"}}"""

    headers = {"Content-Type": "application/json"}
    body = {
        "systemInstruction": {
            "parts": [{"text": "You are an AWS infrastructure expert. Always respond in valid JSON only. No markdown fences."}]
        },
        "contents": [
            {"parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 500 * len(metrics_list)
        }
    }
    response = requests.post(GEMINI_API_URL, headers=headers, json=body)
    response.raise_for_status()
    try:
        raw_text = response.json()['candidates'][0]['content']['parts'][0]['text'].strip()
    except Exception as e:
        print(f"Error parsing Gemini batch response: {e}, {response.text}")
        raise

    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    return json.loads(raw_text.strip())


def deterministic_check(metric):
    """
    Safety net: if thresholds are clearly breached, return a diagnosis
    without relying on the AI. Returns None if no clear breach. Checks
    instance status first (an instance failing its own AWS health check is
    unambiguous and shouldn't wait on CPU/memory/disk thresholds), then CPU,
    then memory/disk usage (CWAgent-only — skipped when not installed).
    """
    if metric.get('status_check_failed'):
        return {
            'anomaly_detected': True,
            'severity': 'critical',
            'summary': 'Instance is failing its AWS status check',
            'likely_cause': 'Underlying hardware, network, or OS-level failure',
            'recommended_action': 'Investigate instance reachability; consider stopping/starting or replacing the instance',
            'estimated_monthly_cost_impact': 'Possible downtime; evaluate instance replacement',
        }

    cpu_avg = metric.get('cpu_avg', 0)
    if cpu_avg > CPU_AVG_CRITICAL_THRESHOLD:
        severity = 'critical' if cpu_avg > 90 else 'high'
        return {
            'anomaly_detected': True,
            'severity': severity,
            'summary': f'CPU average is critically high at {cpu_avg}%',
            'likely_cause': 'High application load or runaway process',
            'recommended_action': 'Review running processes and consider scaling up the instance',
            'estimated_monthly_cost_impact': 'Possible performance degradation; evaluate instance upgrade',
        }

    mem_used_percent = metric.get('mem_used_percent')
    if mem_used_percent is not None and mem_used_percent > MEM_HIGH_THRESHOLD:
        severity = 'critical' if mem_used_percent > MEM_CRITICAL_THRESHOLD else 'high'
        return {
            'anomaly_detected': True,
            'severity': severity,
            'summary': f'Memory usage is critically high at {mem_used_percent}%',
            'likely_cause': 'Memory leak or undersized instance for current workload',
            'recommended_action': 'Investigate memory usage per process; consider right-sizing the instance',
            'estimated_monthly_cost_impact': 'Possible OOM-related downtime; evaluate instance upgrade',
        }

    disk_used_percent = metric.get('disk_used_percent')
    if disk_used_percent is not None and disk_used_percent > DISK_HIGH_THRESHOLD:
        severity = 'critical' if disk_used_percent > DISK_CRITICAL_THRESHOLD else 'high'
        return {
            'anomaly_detected': True,
            'severity': severity,
            'summary': f'Disk usage is critically high at {disk_used_percent}%',
            'likely_cause': 'Log growth, temp file accumulation, or undersized volume',
            'recommended_action': 'Clean up disk space or expand the volume',
            'estimated_monthly_cost_impact': 'Risk of disk-full failures; evaluate volume resize',
        }

    return None


def send_sns_alert(diagnosis, metric, account_id=None):
    if not SNS_TOPIC_ARN:
        return
    sns = boto3.client('sns', region_name='us-east-1')
    subject = f"[{diagnosis['severity'].upper()}] Cloud Guardian Alert — {metric['instance_id']}"

    extra_lines = []
    if 'network_in_avg' in metric or 'network_out_avg' in metric:
        extra_lines.append(f"Network: in={metric.get('network_in_avg', 'N/A')} out={metric.get('network_out_avg', 'N/A')} bytes/5min")
    if 'ebs_read_ops_avg' in metric or 'ebs_write_ops_avg' in metric:
        extra_lines.append(f"EBS ops: read={metric.get('ebs_read_ops_avg', 'N/A')} write={metric.get('ebs_write_ops_avg', 'N/A')} /5min")
    if metric.get('status_check_failed'):
        extra_lines.append("Status check: FAILED")
    if 'mem_used_percent' in metric:
        extra_lines.append(f"Memory: {metric['mem_used_percent']}%")
    if 'disk_used_percent' in metric:
        extra_lines.append(f"Disk: {metric['disk_used_percent']}%")

    recommendations_block = ""
    if diagnosis.get('additional_recommendations'):
        recommendations_block = "\nRecommendations:\n" + "\n".join(
            f"- {r}" for r in diagnosis['additional_recommendations'])

    message = (
        f"Cloud Guardian Anomaly Detected\n"
        f"Account: {account_id or 'unknown'} | Instance: {metric['instance_id']}\n"
        f"Severity: {diagnosis['severity'].upper()} | {diagnosis['summary']}\n"
        f"Peak CPU: {metric.get('cpu_max', 'N/A')}% | "
        f"24h Avg: {metric.get('cpu_avg_24h', 'N/A')}% | "
        f"Sustained high: {metric.get('sustained_high_minutes', 0)} min\n"
        + ("\n".join(extra_lines) + "\n" if extra_lines else "")
        + f"Cause: {diagnosis['likely_cause']}\n"
        f"Action: {diagnosis['recommended_action']}"
        f"{recommendations_block}\n"
        f"Cost: {diagnosis['estimated_monthly_cost_impact']}"
    )
    sns.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject, Message=message)


def _find_open_anomaly(table, instance_id, summary):
    """Returns the existing unresolved anomaly with this instance_id + summary, if any."""
    result = table.query(
        KeyConditionExpression=Key('instance_id').eq(instance_id),
        FilterExpression='summary = :summary AND resolved = :r',
        ExpressionAttributeValues={
            ':summary': summary,
            ':r': False,
        }
    )
    items = result.get('Items', [])
    if not items:
        return None
    return max(items, key=lambda i: i.get('timestamp', ''))

def save_anomaly(instance_id, metrics, diagnosis, account_id=None, user_id=None):
    """Saves anomaly only if no identical unresolved anomaly already exists; otherwise just
    refreshes last_seen on the existing row so repeated runs don't pile up duplicates.
    Returns True if a new row was saved, False if an existing one was refreshed."""
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))

    now = datetime.now(timezone.utc).isoformat()
    existing = _find_open_anomaly(table, instance_id, diagnosis['summary'])
    if existing:
        table.update_item(
            Key={'instance_id': existing['instance_id'], 'timestamp': existing['timestamp']},
            UpdateExpression='SET last_seen = :ls, metrics_snapshot = :ms',
            ExpressionAttributeValues={':ls': now, ':ms': json.dumps(metrics, default=str)}
        )
        print(f"  Refreshed existing unresolved anomaly for {instance_id}")
        return False

    item = {
        'instance_id': instance_id,
        'timestamp': now,
        'metrics_snapshot': json.dumps(metrics, default=str),
        'severity': diagnosis['severity'],
        'summary': diagnosis['summary'],
        'likely_cause': diagnosis['likely_cause'],
        'recommended_action': diagnosis['recommended_action'],
        'cost_impact': diagnosis['estimated_monthly_cost_impact'],
        'resolved': False,
        'last_seen': now,
    }
    if diagnosis.get('additional_recommendations'):
        item['additional_recommendations'] = diagnosis['additional_recommendations']
    if account_id:
        item['account_id'] = account_id
    if user_id:
        item['user_id'] = user_id
    table.put_item(Item=item)
    return True


# Same non-CPU metrics collector/handler.py collects, mirrored here for the
# manual/scheduled full-account scan path (get_live_metrics loops per
# instance already, so this is just more get_metric_statistics calls per
# instance rather than a batched get_metric_data query).
EXTRA_METRICS = ['NetworkIn', 'NetworkOut', 'EBSReadOps', 'EBSWriteOps']
EXTRA_METRIC_KEYS = {
    'NetworkIn': 'network_in', 'NetworkOut': 'network_out',
    'EBSReadOps': 'ebs_read_ops', 'EBSWriteOps': 'ebs_write_ops',
}


def _enrich_series(prefix, avg_values, max_values):
    """Same avg/max/24h/std/1h/rate-of-change enrichment as
    collector/handler.py's _enrich_series, generalized across metrics."""
    std_24h = statistics.pstdev(avg_values) if len(avg_values) > 1 else 0.0
    recent_window = avg_values[-12:]  # last 1h at 5-min granularity
    avg_1h = sum(recent_window) / len(recent_window)
    rate_of_change = avg_values[-1] - avg_values[-2] if len(avg_values) > 1 else 0.0
    return {
        f'{prefix}_avg': round(avg_values[-1], 2),
        f'{prefix}_max': round(max(max_values or avg_values), 2),
        f'{prefix}_avg_24h': round(sum(avg_values) / len(avg_values), 2),
        f'{prefix}_std_24h': round(std_24h, 4),
        f'{prefix}_avg_1h': round(avg_1h, 2),
        f'{prefix}_rate_of_change': round(rate_of_change, 2),
    }


def _get_metric_avg_max(cloudwatch, namespace, metric_name, instance_id, start_time, end_time):
    result = cloudwatch.get_metric_statistics(
        Namespace=namespace,
        MetricName=metric_name,
        Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
        StartTime=start_time,
        EndTime=end_time,
        Period=300,
        Statistics=['Average', 'Maximum']
    )
    datapoints = sorted(result.get('Datapoints', []), key=lambda x: x['Timestamp'])
    if not datapoints:
        return None, None
    return [dp['Average'] for dp in datapoints], [dp['Maximum'] for dp in datapoints]


def get_live_metrics(role_arn, region, account_id):
    """
    Fetch 24h CloudWatch data per instance and return enriched metric objects
    that include sustained_high_minutes, cpu_avg_24h, and cpu_max over the full
    window, plus the same enrichment for network/disk and status_check_failed.
    """
    ec2 = get_assumed_client('ec2', role_arn, region)
    cloudwatch = get_assumed_client('cloudwatch', role_arn, region)

    instances_resp = ec2.describe_instances(
        Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]
    )

    metrics = []
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=24)

    for reservation in instances_resp['Reservations']:
        for inst in reservation['Instances']:
            instance_id = inst['InstanceId']
            avg_values, max_values = _get_metric_avg_max(
                cloudwatch, 'AWS/EC2', 'CPUUtilization', instance_id, start_time, end_time)
            if avg_values is None:
                continue

            cw_result = cloudwatch.get_metric_statistics(
                Namespace='AWS/EC2', MetricName='CPUUtilization',
                Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
                StartTime=start_time, EndTime=end_time, Period=300,
                Statistics=['Average', 'Maximum']
            )
            latest_ts = max(dp['Timestamp'] for dp in cw_result['Datapoints'])

            # Each datapoint covers 5 minutes; count how many had avg > 80%
            sustained_high_minutes = sum(1 for v in avg_values if v > 80.0) * 5
            cpu_enriched = _enrich_series('cpu', avg_values, max_values)

            metric = {
                'instance_id': instance_id,
                'cpu_avg': cpu_enriched['cpu_avg'],
                'cpu_max': cpu_enriched['cpu_max'],
                'cpu_avg_24h': cpu_enriched['cpu_avg_24h'],
                'sustained_high_minutes': sustained_high_minutes,
                'cpu_std_24h': cpu_enriched['cpu_std_24h'],
                'cpu_avg_1h': cpu_enriched['cpu_avg_1h'],
                'rate_of_change': cpu_enriched['cpu_rate_of_change'],
                'datapoint_count': len(avg_values),
                'timestamp': latest_ts.isoformat(),
                'account_id': account_id,
                'region': region,
            }

            for metric_name in EXTRA_METRICS:
                prefix = EXTRA_METRIC_KEYS[metric_name]
                extra_avg, extra_max = _get_metric_avg_max(
                    cloudwatch, 'AWS/EC2', metric_name, instance_id, start_time, end_time)
                if extra_avg is None:
                    continue
                metric.update(_enrich_series(prefix, extra_avg, extra_max))

            status_avg, status_max = _get_metric_avg_max(
                cloudwatch, 'AWS/EC2', 'StatusCheckFailed', instance_id, start_time, end_time)
            if status_avg is not None:
                metric['status_check_failed'] = int(status_avg[-1])
                metric['status_check_failed_24h_max'] = int(max(status_max))

            metrics.append(metric)

    return metrics


def parse_stream_record(record):
    """
    Parse a DynamoDB stream record. Reads all enriched fields stored by the collector.
    Falls back gracefully if new fields are missing (old records).
    """
    if record.get('eventName') not in ['INSERT', 'MODIFY']:
        return None
    new_image = record['dynamodb'].get('NewImage', {})

    def num(name, default=0):
        if name not in new_image:
            return default
        return float(new_image[name]['N'])

    metric = {
        'instance_id': new_image.get('instance_id', {}).get('S', ''),
        'cpu_avg': num('cpu_avg'),
        'cpu_max': num('cpu_max'),
        'cpu_avg_24h': num('cpu_avg_24h'),
        'sustained_high_minutes': int(num('sustained_high_minutes')),
        'cpu_std_24h': num('cpu_std_24h'),
        'cpu_avg_1h': num('cpu_avg_1h', num('cpu_avg')),
        'rate_of_change': num('rate_of_change'),
        'datapoint_count': int(num('datapoint_count')),
        'timestamp': new_image.get('timestamp', {}).get('S', None),
        'account_id': new_image.get('account_id', {}).get('S', None),
        'user_id': new_image.get('user_id', {}).get('S', None),
        'region': new_image.get('region', {}).get('S', 'us-east-1'),
    }

    # Optional fields — old records predating this feature won't have them,
    # and instances without EBS/CWAgent data won't either, so they're only
    # included when present rather than defaulted to 0 (which would look
    # like "confirmed zero traffic" instead of "unknown").
    for prefix in ('network_in', 'network_out', 'ebs_read_ops', 'ebs_write_ops'):
        for suffix in ('avg', 'max', 'avg_24h', 'std_24h', 'avg_1h', 'rate_of_change'):
            key = f'{prefix}_{suffix}'
            if key in new_image:
                metric[key] = num(key)
    if 'status_check_failed' in new_image:
        metric['status_check_failed'] = int(num('status_check_failed'))
    if 'status_check_failed_24h_max' in new_image:
        metric['status_check_failed_24h_max'] = int(num('status_check_failed_24h_max'))
    if 'mem_used_percent' in new_image:
        metric['mem_used_percent'] = num('mem_used_percent')
    if 'disk_used_percent' in new_image:
        metric['disk_used_percent'] = num('disk_used_percent')

    return metric


ML_FEATURE_EPS = 1e-6


# Non-CPU metrics fed into the trained model — each contributes its current
# level (avg) plus a z-score vs its own 24h baseline, mirroring cpu's
# z_score_24h. Missing values (older records, or metrics AWS didn't return
# for a given instance) default to "looks normal" (avg 0, z-score 0) rather
# than raising, same as cpu's existing defaults.
EXTRA_ML_METRICS = ['network_in', 'network_out', 'ebs_read_ops', 'ebs_write_ops']


def build_feature_vector(metric):
    """
    Builds the feature vector in the exact order the anomaly model was
    trained on (see ml/train_anomaly_model.py's FEATURE_COLUMNS): z-score and
    short-vs-long-window deviation are derived here from the raw stats
    collector/get_live_metrics persist (cpu_std_24h, cpu_avg_1h), mirroring
    how the training script derives them from NAB's rolling windows. Network/
    disk/status-check features extend the same pattern so anomalies aren't
    detected on CPU alone.
    """
    cpu_avg = metric.get('cpu_avg', 0.0)
    cpu_max = metric.get('cpu_max', 0.0)
    cpu_avg_24h = metric.get('cpu_avg_24h', 0.0)
    sustained_high_minutes = metric.get('sustained_high_minutes', 0)
    rate_of_change = metric.get('rate_of_change', 0.0)
    cpu_std_24h = metric.get('cpu_std_24h', 0.0)
    cpu_avg_1h = metric.get('cpu_avg_1h', cpu_avg)

    z_score_24h = (cpu_avg - cpu_avg_24h) / (cpu_std_24h + ML_FEATURE_EPS)
    short_vs_long_shift = (cpu_avg_1h - cpu_avg_24h) / (cpu_std_24h + ML_FEATURE_EPS)

    if metric.get('timestamp'):
        ts = datetime.fromisoformat(metric['timestamp'])
    else:
        ts = datetime.now(timezone.utc)
    hour_frac = ts.hour + ts.minute / 60.0
    hour_sin = math.sin(2 * math.pi * hour_frac / 24)
    hour_cos = math.cos(2 * math.pi * hour_frac / 24)

    features = [cpu_avg, cpu_max, cpu_avg_24h, sustained_high_minutes, rate_of_change,
                z_score_24h, short_vs_long_shift, hour_sin, hour_cos]

    for prefix in EXTRA_ML_METRICS:
        avg = metric.get(f'{prefix}_avg', 0.0)
        avg_24h = metric.get(f'{prefix}_avg_24h', avg)
        std_24h = metric.get(f'{prefix}_std_24h', 0.0)
        features.append(avg)
        features.append((avg - avg_24h) / (std_24h + ML_FEATURE_EPS))

    features.append(metric.get('status_check_failed', 0))

    return features


def ml_check(metric):
    """
    Runs the exported Isolation Forest on a metric that already passed the
    deterministic check. If the model is confident nothing's wrong, returns a
    'normal' diagnosis immediately — skipping Gemini entirely. If it looks
    anomalous, returns None so the metric still falls through to Gemini,
    which is what produces the human-readable cause/action/cost writeup the
    model itself can't generate.
    """
    features = build_feature_vector(metric)
    if not ml_model.is_anomaly(features):
        return {
            'anomaly_detected': False,
            'severity': 'none',
            'summary': 'No anomaly detected (ML model)',
            'likely_cause': 'n/a',
            'recommended_action': 'n/a',
            'estimated_monthly_cost_impact': 'n/a',
        }
    return None


def analyze_metrics(metrics):
    """
    Analyzes a batch of metrics from one invocation in three stages, cheapest
    first: deterministic checks (free), then the local ML model (free, no
    network call), and only what's left after both goes to Gemini — batched
    into a single call (after checking the warm-container cache) instead of
    one call per metric.
    Returns [(metric, diagnosis, source), ...] — source is 'deterministic',
    'ml', 'gemini-cached', or 'gemini'. Metrics with no diagnosis (batch
    response missing that instance_id) are omitted.
    """
    results = [None] * len(metrics)
    to_query = []  # (index, metric) needing a fresh Gemini call

    for i, metric in enumerate(metrics):
        fast_diagnosis = deterministic_check(metric)
        if fast_diagnosis:
            print(f"  Deterministic anomaly detected for {metric['instance_id']} — skipping Gemini")
            results[i] = (metric, fast_diagnosis, 'deterministic')
            continue

        ml_diagnosis = ml_check(metric)
        if ml_diagnosis:
            print(f"  ML model confident {metric['instance_id']} is normal — skipping Gemini")
            results[i] = (metric, ml_diagnosis, 'ml')
            continue

        cached = _cache_get(metric['instance_id'])
        if cached:
            print(f"  Reusing cached Gemini diagnosis for {metric['instance_id']} (< {GEMINI_CACHE_TTL_SECONDS}s old)")
            results[i] = (metric, cached, 'gemini-cached')
            continue

        to_query.append((i, metric))

    if to_query:
        print(f"  Batching {len(to_query)} ambiguous instance(s) into a single Gemini call")
        batch_diagnoses = call_gemini_batch([m for _, m in to_query])
        for i, metric in to_query:
            diagnosis = batch_diagnoses.get(metric['instance_id'])
            if diagnosis is None:
                print(f"  No diagnosis returned for {metric['instance_id']}, skipping")
                continue
            _cache_set(metric['instance_id'], diagnosis)
            results[i] = (metric, diagnosis, 'gemini')

    final = [r for r in results if r is not None]
    for metric, diagnosis, _source in final:
        if diagnosis.get('anomaly_detected'):
            extra = recommendations.derive_recommendations(metric)
            if extra:
                diagnosis['additional_recommendations'] = extra
    return final


def main(event=None, context=None):
    print("AI Analyzer triggered")
    results = []

    # ── DynamoDB stream path ───────────────────────────────────────────────────
    if event and 'Records' in event:
        metrics = []
        for record in event['Records']:
            metric = parse_stream_record(record)
            if metric and metric['instance_id']:
                metrics.append(metric)
                print(f"Analyzing stream record: {metric['instance_id']} "
                      f"(cpu_avg={metric['cpu_avg']}%, cpu_max={metric['cpu_max']}%, "
                      f"sustained={metric['sustained_high_minutes']}min)")

        try:
            for metric, diagnosis, source in analyze_metrics(metrics):
                account_id = metric.get('account_id')
                user_id = metric.get('user_id')
                print(f"  [{source}] {metric['instance_id']}: anomaly_detected={diagnosis['anomaly_detected']}, "
                      f"severity={diagnosis.get('severity')}")
                if diagnosis['anomaly_detected']:
                    saved = save_anomaly(metric['instance_id'], metric, diagnosis,
                                         account_id=account_id, user_id=user_id)
                    if saved:
                        send_sns_alert(diagnosis, metric, account_id=account_id)
                results.append({'instance_id': metric['instance_id'], 'diagnosis': diagnosis, 'source': source})
        except Exception as e:
            print(f"Error analyzing stream batch: {e}")

    # ── Manual / scheduled invocation — scan all connected users ──────────────
    else:
        users = get_all_users()
        print(f"Manual scan for {len(users)} connected accounts")

        for user in users:
            role_arn = user.get('role_arn')
            region = user.get('region', 'us-east-1')
            account_id = user.get('account_id')
            user_id = user.get('user_id')

            if not role_arn or not account_id:
                continue

            print(f"Analyzing account {account_id} for user {user_id}")
            try:
                live_metrics = get_live_metrics(role_arn, region, account_id)
                print(f"  Found {len(live_metrics)} instances to analyze")
                for metric in live_metrics:
                    print(f"  Instance {metric['instance_id']}: "
                          f"cpu_avg={metric['cpu_avg']}%, cpu_max={metric['cpu_max']}%, "
                          f"cpu_avg_24h={metric['cpu_avg_24h']}%, "
                          f"sustained={metric['sustained_high_minutes']}min")

                for metric, diagnosis, source in analyze_metrics(live_metrics):
                    print(f"    [{source}] {metric['instance_id']}: anomaly_detected={diagnosis['anomaly_detected']}, "
                          f"severity={diagnosis.get('severity')}")
                    if diagnosis['anomaly_detected']:
                        saved = save_anomaly(metric['instance_id'], metric, diagnosis,
                                             account_id=account_id, user_id=user_id)
                        if saved:
                            send_sns_alert(diagnosis, metric, account_id=account_id)
                    results.append({
                        'instance_id': metric['instance_id'],
                        'diagnosis': diagnosis,
                        'source': source
                    })
            except Exception as e:
                print(f"Error fetching/analyzing metrics for {account_id}: {e}")

    return {'statusCode': 200, 'body': json.dumps({'results': results}, default=str)}


if __name__ == '__main__':
    result = main()
    print(result['body'])