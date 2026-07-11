import boto3
import json
import os
import time
from botocore.exceptions import ClientError
from datetime import datetime, timezone
from dotenv import load_dotenv
from boto3.dynamodb.conditions import Key

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
            assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName='CloudGuardianRemediation')
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

def send_alert(subject, message):
    sns_arn = os.getenv('SNS_TOPIC_ARN')
    if not sns_arn:
        return
    sns = boto3.client('sns', region_name='us-east-1')
    sns.publish(TopicArn=sns_arn, Subject=subject, Message=message)

def save_security_event(event_type, resource_id, detail, account_id=None, user_id=None, issue_type=None):
    """Save a security event, or refresh last_seen if an unresolved one already exists for
    this resource + issue_type. Without this check, the 5-minute schedule and CloudTrail
    forwarders would re-write a fresh row for the same unfixed issue on every invocation."""
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    now = datetime.now(timezone.utc).isoformat()

    existing = table.query(
        KeyConditionExpression=Key('instance_id').eq(resource_id),
        FilterExpression='event_type = :et AND issue_type = :it AND resolved = :f',
        ExpressionAttributeValues={':et': 'security', ':it': issue_type, ':f': False}
    )
    items = existing.get('Items', [])
    if items:
        latest = max(items, key=lambda i: i.get('timestamp', ''))
        table.update_item(
            Key={'instance_id': latest['instance_id'], 'timestamp': latest['timestamp']},
            UpdateExpression='SET last_seen = :ls',
            ExpressionAttributeValues={':ls': now}
        )
        return

    item = {
        'instance_id': resource_id,
        'timestamp': now,
        'event_type': 'security',
        'severity': 'critical',
        'summary': f"Security event: {event_type} on {resource_id}",
        'likely_cause': detail,
        'recommended_action': 'Click "Fix this" in Cloud Guardian to remediate',
        'cost_impact': 'No cost impact',
        'resolved': False,
        'reverted': False,
        'last_seen': now,
    }
    if issue_type:
        item['issue_type'] = issue_type
    if account_id:
        item['account_id'] = account_id
    if user_id:
        item['user_id'] = user_id
    table.put_item(Item=item)

def detect_open_port_22(sg_id, role_arn, region, account_id, user_id):
    """Detect open SSH and create a security event. Fix requires user action."""
    ec2 = get_assumed_client('ec2', role_arn, region)
    try:
        sg_resp = ec2.describe_security_groups(GroupIds=[sg_id])
        sg = sg_resp['SecurityGroups'][0]
        for rule in sg.get('IpPermissions', []):
            if rule.get('FromPort') == 22 and rule.get('ToPort') == 22:
                for ip_range in rule.get('IpRanges', []):
                    if ip_range.get('CidrIp') == '0.0.0.0/0':
                        save_security_event(
                            'Port 22 opened to 0.0.0.0/0', sg_id,
                            f'Security group {sg_id} allows SSH from any IP (0.0.0.0/0)',
                            account_id=account_id, user_id=user_id,
                            issue_type='OPEN_SSH'
                        )
                        send_alert(
                            f"[CRITICAL] Port 22 open to internet — {sg_id}",
                            f"Account {account_id}: SG {sg_id} has port 22 open to 0.0.0.0/0.\n"
                            f"Log in to Cloud Guardian and click 'Fix this' to remediate."
                        )
                        return True
    except Exception as e:
        print(f"Error detecting port 22: {e}")
    return False

WHITELISTED_BUCKETS = ['cloud-guardian-4626']

def detect_public_s3(bucket_name, account_id, user_id):
    """Detect public S3 and create a security event. Fix requires user action."""
    if bucket_name in WHITELISTED_BUCKETS:
        return False
    save_security_event(
        'S3 bucket made public', bucket_name,
        f'Bucket {bucket_name} has public access — Block Public Access not configured',
        account_id=account_id, user_id=user_id, issue_type='PUBLIC_S3'
    )
    send_alert(
        f"[CRITICAL] Public S3 bucket detected — {bucket_name}",
        f"Account {account_id}: Bucket {bucket_name} is publicly accessible.\n"
        f"Log in to Cloud Guardian and click 'Fix this' to remediate."
    )
    return True
    
    
def handle_root_account_usage(event_time, source_ip, account_id=None, user_id=None):
    save_security_event(
        'Root account login detected',
        'AWS Root Account',
        f'Root user logged in from IP {source_ip} at {event_time} — root should never be used for daily operations',
        account_id=account_id,
        user_id=user_id,
        issue_type='ROOT_LOGIN',
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
                            detect_open_port_22(sg['GroupId'], role_arn, region, account_id, user_id)
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
                        detect_public_s3(bucket['Name'], account_id, user_id)
                    issues += 1
            except ClientError as e:
                if e.response['Error']['Code'] == 'NoSuchPublicAccessBlockConfiguration':
                    if bucket['Name'] not in WHITELISTED_BUCKETS:
                        detect_public_s3(bucket['Name'], account_id, user_id)
                    issues += 1
                else:
                    print(f"Skipping {bucket['Name']}: {e.response['Error']['Code']}")
            except Exception as e:
                print(f"Skipping {bucket['Name']}: {e}")
    except Exception as e:
        print(f"S3 scan error: {e}")
    return issues

def dispatch_users():
    """Fan out: enqueue one SQS message per connected account instead of looping
    through every account serially inside a single (15-minute-capped) invocation."""
    users = get_all_users()
    print(f"Manual scan dispatch for {len(users)} accounts")
    if not users:
        return {'statusCode': 200, 'body': 'No connected accounts'}

    queue_url = os.environ['REMEDIATION_QUEUE_URL']
    sqs = boto3.client('sqs', region_name='us-east-1')
    for user in users:
        sqs.send_message(QueueUrl=queue_url, MessageBody=json.dumps(user))

    return {'statusCode': 200, 'body': f'Dispatched {len(users)} accounts to the remediation queue'}


def main(event=None, context=None):
    print("Remediation Lambda triggered")

    if event and event.get('Records') and event['Records'][0].get('eventSource') == 'aws:sqs':
        # Fan-out worker: process a single connected account. Raises on failure
        # (e.g. RoleAssumptionError) so the SQS event source retries and, after
        # exhausting retries, routes the message to the DLQ instead of the
        # failure disappearing silently.
        total_issues = 0
        for record in event['Records']:
            user = json.loads(record['body'])
            role_arn = user.get('role_arn')
            region = user.get('region', 'us-east-1')
            account_id = user.get('account_id')
            user_id = user.get('user_id')
            if not account_id:
                continue
            total_issues += run_manual_scan_for_user(role_arn, region, account_id, user_id)
        return {'statusCode': 200, 'body': f"Scanned {len(event['Records'])} account(s), {total_issues} issues found"}

    if not event or (event.get('source') == 'aws.events' and event.get('detail-type') == 'Scheduled Event'):
        return dispatch_users()

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
            detect_open_port_22(sg_id, role_arn, region, account_id, user_id)
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
                    detect_public_s3(bucket_name, account_id, user_id)
            else:
                detect_public_s3(bucket_name, account_id, user_id)

    return {'statusCode': 200, 'body': 'Remediation check complete'}

if __name__ == '__main__':
    main()