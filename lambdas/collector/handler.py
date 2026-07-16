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


def collect_ec2_metrics_batch(cloudwatch, instance_ids):
    """
    Collect 24h of CloudWatch CPU data for a batch of instances using
    get_metric_data instead of one get_metric_statistics call per instance.
    GetMetricData allows up to 500 metric queries per call; we need 2
    queries (avg + max) per instance, so instances are chunked at 250/call.

    Returns a dict of instance_id -> enriched metric object (cpu_avg_24h,
    cpu_max peak, sustained_high_minutes), stored to DynamoDB so the
    DynamoDB stream trigger for ai_analyzer has full context — not just
    the latest 5-min snapshot. Instances with no datapoints are omitted.
    """
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=24)

    results = {}
    chunk_size = 250
    for i in range(0, len(instance_ids), chunk_size):
        chunk = instance_ids[i:i + chunk_size]
        queries = []
        for idx, instance_id in enumerate(chunk):
            dims = [{'Name': 'InstanceId', 'Value': instance_id}]
            metric_stat = {'Metric': {'Namespace': 'AWS/EC2', 'MetricName': 'CPUUtilization', 'Dimensions': dims},
                            'Period': 300}
            queries.append({'Id': f'avg{idx}', 'MetricStat': {**metric_stat, 'Stat': 'Average'}, 'ReturnData': True})
            queries.append({'Id': f'max{idx}', 'MetricStat': {**metric_stat, 'Stat': 'Maximum'}, 'ReturnData': True})

        avg_by_idx = {}
        max_by_idx = {}
        paginator = cloudwatch.get_paginator('get_metric_data')
        for page in paginator.paginate(MetricDataQueries=queries, StartTime=start_time, EndTime=end_time,
                                        ScanBy='TimestampAscending'):
            for r in page['MetricDataResults']:
                target = avg_by_idx if r['Id'].startswith('avg') else max_by_idx
                idx = int(r['Id'][3:])
                bucket = target.setdefault(idx, {'timestamps': [], 'values': []})
                bucket['timestamps'].extend(r['Timestamps'])
                bucket['values'].extend(r['Values'])

        for idx, instance_id in enumerate(chunk):
            avg_data = avg_by_idx.get(idx)
            if not avg_data or not avg_data['values']:
                continue
            paired = sorted(zip(avg_data['timestamps'], avg_data['values']))
            avg_values = [v for _, v in paired]
            latest_ts, latest_avg = paired[-1]
            max_values = max_by_idx.get(idx, {}).get('values') or avg_values

            # Each datapoint = 5 minutes; count how many had avg CPU > 80%
            sustained_high_minutes = sum(1 for v in avg_values if v > 80.0) * 5

            # Raw stats for the ai_analyzer anomaly model — trained on
            # cpu_avg/cpu_max/cpu_avg_24h/sustained_high_minutes plus these
            # three (z-score and short-vs-long-window deviation are derived
            # from cpu_std_24h/cpu_avg_1h at inference time; see
            # ai_analyzer/handler.py's build_feature_vector).
            cpu_std_24h = statistics.pstdev(avg_values) if len(avg_values) > 1 else 0.0
            recent_window = avg_values[-12:]  # last 1h at 5-min granularity
            cpu_avg_1h = sum(recent_window) / len(recent_window)
            rate_of_change = avg_values[-1] - avg_values[-2] if len(avg_values) > 1 else 0.0

            results[instance_id] = {
                'instance_id': instance_id,
                'cpu_avg': round(latest_avg, 2),                          # latest 5-min snapshot
                'cpu_max': round(max(max_values), 2),                     # peak over 24h
                'cpu_avg_24h': round(sum(avg_values) / len(avg_values), 2),  # 24h mean
                'sustained_high_minutes': sustained_high_minutes,         # total mins > 80%
                'cpu_std_24h': round(cpu_std_24h, 4),
                'cpu_avg_1h': round(cpu_avg_1h, 2),
                'rate_of_change': round(rate_of_change, 2),
                'datapoint_count': len(avg_values),
                'timestamp': latest_ts.isoformat(),
                'collected_at': datetime.now(timezone.utc).isoformat(),
            }
    return results


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


def save_metrics_to_dynamodb(metrics_list, account_id=None, user_id=None):
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    with table.batch_writer() as batch:
        for metric in metrics_list:
            # Convert all float fields to Decimal for DynamoDB
            metric['cpu_avg'] = Decimal(str(metric['cpu_avg']))
            metric['cpu_max'] = Decimal(str(metric['cpu_max']))
            metric['cpu_avg_24h'] = Decimal(str(metric['cpu_avg_24h']))
            metric['sustained_high_minutes'] = Decimal(str(metric['sustained_high_minutes']))
            metric['cpu_std_24h'] = Decimal(str(metric['cpu_std_24h']))
            metric['cpu_avg_1h'] = Decimal(str(metric['cpu_avg_1h']))
            metric['rate_of_change'] = Decimal(str(metric['rate_of_change']))
            metric['datapoint_count'] = Decimal(str(metric['datapoint_count']))
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
    all_metrics = list(collect_ec2_metrics_batch(cloudwatch, instance_ids).values())
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