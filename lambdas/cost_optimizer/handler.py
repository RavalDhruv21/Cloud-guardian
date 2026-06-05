import boto3
import json
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()

def get_ec2_client():
    return boto3.client('ec2', region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1'))

def get_cloudwatch_client():
    return boto3.client('cloudwatch', region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1'))

def get_rds_client():
    return boto3.client('rds', region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1'))

def check_idle_ec2_instances(ec2, cloudwatch):
    """Find EC2 instances with very low CPU for 7+ days"""
    suggestions = []

    response = ec2.describe_instances(
        Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]
    )

    for reservation in response['Reservations']:
        for instance in reservation['Instances']:
            instance_id = instance['InstanceId']
            instance_type = instance['InstanceType']

            # Get average CPU for last 7 days
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(days=7)

            metrics = cloudwatch.get_metric_statistics(
                Namespace='AWS/EC2',
                MetricName='CPUUtilization',
                Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
                StartTime=start_time,
                EndTime=end_time,
                Period=86400,  # 1 day intervals
                Statistics=['Average']
            )

            if not metrics['Datapoints']:
                continue

            avg_cpu = sum(d['Average'] for d in metrics['Datapoints']) / len(metrics['Datapoints'])

            # Flag as idle if average CPU below 5%
            if avg_cpu < 5.0:
                suggestions.append({
                    'resource_type': 'EC2',
                    'resource_id': instance_id,
                    'instance_type': instance_type,
                    'issue': f'Instance idle — avg CPU {round(avg_cpu, 2)}% over 7 days',
                    'recommendation': 'Stop or terminate this instance',
                    'estimated_monthly_saving': '$10-50 depending on instance type',
                    'severity': 'high'
                })
                print(f"Idle EC2 found: {instance_id} — avg CPU: {round(avg_cpu, 2)}%")

    return suggestions

def check_unattached_ebs_volumes(ec2):
    """Find EBS volumes not attached to any instance"""
    suggestions = []

    response = ec2.describe_volumes(
        Filters=[{'Name': 'status', 'Values': ['available']}]
    )

    for volume in response['Volumes']:
        volume_id = volume['VolumeId']
        size_gb = volume['Size']
        volume_type = volume['VolumeType']

        monthly_cost = round(size_gb * 0.10, 2)  # ~$0.10 per GB for gp2

        suggestions.append({
            'resource_type': 'EBS',
            'resource_id': volume_id,
            'issue': f'Unattached EBS volume — {size_gb}GB {volume_type}',
            'recommendation': 'Take a snapshot then delete the volume',
            'estimated_monthly_saving': f'${monthly_cost}/mo',
            'severity': 'medium'
        })
        print(f"Unattached EBS: {volume_id} — {size_gb}GB — saving ${monthly_cost}/mo")

    return suggestions

def check_unused_elastic_ips(ec2):
    """Find Elastic IPs not attached to any instance"""
    suggestions = []

    response = ec2.describe_addresses()

    for address in response['Addresses']:
        if 'InstanceId' not in address and 'NetworkInterfaceId' not in address:
            suggestions.append({
                'resource_type': 'ElasticIP',
                'resource_id': address.get('PublicIp', 'unknown'),
                'issue': 'Elastic IP reserved but not attached to any resource',
                'recommendation': 'Release this Elastic IP if not needed',
                'estimated_monthly_saving': '$3.60/mo',
                'severity': 'low'
            })
            print(f"Unused Elastic IP: {address.get('PublicIp')}")

    return suggestions

def check_idle_rds_instances(rds, cloudwatch):
    """Find RDS instances with zero connections"""
    suggestions = []

    response = rds.describe_db_instances()

    for db in response['DBInstances']:
        db_id = db['DBInstanceIdentifier']
        db_class = db['DBInstanceClass']

        if db['DBInstanceStatus'] != 'available':
            continue

        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(days=3)

        metrics = cloudwatch.get_metric_statistics(
            Namespace='AWS/RDS',
            MetricName='DatabaseConnections',
            Dimensions=[{'Name': 'DBInstanceIdentifier', 'Value': db_id}],
            StartTime=start_time,
            EndTime=end_time,
            Period=86400,
            Statistics=['Average']
        )

        if not metrics['Datapoints']:
            continue

        avg_connections = sum(d['Average'] for d in metrics['Datapoints']) / len(metrics['Datapoints'])

        if avg_connections < 1:
            suggestions.append({
                'resource_type': 'RDS',
                'resource_id': db_id,
                'instance_class': db_class,
                'issue': f'RDS instance with 0 connections for 3+ days',
                'recommendation': 'Stop the RDS instance — can be restarted anytime',
                'estimated_monthly_saving': '$15-50 depending on instance class',
                'severity': 'high'
            })
            print(f"Idle RDS: {db_id} — avg connections: {round(avg_connections, 2)}")

    return suggestions

def save_suggestions(suggestions):
    """Save all cost suggestions to DynamoDB"""
    if not suggestions:
        print("No cost suggestions found")
        return

    dynamodb = boto3.resource(
        'dynamodb',
        region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
    )
    table = dynamodb.Table(
        os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions')
    )

    timestamp = datetime.now(timezone.utc).isoformat()

    for suggestion in suggestions:
        table.put_item(Item={
            'account_id': os.getenv('AWS_ACCOUNT_ID', 'local-dev'),
            'timestamp': timestamp,
            'resource_type': suggestion['resource_type'],
            'resource_id': suggestion['resource_id'],
            'issue': suggestion['issue'],
            'recommendation': suggestion['recommendation'],
            'estimated_saving': suggestion['estimated_monthly_saving'],
            'severity': suggestion['severity'],
            'status': 'pending'
        })

    print(f"Saved {len(suggestions)} cost suggestions to DynamoDB")

def main(event=None, context=None):
    """Lambda handler"""
    print("Starting cost optimization scan...")

    ec2 = get_ec2_client()
    cloudwatch = get_cloudwatch_client()
    rds = get_rds_client()

    all_suggestions = []

    all_suggestions.extend(check_idle_ec2_instances(ec2, cloudwatch))
    all_suggestions.extend(check_unattached_ebs_volumes(ec2))
    all_suggestions.extend(check_unused_elastic_ips(ec2))
    all_suggestions.extend(check_idle_rds_instances(rds, cloudwatch))

    save_suggestions(all_suggestions)

    print(f"Scan complete — {len(all_suggestions)} suggestions found")

    return {
        'statusCode': 200,
        'body': json.dumps({
            'suggestions_found': len(all_suggestions),
            'suggestions': all_suggestions
        })
    }

if __name__ == '__main__':
    result = main()
    print(json.dumps(json.loads(result['body']), indent=2))
    
    