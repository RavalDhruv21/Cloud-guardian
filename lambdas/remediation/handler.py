import boto3
import json
import os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

def get_all_users():
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
        assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName='CloudGuardianRemediation')
        creds = assumed['Credentials']
        return boto3.client(service, region_name=region,
            aws_access_key_id=creds['AccessKeyId'],
            aws_secret_access_key=creds['SecretAccessKey'],
            aws_session_token=creds['SessionToken'])
    except Exception as e:
        print(f"Role assumption failed: {e}")
        return boto3.client(service, region_name=region)

def send_alert(subject, message):
    sns_arn = os.getenv('SNS_TOPIC_ARN')
    if not sns_arn:
        return
    sns = boto3.client('sns', region_name='us-east-1')
    sns.publish(TopicArn=sns_arn, Subject=subject, Message=message)

def save_security_event(event_type, resource_id, detail, account_id=None, user_id=None, reverted=False, revert_seconds=None):
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    item = {
        'instance_id': resource_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'event_type': 'security',
        'severity': 'critical',
        'summary': f"Security event: {event_type} on {resource_id}",
        'likely_cause': detail,
        'recommended_action': 'Auto-reverted by Cloud Guardian' if reverted else 'Manual review required',
        'cost_impact': 'No cost impact',
        'resolved': reverted,
        'reverted': reverted,
        'revert_seconds': str(revert_seconds) if revert_seconds else None
    }
    if account_id:
        item['account_id'] = account_id
    if user_id:
        item['user_id'] = user_id
    table.put_item(Item=item)

def revert_open_port_22(sg_id, role_arn, region, account_id, user_id):
    ec2 = get_assumed_client('ec2', role_arn, region)
    start_time = datetime.now(timezone.utc)
    try:
        response = ec2.describe_security_groups(GroupIds=[sg_id])
        sg = response['SecurityGroups'][0]
        for rule in sg.get('IpPermissions', []):
            if rule.get('FromPort') == 22 and rule.get('ToPort') == 22:
                for ip_range in rule.get('IpRanges', []):
                    if ip_range.get('CidrIp') == '0.0.0.0/0':
                        reverted = False
                        revert_secs = None
                        try:
                            ec2.revoke_security_group_ingress(GroupId=sg_id, IpPermissions=[{
                                'IpProtocol': 'tcp', 'FromPort': 22, 'ToPort': 22,
                                'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
                            }])
                            reverted = True
                            revert_secs = (datetime.now(timezone.utc) - start_time).seconds
                        except Exception as e:
                            print(f"Error revoking port 22: {e}")
                            
                        save_security_event('Port 22 opened to 0.0.0.0/0', sg_id,
                            f'port 22 to 0.0.0.0/0 detected', account_id=account_id, user_id=user_id,
                            reverted=reverted, revert_seconds=revert_secs)
                            
                        if reverted:
                            send_alert(f"[CRITICAL] Port 22 auto-reverted — {sg_id}",
                                f"Account {account_id}: SG {sg_id} had port 22 open. Reverted in {revert_secs}s.")
                        else:
                            send_alert(f"[CRITICAL] Port 22 open (Remediation Failed) — {sg_id}",
                                f"Account {account_id}: SG {sg_id} has port 22 open but auto-remediation failed.")
                        return True
    except Exception as e:
        print(f"Error analyzing port 22: {e}")
    return False

WHITELISTED_BUCKETS = ['cloud-guardian-4626']

def revert_public_s3(bucket_name, role_arn, region, account_id, user_id):
    if bucket_name in WHITELISTED_BUCKETS:
        print(f"Skipping whitelisted bucket: {bucket_name}")
        return False
    s3 = get_assumed_client('s3', role_arn, region)
    start_time = datetime.now(timezone.utc)
    
    reverted = False
    revert_secs = None
    
    try:
        s3.put_public_access_block(Bucket=bucket_name, PublicAccessBlockConfiguration={
            'BlockPublicAcls': True, 'IgnorePublicAcls': True,
            'BlockPublicPolicy': True, 'RestrictPublicBuckets': True
        })
        reverted = True
        revert_secs = (datetime.now(timezone.utc) - start_time).seconds
    except Exception as e:
        print(f"Error blocking S3: {e}")
        
    save_security_event('S3 bucket made public', bucket_name,
        f'Bucket {bucket_name} public access block missing or disabled', account_id=account_id,
        user_id=user_id, reverted=reverted, revert_seconds=revert_secs)
        
    if reverted:
        send_alert(f"[CRITICAL] S3 public access blocked — {bucket_name}",
            f"Account {account_id}: Bucket {bucket_name} blocked in {revert_secs}s.")
    else:
        send_alert(f"[CRITICAL] S3 public access detected (Remediation Failed) — {bucket_name}",
            f"Account {account_id}: Bucket {bucket_name} is public but auto-remediation failed.")
    
    return reverted
    
    
def handle_root_account_usage(event_time, source_ip, account_id=None, user_id=None):
    save_security_event(
        'Root account login detected',
        'AWS Root Account',
        f'Root user logged in from IP {source_ip} at {event_time} — root should never be used for daily operations',
        account_id=account_id,
        user_id=user_id,
        reverted=False,
        revert_seconds=None
    )
    send_alert(
        "[CRITICAL] Root account login detected",
        f"""Cloud Guardian Security Alert
================================
Account: {account_id}
Root account was used to sign in to your AWS account.

Time: {event_time}
Source IP: {source_ip}

Root account should never be used for daily operations.
Recommended actions:
1. Review what was done with root access
2. Enable MFA on root account if not already done
3. Create IAM users for all operations

This cannot be auto-reverted — manual review required."""
    )

def run_manual_scan_for_user(role_arn, region, account_id, user_id):
    print(f"Scanning account {account_id} for user {user_id}")
    ec2 = get_assumed_client('ec2', role_arn, region)
    s3 = get_assumed_client('s3', role_arn, region)
    issues = 0
    try:
        sgs = ec2.describe_security_groups()
        for sg in sgs['SecurityGroups']:
            for rule in sg.get('IpPermissions', []):
                if rule.get('FromPort') == 22:
                    for ip in rule.get('IpRanges', []):
                        if ip.get('CidrIp') == '0.0.0.0/0':
                            revert_open_port_22(sg['GroupId'], role_arn, region, account_id, user_id)
                            issues += 1
    except Exception as e:
        print(f"SG scan error: {e}")
    try:
        buckets = s3.list_buckets()
        for bucket in buckets.get('Buckets', []):
            try:
                resp = s3.get_public_access_block(Bucket=bucket['Name'])
                config = resp['PublicAccessBlockConfiguration']
                if not all([config.get('BlockPublicAcls'), config.get('IgnorePublicAcls'),
                            config.get('BlockPublicPolicy'), config.get('RestrictPublicBuckets')]):
                    if bucket['Name'] not in WHITELISTED_BUCKETS:
                        revert_public_s3(bucket['Name'], role_arn, region, account_id, user_id)
                    issues += 1
            except Exception:
                if bucket['Name'] not in WHITELISTED_BUCKETS:
                    revert_public_s3(bucket['Name'], role_arn, region, account_id, user_id)
                issues += 1
    except Exception as e:
        print(f"S3 scan error: {e}")
    return issues

def main(event=None, context=None):
    print("Remediation Lambda triggered")

    if not event or (event.get('source') == 'aws.events' and event.get('detail-type') == 'Scheduled Event'):
        # Manual scan — run for ALL connected users
        users = get_all_users()
        print(f"Manual scan for {len(users)} accounts")
        total_issues = 0
        for user in users:
            role_arn = user.get('role_arn')
            region = user.get('region', 'us-east-1')
            account_id = user.get('account_id')
            user_id = user.get('user_id')
            if not account_id:
                continue
            try:
                issues = run_manual_scan_for_user(role_arn, region, account_id, user_id)
                total_issues += issues
            except Exception as e:
                print(f"Error scanning {account_id}: {e}")
        return {'statusCode': 200, 'body': f'Scanned {len(users)} accounts, {total_issues} issues found'}

    # EventBridge CloudTrail event — find which user owns this resource
    detail = event.get('detail', {})
    event_name = detail.get('eventName', '')
    user_identity = detail.get('userIdentity', {})
    source_ip = detail.get('sourceIPAddress', 'unknown')
    event_time = detail.get('eventTime', datetime.now(timezone.utc).isoformat())

    # Get the account from the event
    event_account = detail.get('recipientAccountId') or detail.get('userIdentity', {}).get('accountId')

    # Find matching user
    users = get_all_users()
    matching_user = next((u for u in users if u.get('account_id') == event_account), None)

    role_arn = matching_user.get('role_arn') if matching_user else None
    region = matching_user.get('region', 'us-east-1') if matching_user else 'us-east-1'
    account_id = event_account
    user_id = matching_user.get('user_id') if matching_user else 'default-user'

    # Always evaluate Root identity first, separately from the event_name routing
    if user_identity.get('type') == 'Root':
        print("Root account usage detected")
        handle_root_account_usage(event_time, source_ip, account_id=account_id, user_id=user_id)

    if event_name == 'AuthorizeSecurityGroupIngress':
        sg_id = detail.get('requestParameters', {}).get('groupId', '')
        if sg_id:
            revert_open_port_22(sg_id, role_arn, region, account_id, user_id)
    elif event_name in ['CreateBucket', 'PutBucketAcl', 'PutBucketPolicy', 'DeletePublicAccessBlock', 'PutBucketPublicAccessBlock']:
        bucket_name = detail.get('requestParameters', {}).get('bucketName', '')
        if not bucket_name:
            bucket_name = detail.get('requestParameters', {}).get('bucket', {}).get('_', '') or \
                        detail.get('requestParameters', {}).get('bucketName', '')
        if bucket_name:
            # For PutBucketPublicAccessBlock, only act if block is being turned OFF
            if event_name == 'PutBucketPublicAccessBlock':
                config = detail.get('requestParameters', {}).get('PublicAccessBlockConfiguration', {})
                block_all = all([
                    config.get('BlockPublicAcls', True),
                    config.get('IgnorePublicAcls', True),
                    config.get('BlockPublicPolicy', True),
                    config.get('RestrictPublicBuckets', True),
                ])
                if not block_all:
                    revert_public_s3(bucket_name, role_arn, region, account_id, user_id)
            else:
                revert_public_s3(bucket_name, role_arn, region, account_id, user_id)

    return {'statusCode': 200, 'body': 'Remediation check complete'}

if __name__ == '__main__':
    main()