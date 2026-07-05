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


class RoleAssumptionError(Exception):
    """Raised when assuming the customer's IAM role fails — callers must fail
    closed rather than fall back to the Lambda's own AWS credentials, which
    could act on the wrong AWS account."""

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
        raise RoleAssumptionError(f"Role assumption failed for {role_arn}: {e}") from e


def collect_ec2_metrics(cloudwatch, instance_id):
    """
    Collect 24h of CloudWatch data for an instance and return an enriched
    metric object that includes cpu_avg_24h, cpu_max (peak), and
    sustained_high_minutes (total minutes where avg CPU > 80%).

    This enriched data is stored to DynamoDB so the DynamoDB stream trigger
    for ai_analyzer has full context — not just the latest 5-min snapshot.
    """
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=24)

    response = cloudwatch.get_metric_statistics(
        Namespace='AWS/EC2',
        MetricName='CPUUtilization',
        Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
        StartTime=start_time,
        EndTime=end_time,
        Period=300,   # 5-minute granularity
        Statistics=['Average', 'Maximum']
    )
    datapoints = response.get('Datapoints', [])
    if not datapoints:
        return None

    datapoints.sort(key=lambda x: x['Timestamp'])
    latest = datapoints[-1]

    avg_values = [dp['Average'] for dp in datapoints]
    max_values = [dp['Maximum'] for dp in datapoints]

    # Each datapoint = 5 minutes; count how many had avg CPU > 80%
    sustained_high_minutes = sum(1 for v in avg_values if v > 80.0) * 5

    return {
        'instance_id': instance_id,
        'cpu_avg': round(latest['Average'], 2),                      # latest 5-min snapshot
        'cpu_max': round(max(max_values), 2),                        # peak over 24h
        'cpu_avg_24h': round(sum(avg_values) / len(avg_values), 2),  # 24h mean
        'sustained_high_minutes': sustained_high_minutes,            # total mins > 80%
        'datapoint_count': len(datapoints),
        'timestamp': latest['Timestamp'].isoformat(),
        'collected_at': datetime.now(timezone.utc).isoformat(),
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
            table.delete_item(Key={
                'instance_id': item['instance_id'],
                'timestamp': item['timestamp']
            })
            deleted += 1
    if deleted > 0:
        print(f"Cleaned up {deleted} stale metric records")


def list_running_instances(ec2):
    response = ec2.describe_instances(
        Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]
    )
    return [inst['InstanceId'] for r in response['Reservations'] for inst in r['Instances']]


def save_metrics_to_dynamodb(metrics_list, account_id=None, user_id=None):
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    for metric in metrics_list:
        # Convert all float fields to Decimal for DynamoDB
        metric['cpu_avg'] = Decimal(str(metric['cpu_avg']))
        metric['cpu_max'] = Decimal(str(metric['cpu_max']))
        metric['cpu_avg_24h'] = Decimal(str(metric['cpu_avg_24h']))
        metric['sustained_high_minutes'] = Decimal(str(metric['sustained_high_minutes']))
        metric['datapoint_count'] = Decimal(str(metric['datapoint_count']))
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

        try:
            ec2 = get_assumed_client('ec2', role_arn, region)
            cloudwatch = get_assumed_client('cloudwatch', role_arn, region)
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
    return {
        'statusCode': 200,
        'body': json.dumps(
            {'message': f'Collected {total_collected} metrics across {len(users)} accounts'},
            cls=DecimalEncoder
        )
    }


if __name__ == '__main__':
    result = main()
    print(result['body'])