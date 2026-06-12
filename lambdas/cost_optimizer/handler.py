import json
import boto3
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')

# ── Cross-account role assumption ─────────────────────────
def get_user_role():
    """Get connected account's role ARN from users table"""
    try:
        table = dynamodb.Table('cloud-guardian-users')
        result = table.get_item(Key={'user_id': 'default-user'})
        item = result.get('Item', {})
        return item.get('role_arn'), item.get('region', 'us-east-1'), item.get('account_id')
    except Exception as e:
        print(f"Error getting user role: {e}")
        return None, 'us-east-1', None

def get_assumed_client(service, role_arn, region):
    if not role_arn:
        return boto3.client(service, region_name=region)
    try:
        sts = boto3.client('sts')
        assumed = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName='CloudGuardianCostOptimizer'
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

def get_ec2_hourly_price(instance_type, region='us-east-1'):
    try:
        pricing = boto3.client('pricing', region_name='us-east-1')
        region_map = {
            'us-east-1': 'US East (N. Virginia)',
            'us-east-2': 'US East (Ohio)',
            'us-west-1': 'US West (N. California)',
            'us-west-2': 'US West (Oregon)',
            'ap-south-1': 'Asia Pacific (Mumbai)',
            'ap-southeast-1': 'Asia Pacific (Singapore)',
            'eu-west-1': 'Europe (Ireland)',
        }
        location = region_map.get(region, 'US East (N. Virginia)')
        response = pricing.get_products(
            ServiceCode='AmazonEC2',
            Filters=[
                {'Type': 'TERM_MATCH', 'Field': 'instanceType', 'Value': instance_type},
                {'Type': 'TERM_MATCH', 'Field': 'location', 'Value': location},
                {'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': 'Linux'},
                {'Type': 'TERM_MATCH', 'Field': 'tenancy', 'Value': 'Shared'},
                {'Type': 'TERM_MATCH', 'Field': 'capacitystatus', 'Value': 'Used'},
                {'Type': 'TERM_MATCH', 'Field': 'preInstalledSw', 'Value': 'NA'},
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
        print(f"Pricing API error: {e}")
    fallback = {
        't2.micro': 0.0116, 't2.small': 0.023, 't2.medium': 0.0464,
        't3.micro': 0.0104, 't3.small': 0.0208, 't3.medium': 0.0416,
        't3.large': 0.0832, 't3.xlarge': 0.1664, 't3.2xlarge': 0.3328,
        'm5.large': 0.096, 'm5.xlarge': 0.192, 'm5.2xlarge': 0.384,
        'c5.large': 0.085, 'c5.xlarge': 0.17,
        'r5.large': 0.126, 'r5.xlarge': 0.252,
    }
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

def get_cpu_avg(cloudwatch, instance_id, region, days=7):
    try:
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)
        result = cloudwatch.get_metric_statistics(
            Namespace='AWS/EC2',
            MetricName='CPUUtilization',
            Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
            StartTime=start,
            EndTime=end,
            Period=86400,
            Statistics=['Average']
        )
        points = result.get('Datapoints', [])
        if not points:
            return None
        return sum(p['Average'] for p in points) / len(points)
    except Exception as e:
        print(f"CloudWatch error: {e}")
        return None

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

def downsize_recommendation(instance_type):
    downsize_map = {
        't3.2xlarge': 't3.xlarge', 't3.xlarge': 't3.large',
        't3.large': 't3.medium', 't3.medium': 't3.small',
        't3.small': 't3.micro',
        't2.2xlarge': 't2.xlarge', 't2.xlarge': 't2.large',
        't2.large': 't2.medium', 't2.medium': 't2.small',
        't2.small': 't2.micro',
        'm5.2xlarge': 'm5.xlarge', 'm5.xlarge': 'm5.large',
        'c5.2xlarge': 'c5.xlarge', 'c5.xlarge': 'c5.large',
        'r5.2xlarge': 'r5.xlarge', 'r5.xlarge': 'r5.large',
    }
    return downsize_map.get(instance_type)

def save_suggestion(account_id, region, resource_id, resource_type,
                    issue, recommendation, saving_per_month,
                    instance_type='', days_idle=0):
    table = dynamodb.Table(
        os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions')
    )
    table.put_item(Item={
        'account_id': account_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
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
    print(f"Saved suggestion for {resource_id} — saving ${saving_per_month}/month")

def handler(event, context):
    # ── Get user's connected account role ─────────────────
    role_arn, region, account_id = get_user_role()
    print(f"Cost scan for account: {account_id}, region: {region}, role: {role_arn}")

    if not account_id:
        # Fallback to Lambda's own account
        sts = boto3.client('sts')
        account_id = sts.get_caller_identity()['Account']
        region = os.getenv('APP_REGION', 'us-east-1')

    # ── Use assumed role clients ───────────────────────────
    ec2 = get_assumed_client('ec2', role_arn, region)
    cloudwatch = get_assumed_client('cloudwatch', role_arn, region)
    hours_per_month = 730

    # ── 1. Check EC2 instances ────────────────────────────
    try:
        instances = ec2.describe_instances(
            Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]
        )
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
                    saving = monthly_price
                    save_suggestion(
                        account_id=account_id, region=region,
                        resource_id=instance_id, resource_type='EC2',
                        issue=f'CPU avg {round(cpu_avg, 1)}% over 7 days - idle instance',
                        recommendation=f'Stop or terminate this idle instance. Saving full ${round(saving, 2)}/month',
                        saving_per_month=saving, instance_type=instance_type, days_idle=7,
                    )
                elif cpu_avg < 20.0:
                    target_type = downsize_recommendation(instance_type)
                    if target_type:
                        target_price = get_ec2_hourly_price(target_type, region)
                        saving = (hourly_price - target_price) * hours_per_month
                        if saving > 1.0:
                            save_suggestion(
                                account_id=account_id, region=region,
                                resource_id=instance_id, resource_type='EC2',
                                issue=f'CPU avg {round(cpu_avg, 1)}% on {instance_type} - instance is oversized',
                                recommendation=f'Downsize to {target_type} - save ${round(saving, 2)}/month ({round((saving/monthly_price)*100)}%)',
                                saving_per_month=saving, instance_type=instance_type, days_idle=0,
                            )
    except Exception as e:
        print(f"EC2 scan error: {e}")

    # ── 2. Check unattached EBS volumes ──────────────────
    try:
        volumes = ec2.describe_volumes(
            Filters=[{'Name': 'status', 'Values': ['available']}]
        )
        for vol in volumes['Volumes']:
            size_gb = vol['Size']
            vol_type = vol['VolumeType']
            ebs_price_map = {'gp2': 0.10, 'gp3': 0.08, 'io1': 0.125, 'st1': 0.045, 'sc1': 0.025}
            price_per_gb = ebs_price_map.get(vol_type, 0.10)
            saving = size_gb * price_per_gb
            create_time = vol.get('CreateTime', datetime.now(timezone.utc))
            days_unattached = (datetime.now(timezone.utc) - create_time.replace(tzinfo=timezone.utc)).days
            if days_unattached >= 3:
                save_suggestion(
                    account_id=account_id, region=region,
                    resource_id=vol['VolumeId'], resource_type='EBS',
                    issue=f'EBS volume unattached for {days_unattached} days - paying for unused disk',
                    recommendation=f'Delete this {size_gb}GB {vol_type} volume. Saving ${round(saving, 2)}/month',
                    saving_per_month=saving, instance_type=f'{vol_type} - {size_gb}GB', days_idle=days_unattached,
                )
    except Exception as e:
        print(f"EBS scan error: {e}")

    # ── 3. Check unused Elastic IPs ───────────────────────
    try:
        eips = ec2.describe_addresses()
        for eip in eips['Addresses']:
            if not eip.get('InstanceId') and not eip.get('NetworkInterfaceId'):
                saving = 0.005 * hours_per_month
                save_suggestion(
                    account_id=account_id, region=region,
                    resource_id=eip.get('AllocationId', eip.get('PublicIp')),
                    resource_type='ElasticIP',
                    issue='Elastic IP reserved but not attached to any instance',
                    recommendation=f'Release this Elastic IP. Saving ${round(saving, 2)}/month',
                    saving_per_month=saving, instance_type='N/A', days_idle=0,
                )
    except Exception as e:
        print(f"EIP scan error: {e}")

    # ── 4. Check idle RDS instances ───────────────────────
    try:
        rds = get_assumed_client('rds', role_arn, region)
        db_instances = rds.describe_db_instances()
        for db in db_instances['DBInstances']:
            if db['DBInstanceStatus'] != 'available':
                continue
            db_id = db['DBInstanceIdentifier']
            db_class = db['DBInstanceClass']
            avg_connections = get_rds_connections_avg(cloudwatch, db_id, days=3)
            if avg_connections < 1.0:
                hourly_price = get_rds_hourly_price(db_class, region)
                saving = hourly_price * hours_per_month
                save_suggestion(
                    account_id=account_id, region=region,
                    resource_id=db_id, resource_type='RDS',
                    issue=f'RDS instance has zero connections for 3+ days',
                    recommendation=f'Stop {db_id} ({db_class}). Saving ${round(saving, 2)}/month',
                    saving_per_month=saving, instance_type=db_class, days_idle=3,
                )
    except Exception as e:
        print(f"RDS scan error: {e}")

    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Cost scan complete', 'account_id': account_id})
    }