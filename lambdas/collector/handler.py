import boto3
import json
import decimal
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()

def get_cloudwatch_client():
    return boto3.client(
        'cloudwatch',
        region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
    )

def get_ec2_client():
    return boto3.client(
        'ec2',
        region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
    )

def collect_ec2_metrics(cloudwatch, instance_id):
    """Pull CPU utilization for a given EC2 instance"""
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=1)

    response = cloudwatch.get_metric_statistics(
        Namespace='AWS/EC2',
        MetricName='CPUUtilization',
        Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
        StartTime=start_time,
        EndTime=end_time,
        Period=300,  # 5 minute intervals
        Statistics=['Average', 'Maximum']
    )

    datapoints = response.get('Datapoints', [])
    if not datapoints:
        return None

    # Sort by time and get latest
    datapoints.sort(key=lambda x: x['Timestamp'])
    latest = datapoints[-1]

    return {
        'instance_id': instance_id,
        'cpu_avg': round(latest['Average'], 2),
        'cpu_max': round(latest['Maximum'], 2),
        'timestamp': latest['Timestamp'].isoformat(),
        'collected_at': datetime.utcnow().isoformat()
    }
    
def cleanup_stale_metrics():
    """Remove metrics older than 24 hours from DynamoDB"""
    from datetime import timedelta
    
    dynamodb = boto3.resource('dynamodb', region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1'))
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    
    # Scan for old items
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

def save_metrics_to_dynamodb(metrics_list):
    dynamodb = boto3.resource(
        'dynamodb',
        region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
    )
    table_name = os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics')
    table = dynamodb.Table(table_name)

    for metric in metrics_list:
        metric['cpu_avg'] = Decimal(str(metric['cpu_avg']))
        metric['cpu_max'] = Decimal(str(metric['cpu_max']))
        table.put_item(Item=metric)

    print(f"Saved {len(metrics_list)} metrics to DynamoDB")

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        return super().default(obj)

def main(event=None, context=None):
    print("Starting metrics collection...")

    cloudwatch = get_cloudwatch_client()
    ec2 = get_ec2_client()

    instance_ids = list_running_instances(ec2)
    print(f"Found {len(instance_ids)} running instances: {instance_ids}")

    all_metrics = []
    for instance_id in instance_ids:
        metrics = collect_ec2_metrics(cloudwatch, instance_id)
        if metrics:
            all_metrics.append(metrics)
            print(f"Collected metrics for {instance_id}: CPU avg={metrics['cpu_avg']}%")

    if all_metrics:
        save_metrics_to_dynamodb(all_metrics)

    # ← Add this line
    cleanup_stale_metrics()

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': f'Collected metrics for {len(all_metrics)} instances',
        }, cls=DecimalEncoder)
    }

if __name__ == '__main__':
    result = main()
    print(json.dumps(json.loads(result['body']), indent=2))