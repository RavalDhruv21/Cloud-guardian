import boto3
import json
import decimal
import os
import statistics
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()


def get_all_users():
    """Get all connected accounts from users table"""
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
            assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName='CloudGuardianCollector')
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


# CloudWatch metrics collected per instance beyond CPU, so anomaly detection
# isn't CPU-only — network saturation, disk I/O pressure, and instance health
# checks all get the same 24h avg/max/std/1h enrichment CPU already gets.
# EBSReadOps/EBSWriteOps are used instead of DiskReadOps/DiskWriteOps because
# the latter only populate for instance-store volumes; almost all instances
# today are EBS-backed (Nitro).
EXTRA_METRICS = ['NetworkIn', 'NetworkOut', 'EBSReadOps', 'EBSWriteOps']
EXTRA_METRIC_KEYS = {
    'NetworkIn': 'network_in', 'NetworkOut': 'network_out',
    'EBSReadOps': 'ebs_read_ops', 'EBSWriteOps': 'ebs_write_ops',
}


def _enrich_series(prefix, values, timestamps, max_values):
    """Same avg/max/24h/std/1h/rate-of-change enrichment CPU gets, generalized
    so it can be reused for network/disk metrics without duplicating the math
    per metric."""
    paired = sorted(zip(timestamps, values))
    ordered_values = [v for _, v in paired]
    latest_ts, latest_avg = paired[-1]
    std_24h = statistics.pstdev(ordered_values) if len(ordered_values) > 1 else 0.0
    recent_window = ordered_values[-12:]  # last 1h at 5-min granularity
    avg_1h = sum(recent_window) / len(recent_window)
    rate_of_change = ordered_values[-1] - ordered_values[-2] if len(ordered_values) > 1 else 0.0
    return {
        f'{prefix}_avg': round(latest_avg, 2),
        f'{prefix}_max': round(max(max_values or ordered_values), 2),
        f'{prefix}_avg_24h': round(sum(ordered_values) / len(ordered_values), 2),
        f'{prefix}_std_24h': round(std_24h, 4),
        f'{prefix}_avg_1h': round(avg_1h, 2),
        f'{prefix}_rate_of_change': round(rate_of_change, 2),
    }, latest_ts


def collect_ec2_metrics_batch(cloudwatch, instance_ids):
    """
    Collect 24h of CloudWatch data for a batch of instances using
    get_metric_data instead of one get_metric_statistics call per instance.
    GetMetricData allows up to 500 metric queries per call; we need 2 queries
    (avg + max) per instance for CPU plus each of EXTRA_METRICS, and 1 query
    (max, since it's already 0/1) for StatusCheckFailed — 11 queries/instance
    total, so instances are chunked at 45/call (500 // 11).

    Returns a dict of instance_id -> enriched metric object (cpu_avg_24h,
    cpu_max peak, sustained_high_minutes, plus the same enrichment for
    network/disk, and status_check_failed), stored to DynamoDB so the
    DynamoDB stream trigger for ai_analyzer has full context — not just
    the latest 5-min snapshot. Instances with no CPU datapoints are omitted.
    """
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=24)

    metric_names = ['CPUUtilization'] + EXTRA_METRICS

    results = {}
    chunk_size = 45
    for i in range(0, len(instance_ids), chunk_size):
        chunk = instance_ids[i:i + chunk_size]
        queries = []
        for idx, instance_id in enumerate(chunk):
            dims = [{'Name': 'InstanceId', 'Value': instance_id}]
            for metric_name in metric_names:
                metric_stat = {'Metric': {'Namespace': 'AWS/EC2', 'MetricName': metric_name, 'Dimensions': dims},
                                'Period': 300}
                qid = f'{metric_name}{idx}'
                queries.append({'Id': f'avg_{qid}', 'MetricStat': {**metric_stat, 'Stat': 'Average'}, 'ReturnData': True})
                queries.append({'Id': f'max_{qid}', 'MetricStat': {**metric_stat, 'Stat': 'Maximum'}, 'ReturnData': True})
            status_stat = {'Metric': {'Namespace': 'AWS/EC2', 'MetricName': 'StatusCheckFailed', 'Dimensions': dims},
                            'Period': 300}
            queries.append({'Id': f'max_StatusCheckFailed{idx}', 'MetricStat': {**status_stat, 'Stat': 'Maximum'}, 'ReturnData': True})

        # buckets[metric_name]['avg'|'max'][idx] = {'timestamps': [...], 'values': [...]}
        buckets = {name: {'avg': {}, 'max': {}} for name in metric_names + ['StatusCheckFailed']}
        paginator = cloudwatch.get_paginator('get_metric_data')
        for page in paginator.paginate(MetricDataQueries=queries, StartTime=start_time, EndTime=end_time,
                                        ScanBy='TimestampAscending'):
            for r in page['MetricDataResults']:
                stat, rest = r['Id'].split('_', 1)
                metric_name = next(name for name in buckets if rest.startswith(name))
                idx = int(rest[len(metric_name):])
                bucket = buckets[metric_name][stat].setdefault(idx, {'timestamps': [], 'values': []})
                bucket['timestamps'].extend(r['Timestamps'])
                bucket['values'].extend(r['Values'])

        for idx, instance_id in enumerate(chunk):
            cpu_avg_data = buckets['CPUUtilization']['avg'].get(idx)
            if not cpu_avg_data or not cpu_avg_data['values']:
                continue
            cpu_max_values = buckets['CPUUtilization']['max'].get(idx, {}).get('values') or cpu_avg_data['values']
            cpu_enriched, latest_ts = _enrich_series('cpu', cpu_avg_data['values'], cpu_avg_data['timestamps'], cpu_max_values)

            # Each datapoint = 5 minutes; count how many had avg CPU > 80%
            sustained_high_minutes = sum(1 for v in cpu_avg_data['values'] if v > 80.0) * 5

            metric = {
                'instance_id': instance_id,
                'cpu_avg': cpu_enriched['cpu_avg'],
                'cpu_max': cpu_enriched['cpu_max'],
                'cpu_avg_24h': cpu_enriched['cpu_avg_24h'],
                'sustained_high_minutes': sustained_high_minutes,
                'cpu_std_24h': cpu_enriched['cpu_std_24h'],
                'cpu_avg_1h': cpu_enriched['cpu_avg_1h'],
                'rate_of_change': cpu_enriched['cpu_rate_of_change'],
                'datapoint_count': len(cpu_avg_data['values']),
                'timestamp': latest_ts.isoformat(),
                'collected_at': datetime.now(timezone.utc).isoformat(),
            }

            for metric_name in EXTRA_METRICS:
                prefix = EXTRA_METRIC_KEYS[metric_name]
                avg_data = buckets[metric_name]['avg'].get(idx)
                if not avg_data or not avg_data['values']:
                    continue
                max_values = buckets[metric_name]['max'].get(idx, {}).get('values') or avg_data['values']
                enriched, _ = _enrich_series(prefix, avg_data['values'], avg_data['timestamps'], max_values)
                metric.update(enriched)

            status_data = buckets['StatusCheckFailed']['max'].get(idx)
            if status_data and status_data['values']:
                status_paired = sorted(zip(status_data['timestamps'], status_data['values']))
                metric['status_check_failed'] = int(status_paired[-1][1])
                metric['status_check_failed_24h_max'] = int(max(v for _, v in status_paired))

            results[instance_id] = metric
    return results


# CWAgent metric names collected best-effort when the agent is installed on
# an instance. Not fed into the ML feature vector (their availability isn't
# uniform across instances, which would break a fixed-length vector) — used
# only for deterministic threshold checks and extra Gemini context.
CWAGENT_METRICS = ['mem_used_percent', 'disk_used_percent']


def discover_cwagent_metrics(cloudwatch, instance_ids):
    """
    Finds which of instance_ids report CWAgent metrics, without one API call
    per instance: list_metrics with Dimensions=[{'Name': 'InstanceId'}] (no
    Value) matches any metric that HAS an InstanceId dimension, then results
    are intersected client-side with instance_ids. Returns
    {instance_id: {metric_name: dimensions}}. Best-effort — any failure
    (e.g. CWAgent never used in this account) yields an empty dict rather
    than failing collection.
    """
    instance_id_set = set(instance_ids)
    found = {}
    try:
        paginator = cloudwatch.get_paginator('list_metrics')
        for metric_name in CWAGENT_METRICS:
            for page in paginator.paginate(Namespace='CWAgent', MetricName=metric_name,
                                            Dimensions=[{'Name': 'InstanceId'}]):
                for m in page['Metrics']:
                    dims = m['Dimensions']
                    instance_id = next((d['Value'] for d in dims if d['Name'] == 'InstanceId'), None)
                    if instance_id in instance_id_set:
                        found.setdefault(instance_id, {})[metric_name] = dims
    except Exception as e:
        print(f"CWAgent metric discovery failed (agent likely not installed): {e}")
    return found


def collect_cwagent_metrics(cloudwatch, instance_metrics):
    """
    Queries the latest value of each discovered CWAgent metric. instance_metrics
    is discover_cwagent_metrics's return value. Merges mem_used_percent /
    disk_used_percent directly into each result dict; instances without the
    agent installed are left untouched.
    """
    if not instance_metrics:
        return
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=1)

    queries = []
    query_map = {}  # query id -> (instance_id, metric_name)
    for idx, (instance_id, metrics) in enumerate(instance_metrics.items()):
        for metric_name, dims in metrics.items():
            qid = f'cw{idx}_{metric_name}'
            queries.append({
                'Id': qid,
                'MetricStat': {
                    'Metric': {'Namespace': 'CWAgent', 'MetricName': metric_name, 'Dimensions': dims},
                    'Period': 300, 'Stat': 'Average',
                },
                'ReturnData': True,
            })
            query_map[qid] = (instance_id, metric_name)

    latest_by_instance = {}
    try:
        paginator = cloudwatch.get_paginator('get_metric_data')
        for i in range(0, len(queries), 500):
            batch = queries[i:i + 500]
            for page in paginator.paginate(MetricDataQueries=batch, StartTime=start_time, EndTime=end_time,
                                            ScanBy='TimestampAscending'):
                for r in page['MetricDataResults']:
                    if not r['Values']:
                        continue
                    instance_id, metric_name = query_map[r['Id']]
                    latest_by_instance.setdefault(instance_id, {})[metric_name] = round(r['Values'][-1], 2)
    except Exception as e:
        print(f"CWAgent metric collection failed: {e}")
        return latest_by_instance
    return latest_by_instance


def cleanup_stale_metrics():
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    result = table.scan()
    items = result.get('Items', [])
    deleted = 0
    for item in items:
        if item.get('timestamp', '') < cutoff:
            table.delete_item(Key={
                'instance_id': item['instance_id'],
                'timestamp': item['timestamp']
            })
            deleted += 1
    if deleted > 0:
        print(f"Cleaned up {deleted} stale metric records")


def list_running_instances(ec2):
    paginator = ec2.get_paginator('describe_instances')
    instance_ids = []
    for page in paginator.paginate(Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]):
        for reservation in page['Reservations']:
            instance_ids.extend(inst['InstanceId'] for inst in reservation['Instances'])
    return instance_ids


# Fields present on every metric (CPU + datapoint_count). Network/disk/status
# check/CWAgent fields are optional per-instance (e.g. an instance with no
# CWAgent installed simply won't have mem_used_percent), so those are
# converted generically by type instead of being named here.
BASE_NUMERIC_FIELDS = (
    'cpu_avg', 'cpu_max', 'cpu_avg_24h', 'sustained_high_minutes',
    'cpu_std_24h', 'cpu_avg_1h', 'rate_of_change', 'datapoint_count',
)


def save_metrics_to_dynamodb(metrics_list, account_id=None, user_id=None):
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    with table.batch_writer() as batch:
        for metric in metrics_list:
            for field in BASE_NUMERIC_FIELDS:
                metric[field] = Decimal(str(metric[field]))
            # Optional per-instance fields (network/disk/status-check/CWAgent) —
            # convert whichever floats/ints are actually present.
            for key, value in list(metric.items()):
                if key not in BASE_NUMERIC_FIELDS and isinstance(value, (int, float)) and not isinstance(value, bool):
                    metric[key] = Decimal(str(value))
            if account_id:
                metric['account_id'] = account_id
            if user_id:
                metric['user_id'] = user_id
            batch.put_item(Item=metric)
    print(f"Saved {len(metrics_list)} metrics for account {account_id}")


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        return super().default(obj)


# Accounts with more running instances than this get split into sub-batches
# and re-queued instead of being processed in one (15-minute-capped) invocation.
INSTANCE_BATCH_SIZE = 500


def _enqueue_instance_batches(user, instance_ids):
    """Re-queue a large account's instances as several smaller SQS messages on
    the same collector queue (and DLQ), so no single invocation has to walk
    thousands of instances before the Lambda timeout kills it."""
    queue_url = os.environ['COLLECTOR_QUEUE_URL']
    sqs = boto3.client('sqs', region_name='us-east-1')
    batch_count = 0
    for i in range(0, len(instance_ids), INSTANCE_BATCH_SIZE):
        batch = {**user, 'instance_ids': instance_ids[i:i + INSTANCE_BATCH_SIZE]}
        sqs.send_message(QueueUrl=queue_url, MessageBody=json.dumps(batch, cls=DecimalEncoder))
        batch_count += 1
    print(f"Split {len(instance_ids)} instances for {user.get('account_id')} into {batch_count} batches")


def collect_for_user(user):
    """Collect metrics for a connected account, or for one pre-chunked batch of
    that account's instances (see _enqueue_instance_batches). Raises on failure
    so the SQS event source retries and, after exhausting retries, routes the
    message to the DLQ instead of the failure disappearing silently."""
    role_arn = user.get('role_arn')
    region = user.get('region', 'us-east-1')
    account_id = user.get('account_id')
    user_id = user.get('user_id')
    print(f"Collecting for user {user_id}, account {account_id}, region {region}")

    start_time = time.time()

    instance_ids = user.get('instance_ids')
    if instance_ids is None:
        ec2 = get_assumed_client('ec2', role_arn, region)
        instance_ids = list_running_instances(ec2)
        print(f"Found {len(instance_ids)} running instances for {account_id}")

        if len(instance_ids) > INSTANCE_BATCH_SIZE:
            _enqueue_instance_batches(user, instance_ids)
            print(f"Dispatch for account {account_id} took {time.time() - start_time:.2f}s "
                  f"({len(instance_ids)} instances, split into batches)")
            return 0

    cloudwatch = get_assumed_client('cloudwatch', role_arn, region)
    metrics_by_instance = collect_ec2_metrics_batch(cloudwatch, instance_ids)

    cwagent_instances = discover_cwagent_metrics(cloudwatch, list(metrics_by_instance.keys()))
    cwagent_values = collect_cwagent_metrics(cloudwatch, cwagent_instances)
    for instance_id, values in (cwagent_values or {}).items():
        metrics_by_instance[instance_id].update(values)

    all_metrics = list(metrics_by_instance.values())
    if all_metrics:
        save_metrics_to_dynamodb(all_metrics, account_id=account_id, user_id=user_id)

    print(f"Collection for account {account_id} took {time.time() - start_time:.2f}s "
          f"({len(instance_ids)} instances scanned, {len(all_metrics)} metrics saved)")
    return len(all_metrics)


def dispatch_users():
    """Fan out: enqueue one SQS message per connected account instead of looping
    through every account serially inside a single (15-minute-capped) invocation."""
    users = get_all_users()
    if not users:
        print("No connected accounts found")
        return {'statusCode': 200, 'body': json.dumps({'message': 'No accounts to scan'})}

    queue_url = os.environ['COLLECTOR_QUEUE_URL']
    sqs = boto3.client('sqs', region_name='us-east-1')
    for user in users:
        sqs.send_message(QueueUrl=queue_url, MessageBody=json.dumps(user, cls=DecimalEncoder))

    cleanup_stale_metrics()
    return {
        'statusCode': 200,
        'body': json.dumps({'message': f'Dispatched {len(users)} accounts to the collector queue'})
    }


def main(event=None, context=None):
    if event and event.get('Records') and event['Records'][0].get('eventSource') == 'aws:sqs':
        total_collected = 0
        for record in event['Records']:
            user = json.loads(record['body'])
            total_collected += collect_for_user(user)
        return {'statusCode': 200, 'body': json.dumps({'message': f'Collected {total_collected} metrics'})}

    print("Dispatching metrics collection to the collector queue...")
    return dispatch_users()


if __name__ == '__main__':
    result = main()
    print(result['body'])