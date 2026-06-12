import boto3
import json
import os
from datetime import datetime, timezone
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
            RoleSessionName='CloudGuardianRemediation'
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

def get_sns_client():
    return boto3.client('sns', region_name='us-east-1')

def send_alert(subject, message):
    """Send SNS alert"""
    sns_arn = os.getenv('SNS_TOPIC_ARN')
    if not sns_arn:
        print("No SNS topic configured")
        return
    sns = get_sns_client()
    sns.publish(TopicArn=sns_arn, Subject=subject, Message=message)
    print(f"Alert sent: {subject}")

def save_security_event(event_type, resource_id, detail, account_id=None, reverted=False, revert_seconds=None):
    """Save security event to DynamoDB"""
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
    # Tag with account_id so dashboard filters correctly
    if account_id:
        item['account_id'] = account_id
    table.put_item(Item=item)
    print(f"Security event saved: {event_type} on {resource_id} for account {account_id}")

# ── Rule 1 — Revert open port 22 ──────────────────────────
def revert_open_port_22(security_group_id, role_arn=None, region='us-east-1', account_id=None):
    """Remove port 22 open to 0.0.0.0/0 from security group"""
    ec2 = get_assumed_client('ec2', role_arn, region)
    start_time = datetime.now(timezone.utc)
    try:
        response = ec2.describe_security_groups(GroupIds=[security_group_id])
        sg = response['SecurityGroups'][0]
        for rule in sg.get('IpPermissions', []):
            if rule.get('FromPort') == 22 and rule.get('ToPort') == 22:
                for ip_range in rule.get('IpRanges', []):
                    if ip_range.get('CidrIp') == '0.0.0.0/0':
                        ec2.revoke_security_group_ingress(
                            GroupId=security_group_id,
                            IpPermissions=[{
                                'IpProtocol': 'tcp',
                                'FromPort': 22,
                                'ToPort': 22,
                                'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
                            }]
                        )
                        revert_seconds = (datetime.now(timezone.utc) - start_time).seconds
                        print(f"Reverted port 22 on {security_group_id} in {revert_seconds}s")
                        save_security_event(
                            'Port 22 opened to 0.0.0.0/0',
                            security_group_id,
                            'Security group rule added: port 22 → 0.0.0.0/0 — auto-reverted',
                            account_id=account_id,
                            reverted=True,
                            revert_seconds=revert_seconds
                        )
                        send_alert(
                            f"[CRITICAL] Port 22 auto-reverted — {security_group_id}",
                            f"""Cloud Guardian Auto-Remediation
================================
Account: {account_id}
Security group {security_group_id} had port 22 opened to 0.0.0.0/0.
This was automatically reverted in {revert_seconds} seconds.

Action taken: Removed ingress rule port 22 → 0.0.0.0/0
Time: {datetime.now(timezone.utc).isoformat()}

Please review who made this change in CloudTrail."""
                        )
                        return True
        print(f"Port 22 not open on {security_group_id} — no action needed")
        return False
    except Exception as e:
        print(f"Error reverting port 22 on {security_group_id}: {str(e)}")
        return False

# ── Rule 2 — Revert public S3 bucket ─────────────────────
def revert_public_s3_bucket(bucket_name, role_arn=None, region='us-east-1', account_id=None):
    """Block public access on S3 bucket"""
    s3 = get_assumed_client('s3', role_arn, region)
    start_time = datetime.now(timezone.utc)
    try:
        try:
            response = s3.get_public_access_block(Bucket=bucket_name)
            config = response['PublicAccessBlockConfiguration']
            all_blocked = all([
                config.get('BlockPublicAcls', False),
                config.get('IgnorePublicAcls', False),
                config.get('BlockPublicPolicy', False),
                config.get('RestrictPublicBuckets', False)
            ])
            if all_blocked:
                print(f"Bucket {bucket_name} already has public access blocked")
                return False
        except:
            pass

        s3.put_public_access_block(
            Bucket=bucket_name,
            PublicAccessBlockConfiguration={
                'BlockPublicAcls': True,
                'IgnorePublicAcls': True,
                'BlockPublicPolicy': True,
                'RestrictPublicBuckets': True
            }
        )
        revert_seconds = (datetime.now(timezone.utc) - start_time).seconds
        print(f"Blocked public access on {bucket_name} in {revert_seconds}s")
        save_security_event(
            'S3 bucket made public',
            bucket_name,
            f'Bucket {bucket_name} had public access enabled — auto-blocked',
            account_id=account_id,
            reverted=True,
            revert_seconds=revert_seconds
        )
        send_alert(
            f"[CRITICAL] S3 bucket public access blocked — {bucket_name}",
            f"""Cloud Guardian Auto-Remediation
================================
Account: {account_id}
S3 bucket {bucket_name} had public access enabled.
This was automatically blocked in {revert_seconds} seconds.

Action taken: Enabled all public access block settings
Time: {datetime.now(timezone.utc).isoformat()}

Please review who made this change in CloudTrail."""
        )
        return True
    except Exception as e:
        print(f"Error blocking public access on {bucket_name}: {str(e)}")
        return False

# ── Rule 3 — Detect root account usage ───────────────────
def handle_root_account_usage(event_time, source_ip, account_id=None):
    save_security_event(
        'Root account login detected',
        'AWS Root Account',
        f'Root user logged in from IP {source_ip} at {event_time} — root should never be used for daily operations',
        account_id=account_id,
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

# ── Manual scan ───────────────────────────────────────────
def run_manual_scan(role_arn=None, region='us-east-1', account_id=None):
    """Scan all security groups and S3 buckets for misconfigurations"""
    print(f"Running manual security scan for account {account_id}...")
    ec2 = get_assumed_client('ec2', role_arn, region)
    s3 = get_assumed_client('s3', role_arn, region)
    issues_found = 0

    # Check all security groups for open port 22
    try:
        sgs = ec2.describe_security_groups()
        for sg in sgs['SecurityGroups']:
            sg_id = sg['GroupId']
            for rule in sg.get('IpPermissions', []):
                if rule.get('FromPort') == 22:
                    for ip in rule.get('IpRanges', []):
                        if ip.get('CidrIp') == '0.0.0.0/0':
                            print(f"Found open port 22 on {sg_id} — reverting")
                            revert_open_port_22(sg_id, role_arn=role_arn, region=region, account_id=account_id)
                            issues_found += 1
    except Exception as e:
        print(f"Error scanning security groups: {str(e)}")

    # Check all S3 buckets for public access
    try:
        buckets = s3.list_buckets()
        for bucket in buckets.get('Buckets', []):
            bucket_name = bucket['Name']
            try:
                response = s3.get_public_access_block(Bucket=bucket_name)
                config = response['PublicAccessBlockConfiguration']
                all_blocked = all([
                    config.get('BlockPublicAcls', False),
                    config.get('IgnorePublicAcls', False),
                    config.get('BlockPublicPolicy', False),
                    config.get('RestrictPublicBuckets', False)
                ])
                if not all_blocked:
                    print(f"Found public access enabled on {bucket_name} — blocking")
                    revert_public_s3_bucket(bucket_name, role_arn=role_arn, region=region, account_id=account_id)
                    issues_found += 1
            except Exception:
                pass
    except Exception as e:
        print(f"Error scanning S3 buckets: {str(e)}")

    print(f"Manual scan complete — {issues_found} issues found and remediated")
    return issues_found

# ── Main handler ──────────────────────────────────────────
def main(event=None, context=None):
    print(f"Remediation Lambda triggered")
    print(f"Event: {json.dumps(event, default=str)[:500]}")

    # Get user's connected account role
    role_arn, region, account_id = get_user_role()
    print(f"Using role: {role_arn}, region: {region}, account: {account_id}")

    if not event:
        print("No event provided — running manual scan")
        run_manual_scan(role_arn=role_arn, region=region, account_id=account_id)
        return {'statusCode': 200, 'body': 'Manual scan complete'}

    # Parse CloudTrail event from EventBridge
    detail = event.get('detail', {})
    event_name = detail.get('eventName', '')
    event_source = detail.get('eventSource', '')
    user_identity = detail.get('userIdentity', {})
    source_ip = detail.get('sourceIPAddress', 'unknown')
    event_time = detail.get('eventTime', datetime.now(timezone.utc).isoformat())

    print(f"Processing event: {event_name} from {event_source}")

    # Rule 1 — Security group change
    if event_name == 'AuthorizeSecurityGroupIngress':
        request_params = detail.get('requestParameters', {})
        sg_id = request_params.get('groupId', '')
        if sg_id:
            print(f"Security group modified: {sg_id} — checking for open port 22")
            revert_open_port_22(sg_id, role_arn=role_arn, region=region, account_id=account_id)

    # Rule 2 — S3 bucket public access change
    elif event_name in ['PutBucketAcl', 'PutBucketPolicy', 'DeletePublicAccessBlock', 'PutBucketPublicAccessBlock']:
        request_params = detail.get('requestParameters', {})
        bucket_name = request_params.get('bucketName', '')
        if bucket_name:
            print(f"S3 bucket modified: {bucket_name} — checking public access")
            revert_public_s3_bucket(bucket_name, role_arn=role_arn, region=region, account_id=account_id)

    # Rule 3 — Root account usage
    elif user_identity.get('type') == 'Root':
        print("Root account usage detected")
        handle_root_account_usage(event_time, source_ip, account_id=account_id)

    else:
        print(f"Event {event_name} — no remediation rule matched")

    return {'statusCode': 200, 'body': 'Remediation check complete'}

if __name__ == '__main__':
    main()