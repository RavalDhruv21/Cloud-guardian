import json
import boto3
import os
import time
import urllib.request
from datetime import datetime, timezone, timedelta, date
from decimal import Decimal
from dotenv import load_dotenv
from botocore.exceptions import ClientError as BotocoreClientError
from boto3.dynamodb.conditions import Key

load_dotenv()

_COGNITO_REGION = os.getenv('COGNITO_REGION', 'us-east-1')
_COGNITO_USER_POOL_ID = os.getenv('COGNITO_USER_POOL_ID', 'us-east-1_yqv39lzIR')
_COGNITO_CLIENT_ID = os.getenv('COGNITO_CLIENT_ID', '5g0e3aalsqv9c9e76i0oi6b6mk')
_COGNITO_ISSUER = f'https://cognito-idp.{_COGNITO_REGION}.amazonaws.com/{_COGNITO_USER_POOL_ID}'
_JWKS_URL = f'{_COGNITO_ISSUER}/.well-known/jwks.json'
_JWKS_CACHE = None

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

_ALLOWED_ORIGIN = os.getenv('ALLOWED_ORIGIN', 'https://d1nybctg2u5m4a.cloudfront.net')

def cors_headers():
    return {
        'Access-Control-Allow-Origin': _ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json'
    }

def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': cors_headers(),
        'body': json.dumps(body, cls=DecimalEncoder)
    }

# ── Cross-account role assumption ─────────────────────────
def get_user_role_arn(user_id='default-user', request_region=None):
    try:
        table = dynamodb.Table('cloud-guardian-users')
        result = table.get_item(Key={'user_id': user_id})
        item = result.get('Item')
        if not item:
            # No account connected for this user
            return None, request_region or 'us-east-1', None
        region = request_region or item.get('region', 'us-east-1')
        return item.get('role_arn'), region, item.get('account_id')
    except Exception as e:
        print(f"Error getting user role for {user_id}: {e}")
        return None, request_region or 'us-east-1', None

class RoleAssumptionError(Exception):
    """Raised when assuming the customer's IAM role fails — callers must fail
    closed rather than fall back to the Lambda's own AWS credentials, which
    could act on the wrong AWS account."""

# Assumed-role credentials cached per role_arn, keyed for the life of this
# warm Lambda execution environment. STS sessions here last 15 minutes, so
# reusing them avoids re-calling STS on every request that hits the same
# account while the container stays warm.
_ROLE_CREDENTIALS_CACHE = {}
_CREDENTIAL_REFRESH_MARGIN_SECONDS = 60

def get_assumed_client(service, role_arn=None, region='us-east-1'):
    if not role_arn:
        return boto3.client(service, region_name=region)

    cached = _ROLE_CREDENTIALS_CACHE.get(role_arn)
    if not cached or cached['expiry'] - time.time() < _CREDENTIAL_REFRESH_MARGIN_SECONDS:
        try:
            sts = boto3.client('sts')
            assumed = sts.assume_role(
                RoleArn=role_arn,
                RoleSessionName='CloudGuardianSession',
                DurationSeconds=900
            )
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

    return boto3.client(
        service, region_name=region,
        aws_access_key_id=cached['access_key_id'],
        aws_secret_access_key=cached['secret_access_key'],
        aws_session_token=cached['session_token']
    )

# ── Cost optimizer actions ────────────────────────────────
def stop_ec2(body):
    user_id = body.get('user_id', 'default-user')
    role_arn, _, _ = get_user_role_arn(user_id)
    ec2 = get_assumed_client('ec2', role_arn, body.get('region', 'us-east-1'))
    ec2.stop_instances(InstanceIds=[body['instance_id']])
    return response(200, {'message': f"Stopped {body['instance_id']}"})

def delete_ebs(body):
    user_id = body.get('user_id', 'default-user')
    role_arn, _, _ = get_user_role_arn(user_id)
    ec2 = get_assumed_client('ec2', role_arn, body.get('region', 'us-east-1'))
    ec2.delete_volume(VolumeId=body['volume_id'])
    return response(200, {'message': f"Deleted {body['volume_id']}"})

def release_eip(body):
    user_id = body.get('user_id', 'default-user')
    role_arn, _, _ = get_user_role_arn(user_id)
    ec2 = get_assumed_client('ec2', role_arn, body.get('region', 'us-east-1'))
    ec2.release_address(AllocationId=body['allocation_id'])
    return response(200, {'message': f"Released {body['allocation_id']}"})

def stop_rds(body):
    user_id = body.get('user_id', 'default-user')
    role_arn, _, _ = get_user_role_arn(user_id)
    rds = get_assumed_client('rds', role_arn, body.get('region', 'us-east-1'))
    rds.stop_db_instance(DBInstanceIdentifier=body['instance_id'])
    return response(200, {'message': f"Stopped RDS {body['instance_id']}"})

def resize_ec2(body):
    user_id = body.get('user_id', 'default-user')
    role_arn, _, _ = get_user_role_arn(user_id)
    ec2 = get_assumed_client('ec2', role_arn, body.get('region', 'us-east-1'))
    instance_id = body['instance_id']
    target_type = body.get('target_type', 't3.micro')
    ec2.stop_instances(InstanceIds=[instance_id])
    waiter = ec2.get_waiter('instance_stopped')
    waiter.wait(InstanceIds=[instance_id])
    ec2.modify_instance_attribute(InstanceId=instance_id, InstanceType={'Value': target_type})
    ec2.start_instances(InstanceIds=[instance_id])
    return response(200, {'message': f"Resized {instance_id} to {target_type} and restarted"})

# ── GET /metrics ──────────────────────────────────────────
def get_metrics(account_id=None, region=None):
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    if not account_id:
        return response(200, {'metrics': [], 'account_id': None})
    result = table.query(
        IndexName='account_id-timestamp-index',
        KeyConditionExpression=Key('account_id').eq(account_id),
        ScanIndexForward=False,
    )
    items = result.get('Items', [])
    if region:
        items = [i for i in items if i.get('region', 'us-east-1') == region]
    return response(200, {'metrics': items[:50]})

# ── GET /metrics/history ──────────────────────────────────
def get_instance_metrics_history(instance_id, region='us-east-1', hours=2, user_id='default-user'):
    try:
        from datetime import timedelta
        role_arn, effective_region, _ = get_user_role_arn(user_id=user_id, request_region=region)
        cloudwatch = get_assumed_client('cloudwatch', role_arn, effective_region)
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=int(hours))
        result = cloudwatch.get_metric_statistics(
            Namespace='AWS/EC2',
            MetricName='CPUUtilization',
            Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
            StartTime=start_time, EndTime=end_time,
            Period=300, Statistics=['Average', 'Maximum']
        )
        datapoints = result.get('Datapoints', [])
        datapoints.sort(key=lambda x: x['Timestamp'])
        chart_data = [{'time': dp['Timestamp'].strftime('%H:%M'), 'cpu': round(dp['Average'], 3), 'cpu_max': round(dp['Maximum'], 3)} for dp in datapoints]
        return response(200, {'history': chart_data, 'instance_id': instance_id, 'period_minutes': 5, 'window_hours': hours})
    except Exception as e:
        return response(500, {'error': str(e)})

# ── GET /anomalies ─────────────────────────────────────────
def get_anomalies(query_params=None, user_id='default-user'):
    _, _, account_id = get_user_role_arn(user_id=user_id)
    if not account_id:
        return response(200, {'anomalies': []})
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    result = table.query(
        IndexName='account_id-timestamp-index',
        KeyConditionExpression=Key('account_id').eq(account_id),
        ScanIndexForward=False,
    )
    items = result.get('Items', [])
    if query_params:
        severity = query_params.get('severity')
        resolved = query_params.get('resolved')
        if severity:
            items = [i for i in items if i.get('severity') == severity]
        if resolved is not None:
            is_resolved = resolved.lower() == 'true'
            items = [i for i in items if i.get('resolved', False) == is_resolved]
    return response(200, {'anomalies': items})

# ── POST /anomalies/resolve ────────────────────────────────
def resolve_anomaly(body):
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    instance_id = body.get('instance_id')
    timestamp = body.get('timestamp')
    if not instance_id or not timestamp:
        return response(400, {'error': 'instance_id and timestamp required'})
    table.update_item(
        Key={'instance_id': instance_id, 'timestamp': timestamp},
        UpdateExpression='SET resolved = :r, resolved_at = :t',
        ExpressionAttributeValues={':r': True, ':t': datetime.now(timezone.utc).isoformat()}
    )
    return response(200, {'message': 'Anomaly marked as resolved'})

# ── GET /cost-suggestions ──────────────────────────────────
def get_cost_suggestions(query_params=None, user_id='default-user'):
    _, _, account_id = get_user_role_arn(user_id=user_id)
    if not account_id:
        return response(200, {'suggestions': []})
    table = dynamodb.Table(os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions'))
    result = table.query(
        KeyConditionExpression=Key('account_id').eq(account_id),
        ScanIndexForward=False,
    )
    items = result.get('Items', [])
    items = [i for i in items if i.get('status') != 'dismissed']
    return response(200, {'suggestions': items})

# ── POST /cost-suggestions/dismiss ────────────────────────
def dismiss_suggestion(body):
    table = dynamodb.Table(os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions'))
    resource_id = body.get('resource_id')
    user_id = body.get('user_id', 'default-user')
    _, _, account_id = get_user_role_arn(user_id=user_id)
    if not account_id:
        return response(404, {'error': 'Suggestion not found'})
    result = table.query(KeyConditionExpression=Key('account_id').eq(account_id))
    items = result.get('Items', [])
    target = next((i for i in items if i.get('resource_id') == resource_id), None)
    if not target:
        return response(404, {'error': 'Suggestion not found'})
    table.update_item(
        Key={'account_id': target['account_id'], 'timestamp': target['timestamp']},
        UpdateExpression='SET #s = :s',
        ExpressionAttributeNames={'#s': 'status'},
        ExpressionAttributeValues={':s': 'dismissed'}
    )
    return response(200, {'message': 'Suggestion dismissed'})

# ── GET /security-events ───────────────────────────────────
def get_security_events(query_params=None, user_id='default-user'):
    _, _, account_id = get_user_role_arn(user_id=user_id)
    if not account_id:
        return response(200, {'events': []})
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    result = table.query(
        IndexName='account_id-timestamp-index',
        KeyConditionExpression=Key('account_id').eq(account_id),
        ScanIndexForward=False,
    )
    items = result.get('Items', [])
    security = [i for i in items if i.get('event_type') in ['security', 'remediation']]
    return response(200, {'events': security})

# ── GET /reports ───────────────────────────────────────────
def get_reports(user_id='default-user'):
    _, _, account_id = get_user_role_arn(user_id=user_id)
    if not account_id:
        return response(200, {'reports': []})
    s3 = boto3.client('s3', region_name='us-east-1')
    bucket = os.getenv('S3_BUCKET_NAME')
    try:
        prefix = f'reports/{account_id}/'
        result = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
        objects = result.get('Contents', [])
        reports = []
        for obj in objects:
            key = obj['Key']
            url = s3.generate_presigned_url('get_object', Params={'Bucket': bucket, 'Key': key}, ExpiresIn=3600)
            reports.append({'key': key, 'date': obj['LastModified'].isoformat(), 'url': url, 'size': obj['Size']})
        reports.sort(key=lambda x: x['date'], reverse=True)
        return response(200, {'reports': reports})
    except Exception as e:
        return response(500, {'error': str(e)})

def get_report_content(report_key, region='us-east-1'):
    try:
        s3 = boto3.client('s3', region_name=region)
        bucket = os.getenv('S3_BUCKET_NAME')
        result = s3.get_object(Bucket=bucket, Key=report_key)
        content = result['Body'].read().decode('utf-8')
        return response(200, {'content': content})
    except Exception as e:
        return response(500, {'error': str(e)})

# ── POST /agent ────────────────────────────────────────────
# Tools the model can call. account_id/region are always injected server-side
# from the caller's verified session — never taken from the model's arguments —
# so a tool call can never read another account's data.

def _tool_get_instance_metrics(account_id, region, instance_id=None, **_):
    if not instance_id:
        return {'error': 'instance_id is required'}
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    items = table.query(
        KeyConditionExpression=Key('instance_id').eq(instance_id),
        ScanIndexForward=False, Limit=5
    ).get('Items', [])
    items = [i for i in items if i.get('account_id') == account_id]
    return {'metrics': items}

def _tool_list_recent_metrics(account_id, region, limit=10, **_):
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    items = table.query(
        IndexName='account_id-timestamp-index', KeyConditionExpression=Key('account_id').eq(account_id),
        ScanIndexForward=False, Limit=int(limit) if limit else 10
    ).get('Items', [])
    return {'metrics': items}

def _tool_list_open_security_issues(account_id, region, **_):
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    items = table.query(
        IndexName='account_id-timestamp-index', KeyConditionExpression=Key('account_id').eq(account_id),
        ScanIndexForward=False
    ).get('Items', [])
    security = [i for i in items if i.get('event_type') in ('security', 'remediation') and not i.get('resolved', False)]
    return {'security_issues': security[:20]}

def _tool_list_anomalies(account_id, region, severity=None, resolved=None, **_):
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    items = table.query(
        IndexName='account_id-timestamp-index', KeyConditionExpression=Key('account_id').eq(account_id),
        ScanIndexForward=False
    ).get('Items', [])
    items = [i for i in items if i.get('event_type') not in ('security', 'remediation')]
    if severity:
        items = [i for i in items if i.get('severity') == severity]
    if resolved is not None:
        items = [i for i in items if i.get('resolved', False) == bool(resolved)]
    return {'anomalies': items[:20]}

def _tool_list_cost_suggestions(account_id, region, **_):
    table = dynamodb.Table(os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions'))
    items = table.query(
        KeyConditionExpression=Key('account_id').eq(account_id), ScanIndexForward=False
    ).get('Items', [])
    items = [i for i in items if i.get('status') != 'dismissed']
    savings = round(sum(float(i.get('saving_per_month', 0)) for i in items), 2)
    return {'cost_suggestions': items, 'total_potential_savings_per_month': savings}

_TOOL_IMPL = {
    'get_instance_metrics': _tool_get_instance_metrics,
    'list_recent_metrics': _tool_list_recent_metrics,
    'list_open_security_issues': _tool_list_open_security_issues,
    'list_anomalies': _tool_list_anomalies,
    'list_cost_suggestions': _tool_list_cost_suggestions,
}

_TOOL_DECLARATIONS = [
    {
        'name': 'get_instance_metrics',
        'description': "Get recent CPU metrics for one specific EC2 instance by its instance ID, e.g. 'i-0abc123'.",
        'parameters': {
            'type': 'OBJECT',
            'properties': {'instance_id': {'type': 'STRING', 'description': 'The EC2 instance ID to look up'}},
            'required': ['instance_id'],
        },
    },
    {
        'name': 'list_recent_metrics',
        'description': 'List the most recent CPU metric snapshots across all EC2 instances in the connected account.',
        'parameters': {
            'type': 'OBJECT',
            'properties': {'limit': {'type': 'INTEGER', 'description': 'Max number of records to return, default 10'}},
        },
    },
    {
        'name': 'list_open_security_issues',
        'description': 'List unresolved security findings (e.g. open SSH to the world, public S3 buckets, root account usage) for the connected account.',
        'parameters': {'type': 'OBJECT', 'properties': {}},
    },
    {
        'name': 'list_anomalies',
        'description': 'List detected infrastructure anomalies (excluding security findings), optionally filtered by severity or resolved status.',
        'parameters': {
            'type': 'OBJECT',
            'properties': {
                'severity': {'type': 'STRING', 'enum': ['critical', 'warning', 'info'], 'description': 'Filter by severity'},
                'resolved': {'type': 'BOOLEAN', 'description': 'Filter by resolved status'},
            },
        },
    },
    {
        'name': 'list_cost_suggestions',
        'description': 'List open (non-dismissed) cost-saving suggestions for the connected account, with total potential monthly savings.',
        'parameters': {'type': 'OBJECT', 'properties': {}},
    },
]

def ask_agent(body):
    import requests as req
    message = body.get('message', '')
    context = body.get('context', {})
    history = body.get('history', [])
    user_id = body.get('user_id', 'default-user')
    gemini_key = os.getenv('GEMINI_API_KEY')

    if not gemini_key:
        print("GEMINI_API_KEY environment variable is not set on this Lambda")
        return response(500, {'error': 'Agent AI is not configured — GEMINI_API_KEY missing on Lambda'})

    role_arn, region, account_id = get_user_role_arn(user_id=user_id)

    if not account_id:
        return response(200, {'reply': "You haven't connected an AWS account yet — connect one first so I can look up real data for you."})

    system_prompt = f"""You are Cloud Guardian AI — an expert AWS infrastructure assistant for Cloud Guardian.
You are answering questions about Account {account_id} in {region}.

You have tools to look up this account's real, current infrastructure data — EC2 metrics, security issues,
anomalies, and cost suggestions. Call the relevant tool(s) before answering any question about the state of
the account; never guess or make up numbers. Only call the tools that are actually relevant to what was asked
— don't fetch everything by default.

Extra context from the user's current screen: {json.dumps(context)[:1000]}

INSTRUCTIONS:
- Be direct and actionable — give specific resource IDs when relevant
- For cost questions, reference the actual saving amounts returned by your tools
- For security questions, reference the actual issues returned by your tools
- Format responses clearly with bullet points where helpful"""

    contents = []
    for msg in history:
        role = 'model' if msg.get('role') == 'assistant' else 'user'
        contents.append({'role': role, 'parts': [{'text': msg.get('content', '')}]})
    contents.append({'role': 'user', 'parts': [{'text': message}]})

    url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}'
    gemini_response = None
    try:
        for _ in range(5):  # cap tool-call round trips so a confused model can't loop forever
            gemini_response = req.post(
                url,
                headers={'Content-Type': 'application/json'},
                json={
                    'systemInstruction': {'parts': [{'text': system_prompt}]},
                    'contents': contents,
                    'tools': [{'functionDeclarations': _TOOL_DECLARATIONS}],
                    'generationConfig': {'temperature': 0.3, 'maxOutputTokens': 2000}
                },
                timeout=25
            )
            gemini_response.raise_for_status()
            data = gemini_response.json()
            parts = data.get('candidates', [{}])[0].get('content', {}).get('parts', [])
            function_calls = [p['functionCall'] for p in parts if 'functionCall' in p]

            if not function_calls:
                ai_text = next((p['text'] for p in parts if 'text' in p), '') or 'No response generated.'
                return response(200, {'reply': ai_text})

            contents.append({'role': 'model', 'parts': parts})
            response_parts = []
            for fc in function_calls:
                name = fc.get('name')
                args = fc.get('args') or {}
                impl = _TOOL_IMPL.get(name)
                print(f"Agent tool call: {name}({args})")
                if not impl:
                    result = {'error': f'Unknown tool {name}'}
                else:
                    try:
                        result = json.loads(json.dumps(impl(account_id, region, **args), cls=DecimalEncoder))
                    except Exception as e:
                        result = {'error': str(e)}
                response_parts.append({'functionResponse': {'name': name, 'response': result}})
            contents.append({'role': 'function', 'parts': response_parts})

        return response(200, {'reply': "I wasn't able to finish looking that up — try asking something more specific."})
    except req.exceptions.HTTPError as e:
        error_body = {}
        try:
            error_body = gemini_response.json()
        except Exception:
            pass
        print(f"Gemini API HTTP error {gemini_response.status_code if gemini_response is not None else '?'}: {error_body}")
        return response(502, {'error': f'Gemini API error: {error_body.get("error", {}).get("message", str(e))}'})
    except req.exceptions.Timeout:
        print("Gemini API request timed out")
        return response(504, {'error': 'Gemini API timed out — try again'})
    except Exception as e:
        print(f"ask_agent unexpected error: {e}")
        return response(500, {'error': 'Unexpected error calling Gemini API'})

# ── POST /security/scan ────────────────────────────────────
_SCAN_WHITELIST = ['cloud-guardian-4626']

def _save_security_event_deduped(resource_id, issue_type, event_label, detail, account_id, user_id):
    """Save a security event (detection-only). Skips creating a new row while an
    unresolved event already exists for this resource + issue_type — just refreshes
    last_seen on the existing row instead, so repeated scans don't pile up duplicates."""
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
        return False
    table.put_item(Item={
        'instance_id': resource_id,
        'timestamp': now,
        'event_type': 'security',
        'issue_type': issue_type,
        'severity': 'critical',
        'summary': f'Security event: {event_label} on {resource_id}',
        'likely_cause': detail,
        'recommended_action': 'Click "Fix this" to remediate',
        'cost_impact': 'No cost impact',
        'resolved': False,
        'reverted': False,
        'account_id': account_id,
        'user_id': user_id,
        'last_seen': now,
    })
    return True


def _mark_security_event_resolved(resource_id):
    """Mark all unresolved security events for a resource as fixed."""
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    result = table.query(
        KeyConditionExpression=Key('instance_id').eq(resource_id),
        FilterExpression='event_type = :et AND resolved = :f',
        ExpressionAttributeValues={':et': 'security', ':f': False}
    )
    for item in result.get('Items', []):
        table.update_item(
            Key={'instance_id': item['instance_id'], 'timestamp': item['timestamp']},
            UpdateExpression='SET resolved = :t, reverted = :t, resolved_at = :at',
            ExpressionAttributeValues={':t': True, ':at': datetime.now(timezone.utc).isoformat()}
        )


def scan_security_now(user_id='default-user'):
    """Detection only — no auto-fix. Creates security events for user to review and fix."""
    role_arn, region, account_id = get_user_role_arn(user_id=user_id)
    if not account_id:
        return response(200, {'issues': [], 'account_id': None, 'message': 'No AWS account connected'})

    issues = []

    # ── Check SGs for SSH open to the world ───────────────
    try:
        ec2 = get_assumed_client('ec2', role_arn, region)
        for sg in ec2.describe_security_groups()['SecurityGroups']:
            for rule in sg.get('IpPermissions', []):
                if rule.get('FromPort') == 22 and rule.get('ToPort') == 22:
                    for ip_range in rule.get('IpRanges', []):
                        if ip_range.get('CidrIp') == '0.0.0.0/0':
                            _save_security_event_deduped(
                                sg['GroupId'], 'OPEN_SSH',
                                'Port 22 opened to 0.0.0.0/0',
                                f'Security group {sg["GroupId"]} allows SSH from any IP',
                                account_id, user_id
                            )
                            issues.append({'type': 'OPEN_SSH', 'resource': sg['GroupId']})
    except Exception as e:
        print(f"SG scan error: {e}")

    # ── Check S3 buckets for missing public access block ──
    try:
        s3 = get_assumed_client('s3', role_arn, region)
        for bucket in s3.list_buckets().get('Buckets', []):
            name = bucket['Name']
            if name in _SCAN_WHITELIST:
                continue
            is_public = False
            try:
                cfg = s3.get_public_access_block(Bucket=name)['PublicAccessBlockConfiguration']
                if not all([cfg.get('BlockPublicAcls'), cfg.get('IgnorePublicAcls'),
                            cfg.get('BlockPublicPolicy'), cfg.get('RestrictPublicBuckets')]):
                    is_public = True
            except BotocoreClientError as e:
                if e.response['Error']['Code'] == 'NoSuchPublicAccessBlockConfiguration':
                    is_public = True
            except Exception:
                pass

            if is_public:
                _save_security_event_deduped(
                    name, 'PUBLIC_S3',
                    'S3 bucket made public',
                    f'Bucket {name} has public access — no Block Public Access configured',
                    account_id, user_id
                )
                issues.append({'type': 'PUBLIC_S3', 'resource': name})
    except Exception as e:
        print(f"S3 scan error: {e}")

    return response(200, {
        'issues': issues,
        'issues_found': len(issues),
        'account_id': account_id,
        'scanned_at': datetime.now(timezone.utc).isoformat(),
    })


def security_fix(body):
    """User-initiated fix for a detected security issue."""
    user_id = body.get('user_id', 'default-user')
    issue_type = body.get('issue_type', '')
    resource_id = body.get('resource_id', '')

    if not resource_id or not issue_type:
        return response(400, {'error': 'issue_type and resource_id are required'})

    role_arn, region, account_id = get_user_role_arn(user_id=user_id)
    if not account_id:
        return response(400, {'error': 'No AWS account connected'})

    if issue_type == 'PUBLIC_S3':
        try:
            s3 = get_assumed_client('s3', role_arn, region)
            s3.put_public_access_block(Bucket=resource_id, PublicAccessBlockConfiguration={
                'BlockPublicAcls': True, 'IgnorePublicAcls': True,
                'BlockPublicPolicy': True, 'RestrictPublicBuckets': True
            })
            _mark_security_event_resolved(resource_id)
            return response(200, {
                'fixed': True,
                'resource_id': resource_id,
                'message': f'Block Public Access enabled on {resource_id}',
            })
        except Exception as e:
            return response(500, {'fixed': False, 'error': str(e)})

    if issue_type == 'OPEN_SSH':
        try:
            ec2 = get_assumed_client('ec2', role_arn, region)
            ec2.revoke_security_group_ingress(GroupId=resource_id, IpPermissions=[{
                'IpProtocol': 'tcp', 'FromPort': 22, 'ToPort': 22,
                'IpRanges': [{'CidrIp': '0.0.0.0/0'}]
            }])
            _mark_security_event_resolved(resource_id)
            return response(200, {
                'fixed': True,
                'resource_id': resource_id,
                'message': f'SSH (port 22) rule removed from {resource_id}',
            })
        except Exception as e:
            return response(500, {'fixed': False, 'error': str(e)})

    return response(400, {'error': f'Unknown issue_type: {issue_type}'})


# ── GET /compliance-score ──────────────────────────────────
_COMPLIANCE_WHITELISTED_BUCKETS = ['cloud-guardian-4626']

def get_compliance_score(user_id='default-user'):
    role_arn, region, account_id = get_user_role_arn(user_id=user_id)
    if not account_id:
        return response(200, {'score': None, 'violations': [], 'account_id': None})

    score = 100
    violations = []

    # ── Check 1: SSH (port 22) open to the world ──────────
    try:
        ec2 = get_assumed_client('ec2', role_arn, region)
        sgs = ec2.describe_security_groups()
        open_ssh = []
        for sg in sgs['SecurityGroups']:
            for rule in sg.get('IpPermissions', []):
                if rule.get('FromPort') == 22 and rule.get('ToPort') == 22:
                    for ip_range in rule.get('IpRanges', []):
                        if ip_range.get('CidrIp') == '0.0.0.0/0':
                            open_ssh.append(sg['GroupId'])
        if open_ssh:
            pts = min(len(open_ssh) * 20, 40)
            score -= pts
            violations.append({
                'type': 'OPEN_SSH', 'severity': 'critical',
                'resources': open_ssh,
                'detail': f'{len(open_ssh)} security group(s) have SSH open to 0.0.0.0/0',
                'fix': 'Restrict port 22 to your IP or a VPN CIDR',
                'points_lost': pts,
            })
    except Exception as e:
        print(f"SG compliance check error: {e}")

    # ── Check 2: S3 buckets without public access block ───
    try:
        s3 = get_assumed_client('s3', role_arn, region)
        all_buckets = s3.list_buckets().get('Buckets', [])
        public_buckets = []
        for b in all_buckets:
            name = b['Name']
            if name in _COMPLIANCE_WHITELISTED_BUCKETS:
                continue
            try:
                cfg = s3.get_public_access_block(Bucket=name)['PublicAccessBlockConfiguration']
                if not all([cfg.get('BlockPublicAcls'), cfg.get('IgnorePublicAcls'),
                            cfg.get('BlockPublicPolicy'), cfg.get('RestrictPublicBuckets')]):
                    public_buckets.append(name)
            except BotocoreClientError as e:
                if e.response['Error']['Code'] == 'NoSuchPublicAccessBlockConfiguration':
                    public_buckets.append(name)
            except Exception:
                pass
        if public_buckets:
            pts = min(len(public_buckets) * 15, 30)
            score -= pts
            violations.append({
                'type': 'PUBLIC_S3', 'severity': 'high',
                'resources': public_buckets,
                'detail': f'{len(public_buckets)} S3 bucket(s) lack full public access block',
                'fix': 'Enable Block All Public Access on each bucket',
                'points_lost': pts,
            })
    except Exception as e:
        print(f"S3 compliance check error: {e}")

    # ── Check 3: Unresolved critical anomalies ────────────
    try:
        anomalies_tbl = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
        all_items = anomalies_tbl.query(
            IndexName='account_id-timestamp-index',
            KeyConditionExpression=Key('account_id').eq(account_id)
        ).get('Items', [])
        critical = [i for i in all_items
                    if i.get('severity') == 'critical'
                    and not i.get('resolved', False)]
        if critical:
            pts = min(len(critical) * 10, 25)
            score -= pts
            violations.append({
                'type': 'CRITICAL_ANOMALIES', 'severity': 'critical',
                'resources': [i.get('instance_id', '') for i in critical[:5]],
                'detail': f'{len(critical)} unresolved critical anomaly/anomalies',
                'fix': 'Investigate and resolve critical anomalies in the Anomalies page',
                'points_lost': pts,
            })
    except Exception as e:
        print(f"Anomaly compliance check error: {e}")

    score = max(0, score)
    grade = 'A' if score >= 90 else 'B' if score >= 75 else 'C' if score >= 60 else 'D' if score >= 40 else 'F'
    return response(200, {
        'score': score, 'grade': grade, 'violations': violations,
        'passing': score >= 80, 'account_id': account_id,
        'checked_at': datetime.now(timezone.utc).isoformat(),
    })


# ── GET /cost-forecast ─────────────────────────────────────
def get_cost_forecast(user_id='default-user'):
    role_arn, region, account_id = get_user_role_arn(user_id=user_id)
    if not account_id:
        return response(200, {'forecast': None, 'account_id': None})

    try:
        today = datetime.now(timezone.utc).date()
        first_of_month = today.replace(day=1)

        if today.month == 12:
            next_month_first = date(today.year + 1, 1, 1)
        else:
            next_month_first = date(today.year, today.month + 1, 1)
        days_in_month = (next_month_first - first_of_month).days

        if first_of_month.month == 1:
            first_of_last_month = date(first_of_month.year - 1, 12, 1)
        else:
            first_of_last_month = date(first_of_month.year, first_of_month.month - 1, 1)

        ce = get_assumed_client('ce', role_arn, 'us-east-1')

        last_resp = ce.get_cost_and_usage(
            TimePeriod={'Start': first_of_last_month.isoformat(), 'End': first_of_month.isoformat()},
            Granularity='MONTHLY', Metrics=['UnblendedCost']
        )
        last_month_cost = float(last_resp['ResultsByTime'][0]['Total']['UnblendedCost']['Amount']) if last_resp['ResultsByTime'] else 0.0

        days_elapsed = max((today - first_of_month).days, 1)
        this_month_cost = 0.0
        if today > first_of_month:
            this_resp = ce.get_cost_and_usage(
                TimePeriod={'Start': first_of_month.isoformat(), 'End': today.isoformat()},
                Granularity='MONTHLY', Metrics=['UnblendedCost']
            )
            if this_resp['ResultsByTime']:
                this_month_cost = float(this_resp['ResultsByTime'][0]['Total']['UnblendedCost']['Amount'])

        daily_rate = this_month_cost / days_elapsed
        projected = daily_rate * days_in_month
        delta_pct = ((projected - last_month_cost) / last_month_cost * 100) if last_month_cost > 0.01 else 0.0

        return response(200, {
            'last_month_cost': round(last_month_cost, 2),
            'this_month_so_far': round(this_month_cost, 2),
            'projected_month_total': round(projected, 2),
            'daily_rate': round(daily_rate, 4),
            'delta_pct': round(delta_pct, 1),
            'days_elapsed': days_elapsed,
            'days_in_month': days_in_month,
            'alert': delta_pct > 20,
            'account_id': account_id,
        })
    except BotocoreClientError as e:
        code = e.response['Error']['Code']
        if code in ('AccessDeniedException', 'OptInRequired'):
            return response(200, {'error': 'Cost Explorer not enabled or accessible for this account', 'account_id': account_id})
        return response(500, {'error': str(e)})
    except Exception as e:
        print(f"Cost forecast error: {e}")
        return response(500, {'error': str(e)})


# ── POST /accounts/connect ─────────────────────────────────
def connect_account(body):
    role_arn = body.get('role_arn')
    nickname = body.get('nickname', 'My AWS Account')
    region = body.get('region', 'us-east-1')
    user_id = body.get('user_id', 'default-user')

    if not role_arn:
        return response(400, {'error': 'role_arn required'})
    try:
        sts = boto3.client('sts')
        assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName='CloudGuardianValidation', DurationSeconds=900)
        account_id = assumed['AssumedRoleUser']['Arn'].split(':')[4]
        users_table = dynamodb.Table('cloud-guardian-users')
        users_table.update_item(
            Key={'user_id': user_id},
            UpdateExpression="SET account_id = :a, role_arn = :r, nickname = :n, #reg = :reg, connected_at = :c, #st = :s",
            ExpressionAttributeNames={'#reg': 'region', '#st': 'status'},
            ExpressionAttributeValues={
                ':a': account_id,
                ':r': role_arn,
                ':n': nickname,
                ':reg': region,
                ':c': datetime.now(timezone.utc).isoformat(),
                ':s': 'active'
            }
        )
        return response(200, {'message': 'Account connected successfully', 'account_id': account_id})
    except Exception as e:
        print(f"connect_account: role assumption failed for {role_arn}: {e}")
        return response(400, {'error': 'Could not assume the provided role. Please verify the Role ARN and that the trust policy allows Cloud Guardian to assume it.'})

# ── POST /accounts/disconnect ───────────────────────────────
def disconnect_account(body):
    user_id = body.get('user_id')
    if not user_id:
        return response(400, {'error': 'user_id required'})
    try:
        table = dynamodb.Table('cloud-guardian-users')
        table.update_item(
            Key={'user_id': user_id},
            UpdateExpression="REMOVE account_id, role_arn SET #st = :s",
            ExpressionAttributeNames={'#st': 'status'},
            ExpressionAttributeValues={':s': 'disconnected'}
        )
        return response(200, {'message': 'Account disconnected'})
    except Exception as e:
        return response(500, {'error': str(e)})

# ── GET /accounts/me ───────────────────────────────────────
def get_connected_account(user_id='default-user'):
    try:
        table = dynamodb.Table('cloud-guardian-users')
        result = table.get_item(Key={'user_id': user_id})
        item = result.get('Item')
        if not item:
            return response(404, {'error': 'No account connected'})
        return response(200, {
            'account_id': item.get('account_id'),
            'nickname': item.get('nickname'),
            'region': item.get('region'),
            'connected_at': item.get('connected_at'),
            'status': item.get('status'),
        })
    except Exception as e:
        return response(500, {'error': str(e)})

# ── POST /users/profile ────────────────────────────────────
_PROFILE_STRING_FIELDS = {
    'name': 'name', 'email': 'email', 'avatar_initials': 'avatar_initials',
    'company': 'company', 'role': 'job_title', 'timezone': 'timezone',
    'notification_email': 'notification_email', 'slack_webhook': 'slack_webhook',
}
_PROFILE_BOOL_FIELDS = {'alert_email': 'alert_email', 'alert_slack': 'alert_slack'}

def update_user_profile(body):
    user_id = body.get('user_id')
    if not user_id:
        return response(400, {'error': 'user_id required'})

    table = dynamodb.Table('cloud-guardian-users')

    update_parts = []
    expr_names = {}
    expr_vals = {}

    for field, attr in _PROFILE_STRING_FIELDS.items():
        if field in body:
            placeholder_name = f'#{attr}'
            placeholder_val = f':{attr}'
            update_parts.append(f'{placeholder_name} = {placeholder_val}')
            expr_names[placeholder_name] = attr
            expr_vals[placeholder_val] = body[field]

    for field, attr in _PROFILE_BOOL_FIELDS.items():
        if field in body:
            placeholder_name = f'#{attr}'
            placeholder_val = f':{attr}'
            update_parts.append(f'{placeholder_name} = {placeholder_val}')
            expr_names[placeholder_name] = attr
            expr_vals[placeholder_val] = bool(body[field])

    if not update_parts:
        return response(400, {'error': 'No profile fields to update'})

    try:
        table.update_item(
            Key={'user_id': user_id},
            UpdateExpression='SET ' + ', '.join(update_parts),
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_vals
        )
        return response(200, {'message': 'Profile updated'})
    except Exception as e:
        return response(500, {'error': str(e)})

# ── GET /users/profile ─────────────────────────────────────
def get_user_profile(user_id):
    if not user_id or user_id == 'default-user':
        return response(400, {'error': 'user_id required'})

    try:
        table = dynamodb.Table('cloud-guardian-users')
        result = table.get_item(Key={'user_id': user_id})
        item = result.get('Item', {})

        aws_connected = bool(item.get('account_id') and item.get('role_arn'))

        profile = {
            'name': item.get('name', 'User'),
            'email': item.get('email', ''),
            'avatar_initials': item.get('avatar_initials', 'U'),
            'company': item.get('company', ''),
            'role': item.get('job_title', ''),
            'timezone': item.get('timezone', 'Asia/Kolkata'),
            'notification_email': item.get('notification_email', ''),
            'slack_webhook': item.get('slack_webhook', ''),
            'alert_email': item.get('alert_email', True),
            'alert_slack': item.get('alert_slack', False),
            'aws_connected': aws_connected,
            'connected_account_id': item.get('account_id', ''),
            'aws_role_arn': item.get('role_arn', ''),
            'aws_region': item.get('region', 'us-east-1'),
        }
        return response(200, {'profile': profile})
    except Exception as e:
        return response(500, {'error': str(e)})

# ── GET /live-metrics ──────────────────────────────────────
def get_live_metrics(region='us-east-1', user_id='default-user'):
    try:
        role_arn, effective_region, account_id = get_user_role_arn(user_id=user_id, request_region=region)
        if not account_id:
            return response(200, {'metrics': [], 'account_id': None})
        ec2 = get_assumed_client('ec2', role_arn, effective_region)
        cloudwatch = get_assumed_client('cloudwatch', role_arn, effective_region)
        from datetime import timedelta
        instances_resp = ec2.describe_instances(Filters=[{'Name': 'instance-state-name', 'Values': ['running']}])
        live_data = []
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=1)
        for reservation in instances_resp['Reservations']:
            for inst in reservation['Instances']:
                instance_id = inst['InstanceId']
                cw_result = cloudwatch.get_metric_statistics(
                    Namespace='AWS/EC2', MetricName='CPUUtilization',
                    Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
                    StartTime=start_time, EndTime=end_time, Period=300, Statistics=['Average', 'Maximum']
                )
                datapoints = cw_result.get('Datapoints', [])
                cpu_avg = round(sum(d['Average'] for d in datapoints) / len(datapoints), 3) if datapoints else 0
                cpu_max = round(max(d['Maximum'] for d in datapoints), 3) if datapoints else 0
                live_data.append({
                    'instance_id': instance_id,
                    'instance_type': inst['InstanceType'],
                    'account_id': account_id,
                    'region': effective_region,
                    'cpu_avg': cpu_avg,
                    'cpu_max': cpu_max,
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'state': inst['State']['Name'],
                })
        return response(200, {'metrics': live_data, 'account_id': account_id, 'region': effective_region})
    except Exception as e:
        return response(500, {'error': str(e)})

# ── GET /audit-logs ────────────────────────────────────────
def get_audit_logs(region='us-east-1', user_id='default-user'):
    try:
        role_arn, effective_region, account_id = get_user_role_arn(user_id=user_id, request_region=region)
        if not account_id:
            return response(200, {'logs': []})
        cloudtrail = get_assumed_client('cloudtrail', role_arn, effective_region)
        result = cloudtrail.lookup_events(MaxResults=50)
        events = []
        for event in result.get('Events', []):
            source = event.get('EventSource', '')
            name = event.get('EventName', '')
            if any(svc in source for svc in ['lambda', 'dynamodb', 's3', 'sns', 'apigateway', 'cloudwatch', 'cloudtrail', 'ec2', 'rds']):
                events.append({
                    'event_id': event.get('EventId', ''),
                    'action': name,
                    'service': source.replace('.amazonaws.com', ''),
                    'user': event.get('Username', 'system'),
                    'status': 'success',
                    'region': effective_region,
                    'time': event.get('EventTime', '').isoformat() if event.get('EventTime') else '',
                    'detail': f"{name} — {', '.join([r.get('ResourceName', '') for r in event.get('Resources', [])])}"
                })
        events.sort(key=lambda x: x.get('time', ''), reverse=True)
        return response(200, {'logs': events[:50]})
    except Exception as e:
        return response(500, {'error': str(e)})

# ── Auth Verification ──────────────────────────────────────
def _get_jwks():
    global _JWKS_CACHE
    if _JWKS_CACHE is None:
        with urllib.request.urlopen(_JWKS_URL, timeout=5) as r:
            _JWKS_CACHE = json.loads(r.read().decode())
    return _JWKS_CACHE

def verify_token(event):
    headers = {k.lower(): str(v) for k, v in (event.get('headers') or {}).items()}
    auth_header = headers.get('authorization')

    if not auth_header:
        multi_headers = {k.lower(): v for k, v in (event.get('multiValueHeaders') or {}).items()}
        auth_headers_list = multi_headers.get('authorization', [])
        if auth_headers_list:
            auth_header = auth_headers_list[0]

    if not auth_header or not auth_header.lower().startswith('bearer '):
        print(f"Missing or invalid auth_header format: {auth_header}")
        return None

    token = auth_header[7:].strip()
    if token.startswith('"') and token.endswith('"'):
        token = token[1:-1]

    try:
        from jose import jwt, JWTError

        # Cognito access tokens (unlike ID tokens) carry no `aud` claim, so
        # `aud` verification is off — but we replace it with the equivalent
        # checks Cognito puts on access tokens: token_use and client_id.
        payload = jwt.decode(
            token,
            _get_jwks(),
            algorithms=['RS256'],
            issuer=_COGNITO_ISSUER,
            options={'verify_at_hash': False, 'verify_aud': False}
        )

        if payload.get('token_use') != 'access':
            print(f"Rejected token with token_use={payload.get('token_use')!r}, expected 'access'")
            return None

        if _COGNITO_CLIENT_ID and payload.get('client_id') != _COGNITO_CLIENT_ID:
            print(f"Rejected token with client_id={payload.get('client_id')!r}, expected {_COGNITO_CLIENT_ID!r}")
            return None

        user_id = payload.get('sub') or payload.get('username')
        if not user_id:
            print("No sub in verified token payload")
            return None

        return user_id
    except Exception as e:
        print(f"Token verification failed: {e}")
        return None

# ── Main router ────────────────────────────────────────────
def main(event, context):
    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    query = event.get('queryStringParameters') or {}
    body = {}

    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except:
            pass

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    print(f"{method} {path}")

    # Enforce strict authentication
    user_id = verify_token(event)
    if not user_id:
        return response(401, {'error': 'Unauthorized: Invalid or missing token'})
        
    # Inject verified identity into downstream parameters safely
    query['user_id'] = user_id
    body['user_id'] = user_id

    # Extract common params
    request_region = query.get('region', 'us-east-1')

    routes = {
        ('GET',  '/metrics/history'):          lambda: get_instance_metrics_history(query.get('instance_id', ''), request_region, query.get('hours', 2), user_id),
        ('GET',  '/metrics'):                  lambda: get_metrics(query.get('account_id'), request_region),
        ('GET',  '/live-metrics'):             lambda: get_live_metrics(request_region, user_id),
        ('GET',  '/anomalies'):                lambda: get_anomalies(query, user_id),
        ('POST', '/anomalies/resolve'):        lambda: resolve_anomaly(body),
        ('GET',  '/cost-suggestions'):         lambda: get_cost_suggestions(query, user_id),
        ('POST', '/cost-suggestions/dismiss'): lambda: dismiss_suggestion(body),
        ('POST', '/ec2/stop'):                 lambda: stop_ec2(body),
        ('POST', '/ebs/delete'):               lambda: delete_ebs(body),
        ('POST', '/eip/release'):              lambda: release_eip(body),
        ('POST', '/rds/stop'):                 lambda: stop_rds(body),
        ('POST', '/ec2/resize'):               lambda: resize_ec2(body),
        ('GET',  '/security-events'):          lambda: get_security_events(query, user_id),
        ('GET',  '/reports'):                  lambda: get_reports(user_id),
        ('GET',  '/reports/content'):          lambda: get_report_content(query.get('key', ''), request_region),
        ('POST', '/agent'):                    lambda: ask_agent(body),
        ('POST', '/security/scan'):            lambda: scan_security_now(user_id),
        ('POST', '/security/fix'):             lambda: security_fix(body),
        ('GET',  '/compliance-score'):         lambda: get_compliance_score(user_id),
        ('GET',  '/cost-forecast'):            lambda: get_cost_forecast(user_id),
        ('POST', '/accounts/connect'):         lambda: connect_account(body),
        ('GET',  '/accounts/me'):              lambda: get_connected_account(query.get('user_id', user_id)),
        ('POST', '/accounts/disconnect'):      lambda: disconnect_account(body),
        ('GET',  '/audit-logs'):               lambda: get_audit_logs(request_region, user_id),
        ('POST', '/users/profile'):            lambda: update_user_profile(body),
        ('GET',  '/users/profile'):            lambda: get_user_profile(user_id),
    }

    handler = routes.get((method, path))
    if handler:
        try:
            return handler()
        except RoleAssumptionError as e:
            print(str(e))
            return response(502, {'error': 'Could not assume the connected AWS role. Please reconnect your account.'})

    return response(404, {'error': f'Route {method} {path} not found'})