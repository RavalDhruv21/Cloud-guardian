import boto3
import json
import decimal
import os
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

def get_assumed_client(service, role_arn, region):
    if not role_arn:
        return boto3.client(service, region_name=region)
    try:
        sts = boto3.client('sts')
        assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName='CloudGuardianCollector')
        creds = assumed['Credentials']
        return boto3.client(service, region_name=region,
            aws_access_key_id=creds['AccessKeyId'],
            aws_secret_access_key=creds['SecretAccessKey'],
            aws_session_token=creds['SessionToken'])
    except Exception as e:
        print(f"Role assumption failed: {e} — using own credentials")
        return boto3.client(service, region_name=region)

def collect_ec2_metrics(cloudwatch, instance_id):
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=1)
    response = cloudwatch.get_metric_statistics(
        Namespace='AWS/EC2', MetricName='CPUUtilization',
        Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
        StartTime=start_time, EndTime=end_time, Period=300, Statistics=['Average', 'Maximum']
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
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    result = table.scan()
    items = result.get('Items', [])
    deleted = 0
    for item in items:
        if item.get('timestamp', '') < cutoff:
            table.delete_item(Key={'instance_id': item['instance_id'], 'timestamp': item['timestamp']})
            deleted += 1
    if deleted > 0:
        print(f"Cleaned up {deleted} stale metric records")

def list_running_instances(ec2):
    response = ec2.describe_instances(Filters=[{'Name': 'instance-state-name', 'Values': ['running']}])
    return [inst['InstanceId'] for r in response['Reservations'] for inst in r['Instances']]

def save_metrics_to_dynamodb(metrics_list, account_id=None, user_id=None):
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    for metric in metrics_list:
        metric['cpu_avg'] = Decimal(str(metric['cpu_avg']))
        metric['cpu_max'] = Decimal(str(metric['cpu_max']))
        if account_id:
            metric['account_id'] = account_id
        if user_id:
            metric['user_id'] = user_id
        table.put_item(Item=metric)
    print(f"Saved {len(metrics_list)} metrics for account {account_id}")

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        return super().default(obj)

def main(event=None, context=None):
    print("Starting metrics collection for all users...")
    users = get_all_users()

    if not users:
        print("No connected accounts found")
        return {'statusCode': 200, 'body': json.dumps({'message': 'No accounts to scan'})}

    total_collected = 0
    for user in users:
        role_arn = user.get('role_arn')
        region = user.get('region', 'us-east-1')
        account_id = user.get('account_id')
        user_id = user.get('user_id')
        print(f"Collecting for user {user_id}, account {account_id}, region {region}")

        ec2 = get_assumed_client('ec2', role_arn, region)
        cloudwatch = get_assumed_client('cloudwatch', role_arn, region)

        try:
            instance_ids = list_running_instances(ec2)
            print(f"Found {len(instance_ids)} running instances for {account_id}")
            all_metrics = []
            for instance_id in instance_ids:
                metrics = collect_ec2_metrics(cloudwatch, instance_id)
                if metrics:
                    all_metrics.append(metrics)
            if all_metrics:
                save_metrics_to_dynamodb(all_metrics, account_id=account_id, user_id=user_id)
                total_collected += len(all_metrics)
        except Exception as e:
            print(f"Error collecting for account {account_id}: {e}")

    cleanup_stale_metrics()
    return {'statusCode': 200, 'body': json.dumps({'message': f'Collected {total_collected} metrics across {len(users)} accounts'}, cls=DecimalEncoder)}

if __name__ == '__main__':
    result = main()
    print(result['body'])