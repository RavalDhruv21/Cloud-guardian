import json
import os
import requests
import boto3
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
SNS_TOPIC_ARN = os.getenv("SNS_TOPIC_ARN")

# Deterministic thresholds — anomaly is always saved if these are breached,
# regardless of what Gemini says. Acts as a safety net.
CPU_AVG_CRITICAL_THRESHOLD = 80.0
CPU_MAX_CRITICAL_THRESHOLD = 90.0
SUSTAINED_MINUTES_THRESHOLD = 15  # minutes above 80% to count as sustained spike


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

def get_assumed_client(service, role_arn, region):
    if not role_arn:
        return boto3.client(service, region_name=region)
    try:
        sts = boto3.client('sts')
        assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName='CloudGuardianAIAnalyzer')
        creds = assumed['Credentials']
        return boto3.client(service, region_name=region,
            aws_access_key_id=creds['AccessKeyId'],
            aws_secret_access_key=creds['SecretAccessKey'],
            aws_session_token=creds['SessionToken'])
    except Exception as e:
        raise RoleAssumptionError(f"Role assumption failed for {role_arn}: {e}") from e


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
Analyze the following EC2 metrics collected over the last 24 hours and detect anomalies.

CRITICAL RULES:
1. Only flag "High CPU" if the CURRENT cpu_avg > 75%.
2. Do NOT flag an anomaly based purely on past spikes (e.g., high cpu_max or past sustained_high_minutes) if the current cpu_avg is normal (<= 75%).
3. Consider cpu_avg_24h (overall trend) alongside cpu_avg (latest snapshot).
4. If current cpu_avg is normal (<= 75%), set anomaly_detected to false.
5. If cpu_avg < 5% consistently, flag as "Underutilized Instance" with severity "low".
6. Avoid false positives — only flag real current issues.

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


def deterministic_check(metric):
    """
    Safety net: if thresholds are clearly breached, return a diagnosis
    without relying on the AI. Returns None if no clear breach.
    """
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
    return None


def send_sns_alert(diagnosis, metric, account_id=None):
    if not SNS_TOPIC_ARN:
        return
    sns = boto3.client('sns', region_name='us-east-1')
    subject = f"[{diagnosis['severity'].upper()}] Cloud Guardian Alert — {metric['instance_id']}"
    message = (
        f"Cloud Guardian Anomaly Detected\n"
        f"Account: {account_id or 'unknown'} | Instance: {metric['instance_id']}\n"
        f"Severity: {diagnosis['severity'].upper()} | {diagnosis['summary']}\n"
        f"Peak CPU: {metric.get('cpu_max', 'N/A')}% | "
        f"24h Avg: {metric.get('cpu_avg_24h', 'N/A')}% | "
        f"Sustained high: {metric.get('sustained_high_minutes', 0)} min\n"
        f"Cause: {diagnosis['likely_cause']}\n"
        f"Action: {diagnosis['recommended_action']}\n"
        f"Cost: {diagnosis['estimated_monthly_cost_impact']}"
    )
    sns.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject, Message=message)


def _find_open_anomaly(table, instance_id, summary):
    """Returns the existing unresolved anomaly with this instance_id + summary, if any."""
    result = table.scan(
        FilterExpression='instance_id = :iid AND summary = :summary AND resolved = :r',
        ExpressionAttributeValues={
            ':iid': instance_id,
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
    if account_id:
        item['account_id'] = account_id
    if user_id:
        item['user_id'] = user_id
    table.put_item(Item=item)
    return True


def get_live_metrics(role_arn, region, account_id):
    """
    Fetch 24h CloudWatch data per instance and return enriched metric objects
    that include sustained_high_minutes, cpu_avg_24h, and cpu_max over the full window.
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
            cw_result = cloudwatch.get_metric_statistics(
                Namespace='AWS/EC2',
                MetricName='CPUUtilization',
                Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
                StartTime=start_time,
                EndTime=end_time,
                Period=300,   # 5-minute granularity
                Statistics=['Average', 'Maximum']
            )
            datapoints = cw_result.get('Datapoints', [])
            if not datapoints:
                continue

            datapoints.sort(key=lambda x: x['Timestamp'])
            avg_values = [dp['Average'] for dp in datapoints]
            max_values = [dp['Maximum'] for dp in datapoints]
            latest = datapoints[-1]

            # Each datapoint covers 5 minutes; count how many had avg > 80%
            sustained_high_minutes = sum(1 for v in avg_values if v > 80.0) * 5

            metrics.append({
                'instance_id': instance_id,
                'cpu_avg': round(latest['Average'], 2),           # latest 5-min snapshot
                'cpu_max': round(max(max_values), 2),             # peak over 24h
                'cpu_avg_24h': round(sum(avg_values) / len(avg_values), 2),  # 24h mean
                'sustained_high_minutes': sustained_high_minutes, # total mins > 80%
                'datapoint_count': len(datapoints),
                'timestamp': latest['Timestamp'].isoformat(),
                'account_id': account_id,
                'region': region,
            })

    return metrics


def parse_stream_record(record):
    """
    Parse a DynamoDB stream record. Reads all enriched fields stored by the collector.
    Falls back gracefully if new fields are missing (old records).
    """
    if record.get('eventName') not in ['INSERT', 'MODIFY']:
        return None
    new_image = record['dynamodb'].get('NewImage', {})
    return {
        'instance_id': new_image.get('instance_id', {}).get('S', ''),
        'cpu_avg': float(new_image.get('cpu_avg', {}).get('N', 0)),
        'cpu_max': float(new_image.get('cpu_max', {}).get('N', 0)),
        'cpu_avg_24h': float(new_image.get('cpu_avg_24h', {}).get('N', 0)),
        'sustained_high_minutes': int(float(new_image.get('sustained_high_minutes', {}).get('N', 0))),
        'datapoint_count': int(float(new_image.get('datapoint_count', {}).get('N', 0))),
        'account_id': new_image.get('account_id', {}).get('S', None),
        'user_id': new_image.get('user_id', {}).get('S', None),
        'region': new_image.get('region', {}).get('S', 'us-east-1'),
    }


def analyze_metric(metric):
    """
    Run deterministic check first; fall back to Gemini if no clear breach.
    Returns (diagnosis, source) where source is 'deterministic' or 'gemini'.
    """
    # 1. Deterministic fast-path — always catches clear threshold breaches
    fast_diagnosis = deterministic_check(metric)
    if fast_diagnosis:
        print(f"  Deterministic anomaly detected for {metric['instance_id']} — skipping Gemini")
        return fast_diagnosis, 'deterministic'

    # 2. AI analysis for ambiguous cases
    diagnosis = call_gemini(metric)
    return diagnosis, 'gemini'


def main(event=None, context=None):
    print("AI Analyzer triggered")
    results = []

    # ── DynamoDB stream path ───────────────────────────────────────────────────
    if event and 'Records' in event:
        for record in event['Records']:
            metric = parse_stream_record(record)
            if not metric or not metric['instance_id']:
                continue

            account_id = metric.get('account_id')
            user_id = metric.get('user_id')
            print(f"Analyzing stream record: {metric['instance_id']} "
                  f"(cpu_avg={metric['cpu_avg']}%, cpu_max={metric['cpu_max']}%, "
                  f"sustained={metric['sustained_high_minutes']}min)")

            try:
                diagnosis, source = analyze_metric(metric)
                print(f"  [{source}] anomaly_detected={diagnosis['anomaly_detected']}, "
                      f"severity={diagnosis.get('severity')}")
                if diagnosis['anomaly_detected']:
                    saved = save_anomaly(metric['instance_id'], metric, diagnosis,
                                         account_id=account_id, user_id=user_id)
                    if saved:
                        send_sns_alert(diagnosis, metric, account_id=account_id)
                results.append({'instance_id': metric['instance_id'], 'diagnosis': diagnosis, 'source': source})
            except Exception as e:
                print(f"Error analyzing {metric['instance_id']}: {e}")

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
                    try:
                        diagnosis, source = analyze_metric(metric)
                        print(f"    [{source}] anomaly_detected={diagnosis['anomaly_detected']}, "
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
                        print(f"Error analyzing {metric['instance_id']}: {e}")
            except Exception as e:
                print(f"Error fetching metrics for {account_id}: {e}")

    return {'statusCode': 200, 'body': json.dumps({'results': results}, default=str)}


if __name__ == '__main__':
    result = main()
    print(result['body'])