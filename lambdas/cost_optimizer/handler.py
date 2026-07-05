import json
import boto3
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')

def get_all_users():
    try:
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
        assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName='CloudGuardianCostOptimizer')
        creds = assumed['Credentials']
        return boto3.client(service, region_name=region,
            aws_access_key_id=creds['AccessKeyId'],
            aws_secret_access_key=creds['SecretAccessKey'],
            aws_session_token=creds['SessionToken'])
    except Exception as e:
        raise RoleAssumptionError(f"Role assumption failed for {role_arn}: {e}") from e

def get_ec2_hourly_price(instance_type, region='us-east-1'):
    try:
        pricing = boto3.client('pricing', region_name='us-east-1')
        region_map = {'us-east-1': 'US East (N. Virginia)', 'us-east-2': 'US East (Ohio)',
            'us-west-1': 'US West (N. California)', 'us-west-2': 'US West (Oregon)',
            'ap-south-1': 'Asia Pacific (Mumbai)', 'ap-southeast-1': 'Asia Pacific (Singapore)',
            'eu-west-1': 'Europe (Ireland)'}
        response = pricing.get_products(ServiceCode='AmazonEC2', Filters=[
            {'Type': 'TERM_MATCH', 'Field': 'instanceType', 'Value': instance_type},
            {'Type': 'TERM_MATCH', 'Field': 'location', 'Value': region_map.get(region, 'US East (N. Virginia)')},
            {'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': 'Linux'},
            {'Type': 'TERM_MATCH', 'Field': 'tenancy', 'Value': 'Shared'},
            {'Type': 'TERM_MATCH', 'Field': 'capacitystatus', 'Value': 'Used'},
            {'Type': 'TERM_MATCH', 'Field': 'preInstalledSw', 'Value': 'NA'},
        ], MaxResults=1)
        if response['PriceList']:
            price_item = json.loads(response['PriceList'][0])
            for term in price_item['terms']['OnDemand'].values():
                for price_dim in term['priceDimensions'].values():
                    price = float(price_dim['pricePerUnit']['USD'])
                    if price > 0:
                        return price
    except Exception as e:
        print(f"Pricing API error: {e}")
    fallback = {'t2.micro': 0.0116, 't2.small': 0.023, 't3.micro': 0.0104, 't3.small': 0.0208,
        't3.medium': 0.0416, 't3.large': 0.0832, 't3.xlarge': 0.1664, 'm5.large': 0.096,
        'c5.large': 0.085, 'r5.large': 0.126}
    return fallback.get(instance_type, 0.05)


def get_rds_hourly_price(instance_type, region='us-east-1'):
    try:
        pricing = boto3.client('pricing', region_name='us-east-1')
        region_map = {
            'us-east-1': 'US East (N. Virginia)',
            'us-west-2': 'US West (Oregon)',
            'ap-south-1': 'Asia Pacific (Mumbai)',
        }
        location = region_map.get(region, 'US East (N. Virginia)')
        response = pricing.get_products(
            ServiceCode='AmazonRDS',
            Filters=[
                {'Type': 'TERM_MATCH', 'Field': 'instanceType', 'Value': instance_type},
                {'Type': 'TERM_MATCH', 'Field': 'location', 'Value': location},
                {'Type': 'TERM_MATCH', 'Field': 'databaseEngine', 'Value': 'MySQL'},
                {'Type': 'TERM_MATCH', 'Field': 'deploymentOption', 'Value': 'Single-AZ'},
            ],
            MaxResults=1
        )
        if response['PriceList']:
            price_item = json.loads(response['PriceList'][0])
            terms = price_item['terms']['OnDemand']
            for term in terms.values():
                for price_dim in term['priceDimensions'].values():
                    price = float(price_dim['pricePerUnit']['USD'])
                    if price > 0:
                        return price
    except Exception as e:
        print(f"RDS Pricing error: {e}")
    fallback = {
        'db.t3.micro': 0.017, 'db.t3.small': 0.034,
        'db.t3.medium': 0.068, 'db.t3.large': 0.136,
        'db.m5.large': 0.171, 'db.m5.xlarge': 0.342,
    }
    return fallback.get(instance_type, 0.05)

def get_rds_connections_avg(cloudwatch, db_id, days=3):
    try:
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)
        result = cloudwatch.get_metric_statistics(
            Namespace='AWS/RDS',
            MetricName='DatabaseConnections',
            Dimensions=[{'Name': 'DBInstanceIdentifier', 'Value': db_id}],
            StartTime=start,
            EndTime=end,
            Period=86400,
            Statistics=['Average']
        )
        points = result.get('Datapoints', [])
        if not points:
            return 0
        return sum(p['Average'] for p in points) / len(points)
    except:
        return 0

def get_cpu_avg(cloudwatch, instance_id, region, days=7):
    try:
        end = datetime.now(timezone.utc)
        result = cloudwatch.get_metric_statistics(
            Namespace='AWS/EC2', MetricName='CPUUtilization',
            Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
            StartTime=end - timedelta(days=days), EndTime=end, Period=86400, Statistics=['Average']
        )
        points = result.get('Datapoints', [])
        return sum(p['Average'] for p in points) / len(points) if points else None
    except Exception as e:
        print(f"CloudWatch error: {e}")
        return None
    

def downsize_recommendation(instance_type):
    downsize_map = {'t3.2xlarge': 't3.xlarge', 't3.xlarge': 't3.large', 't3.large': 't3.medium',
        't3.medium': 't3.small', 't3.small': 't3.micro', 't2.large': 't2.medium',
        't2.medium': 't2.small', 't2.small': 't2.micro', 'm5.xlarge': 'm5.large',
        'c5.xlarge': 'c5.large', 'r5.xlarge': 'r5.large'}
    return downsize_map.get(instance_type)

def save_suggestion(account_id, user_id, region, resource_id, resource_type, issue, recommendation, saving_per_month, instance_type='', days_idle=0):
    table = dynamodb.Table(os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions'))
    
    existing = table.query(
        KeyConditionExpression=Key('account_id').eq(account_id),
        FilterExpression=Attr('resource_id').eq(resource_id) & Attr('status').eq('open')
    )
    
    if existing.get('Items'):
        item = existing['Items'][0]
        table.update_item(
            Key={'account_id': account_id, 'timestamp': item['timestamp']},
            UpdateExpression="SET issue = :i, recommendation = :r, saving_per_month = :s, days_idle = :d",
            ExpressionAttributeValues={
                ':i': issue,
                ':r': recommendation,
                ':s': Decimal(str(round(saving_per_month, 2))),
                ':d': days_idle
            }
        )
        return

    table.put_item(Item={
        'account_id': account_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'user_id': user_id,
        'resource_id': resource_id,
        'resource_type': resource_type,
        'issue': issue,
        'recommendation': recommendation,
        'saving_per_month': Decimal(str(round(saving_per_month, 2))),
        'instance_type': instance_type,
        'days_idle': days_idle,
        'region': region,
        'status': 'open',
        'created_at': datetime.now(timezone.utc).isoformat(),
    })

def scan_account(role_arn, region, account_id, user_id):
    ec2 = get_assumed_client('ec2', role_arn, region)
    cloudwatch = get_assumed_client('cloudwatch', role_arn, region)
    hours_per_month = 730

    # EC2
    try:
        instances = ec2.describe_instances(Filters=[{'Name': 'instance-state-name', 'Values': ['running']}])
        for reservation in instances['Reservations']:
            for inst in reservation['Instances']:
                instance_id = inst['InstanceId']
                instance_type = inst['InstanceType']
                hourly_price = get_ec2_hourly_price(instance_type, region)
                monthly_price = hourly_price * hours_per_month
                cpu_avg = get_cpu_avg(cloudwatch, instance_id, region, days=7)
                if cpu_avg is None:
                    continue
                if cpu_avg < 5.0:
                    save_suggestion(account_id, user_id, region, instance_id, 'EC2',
                        f'CPU avg {round(cpu_avg, 1)}% over 7 days - idle instance',
                        f'Stop or terminate. Saving ${round(monthly_price, 2)}/month',
                        monthly_price, instance_type, 7)
                elif cpu_avg < 20.0:
                    target_type = downsize_recommendation(instance_type)
                    if target_type:
                        saving = (hourly_price - get_ec2_hourly_price(target_type, region)) * hours_per_month
                        if saving > 1.0:
                            save_suggestion(account_id, user_id, region, instance_id, 'EC2',
                                f'CPU avg {round(cpu_avg, 1)}% on {instance_type} - oversized',
                                f'Downsize to {target_type} - save ${round(saving, 2)}/month',
                                saving, instance_type, 0)
    except Exception as e:
        print(f"EC2 scan error for {account_id}: {e}")

    # EBS
    try:
        volumes = ec2.describe_volumes(Filters=[{'Name': 'status', 'Values': ['available']}])
        for vol in volumes['Volumes']:
            size_gb = vol['Size']
            vol_type = vol['VolumeType']
            saving = size_gb * {'gp2': 0.10, 'gp3': 0.08, 'io1': 0.125}.get(vol_type, 0.10)
            create_time = vol.get('CreateTime', datetime.now(timezone.utc))
            days = (datetime.now(timezone.utc) - create_time.replace(tzinfo=timezone.utc)).days
            if days >= 3:
                save_suggestion(account_id, user_id, region, vol['VolumeId'], 'EBS',
                    f'EBS unattached for {days} days',
                    f'Delete {size_gb}GB {vol_type} volume. Saving ${round(saving, 2)}/month',
                    saving, f'{vol_type}-{size_gb}GB', days)
    except Exception as e:
        print(f"EBS scan error: {e}")

    # Elastic IPs
    try:
        eips = ec2.describe_addresses()
        for eip in eips['Addresses']:
            if not eip.get('InstanceId') and not eip.get('NetworkInterfaceId'):
                save_suggestion(account_id, user_id, region,
                    eip.get('AllocationId', eip.get('PublicIp')), 'ElasticIP',
                    'Elastic IP not attached to any instance',
                    f'Release this IP. Saving ${round(0.005 * hours_per_month, 2)}/month',
                    0.005 * hours_per_month, 'N/A', 0)
    except Exception as e:
        print(f"EIP scan error: {e}")

def main(event, context):
    users = get_all_users()
    print(f"Cost scan for {len(users)} connected accounts")

    if not users:
        return {'statusCode': 200, 'body': json.dumps({'message': 'No accounts to scan'})}

    for user in users:
        role_arn = user.get('role_arn')
        region = user.get('region', 'us-east-1')
        account_id = user.get('account_id')
        user_id = user.get('user_id')
        if not account_id:
            continue
        print(f"Scanning account {account_id} for user {user_id}")
        try:
            scan_account(role_arn, region, account_id, user_id)
        except Exception as e:
            print(f"Error scanning {account_id}: {e}")

    return {'statusCode': 200, 'body': json.dumps({'message': f'Cost scan complete for {len(users)} accounts'})}