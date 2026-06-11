import boto3
import json
import decimal
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()

# ── Cross-account role assumption ─────────────────────────
def get_user_role():
    """Get connected account's role ARN from users table"""
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table('cloud-guardian-users')
        result = table.get_item(Key={'user_id': 'default-user'})
        item = result.get('Item', {})
        return item.get('role_arn'), item.get('region', 'us-east-1'), item.get('account_id')
    except Exception as e:
        print(f"Error getting user role: {e}")
        return None, 'us-east-1', None

def get_assumed_client(service, role_arn, region):
    """Returns boto3 client using user's cross-account role"""
    if not role_arn:
        return boto3.client(service, region_name=region)
    try:
        sts = boto3.client('sts')
        assumed = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName='CloudGuardianCollector'
        )
        creds = assumed['Credentials']
        return boto3.client(
            service,
            region_name=region,
            aws_access_key_id=creds['AccessKeyId'],
            aws_secret_access_key=creds['SecretAccessKey'],
            aws_session_token=creds['SessionToken']
        )
    except Exception as e:
        print(f"Role assumption failed: {e} — using own credentials")
        return boto3.client(service, region_name=region)

def collect_ec2_metrics(cloudwatch, instance_id):
    """Pull CPU utilization for a given EC2 instance"""
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=1)

    response = cloudwatch.get_metric_statistics(
        Namespace='AWS/EC2',
        MetricName='CPUUtilization',
        Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
        StartTime=start_time,
        EndTime=end_time,
        Period=300,
        Statistics=['Average', 'Maximum']
    )

    datapoints = response.get('Datapoints', [])
    if not datapoints:
        return None

    datapoints.sort(key=lambda x: x['Timestamp'])
    latest = datapoints[-1]

    return {
        'instance_id': instance_id,
        'cpu_avg': round(latest['Average'], 2),
        'cpu_max': round(latest['Maximum'], 2),
        'timestamp': latest['Timestamp'].isoformat(),
        'collected_at': datetime.now(timezone.utc).isoformat()
    }

def cleanup_stale_metrics():
    """Remove metrics older than 24 hours from DynamoDB"""
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
    """Get all running EC2 instance IDs"""
    response = ec2.describe_instances(
        Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]
    )
    instance_ids = []
    for reservation in response['Reservations']:
        for instance in reservation['Instances']:
            instance_ids.append(instance['InstanceId'])
    return instance_ids

def save_metrics_to_dynamodb(metrics_list, account_id=None):
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    for metric in metrics_list:
        metric['cpu_avg'] = Decimal(str(metric['cpu_avg']))
        metric['cpu_max'] = Decimal(str(metric['cpu_max']))
        # Tag with account_id so dashboard can filter by user
        if account_id:
            metric['account_id'] = account_id
        table.put_item(Item=metric)
    print(f"Saved {len(metrics_list)} metrics to DynamoDB")

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        return super().default(obj)

def main(event=None, context=None):
    print("Starting metrics collection...")

    # ── Get user's connected account role ─────────────────
    role_arn, region, account_id = get_user_role()
    print(f"Collecting for account: {account_id}, region: {region}, role: {role_arn}")

    # ── Use assumed role clients ───────────────────────────
    ec2 = get_assumed_client('ec2', role_arn, region)
    cloudwatch = get_assumed_client('cloudwatch', role_arn, region)

    instance_ids = list_running_instances(ec2)
    print(f"Found {len(instance_ids)} running instances: {instance_ids}")

    all_metrics = []
    for instance_id in instance_ids:
        metrics = collect_ec2_metrics(cloudwatch, instance_id)
        if metrics:
            all_metrics.append(metrics)
            print(f"Collected metrics for {instance_id}: CPU avg={metrics['cpu_avg']}%")

    if all_metrics:
        save_metrics_to_dynamodb(all_metrics, account_id=account_id)

    cleanup_stale_metrics()

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': f'Collected metrics for {len(all_metrics)} instances',
            'account_id': account_id,
            'region': region,
        }, cls=DecimalEncoder)
    }

if __name__ == '__main__':
    result = main()
    print(json.dumps(json.loads(result['body']), indent=2))