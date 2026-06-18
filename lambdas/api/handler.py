import json
import boto3
import os
from datetime import datetime, timezone
from decimal import Decimal
from dotenv import load_dotenv
import jwt
from jwt import PyJWKClient

load_dotenv()

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

def cors_headers(origin='*'):
    headers = {
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json',
        'Access-Control-Allow-Credentials': 'true'
    }
    headers['Access-Control-Allow-Origin'] = origin
    if origin == '*':
        headers.pop('Access-Control-Allow-Credentials', None)
    return headers

current_origin = '*'

def response(status_code, body, extra_headers=None):
    headers = cors_headers(current_origin)
    if extra_headers:
        headers.update(extra_headers)
    return {
        'statusCode': status_code,
        'headers': headers,
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def get_token_from_cookie(headers):
    if not headers: return None
    cookie_header = headers.get('cookie') or headers.get('Cookie')
    if not cookie_header: return None
    for item in cookie_header.split(';'):
        if '=' in item:
            k, v = item.strip().split('=', 1)
            if k == 'cg_token':
                return v
    return None

def verify_token(token):
    try:
        region = os.getenv('NEXT_PUBLIC_REGION', 'us-east-1')
        user_pool_id = os.getenv('NEXT_PUBLIC_COGNITO_USER_POOL_ID', 'us-east-1_yqv39lzIR')
        url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
        jwks_client = PyJWKClient(url)
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        data = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False}
        )
        return data.get('sub') or data.get('username')
    except Exception as e:
        print(f"Token verification failed: {e}")
        return None

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

def get_assumed_client(service, role_arn=None, region='us-east-1'):
    if not role_arn:
        return boto3.client(service, region_name=region)
    try:
        sts = boto3.client('sts')
        assumed = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName='CloudGuardianSession',
            DurationSeconds=900
        )
        creds = assumed['Credentials']
        return boto3.client(
            service, region_name=region,
            aws_access_key_id=creds['AccessKeyId'],
            aws_secret_access_key=creds['SecretAccessKey'],
            aws_session_token=creds['SessionToken']
        )
    except Exception as e:
        print(f"Role assumption failed: {e} — falling back to own credentials")
        return boto3.client(service, region_name=region)

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
    result = table.scan()
    items = result.get('Items', [])
    if not account_id:
        return response(200, {'metrics': [], 'account_id': None})
    if account_id:
        items = [i for i in items if i.get('account_id') == account_id]
    if region:
        items = [i for i in items if i.get('region', 'us-east-1') == region]
    items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
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
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    result = table.scan()
    items = result.get('Items', [])
    if not account_id:
        return response(200, {'anomalies': []})
    if account_id:
        items = [i for i in items if i.get('account_id') == account_id]
    if query_params:
        severity = query_params.get('severity')
        resolved = query_params.get('resolved')
        if severity:
            items = [i for i in items if i.get('severity') == severity]
        if resolved is not None:
            is_resolved = resolved.lower() == 'true'
            items = [i for i in items if i.get('resolved', False) == is_resolved]
    items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
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
    table = dynamodb.Table(os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions'))
    result = table.scan()
    items = result.get('Items', [])
    if not account_id:
        return response(200, {'suggestions': []})
    if account_id:
        items = [i for i in items if i.get('account_id') == account_id]
    items = [i for i in items if i.get('status') != 'dismissed']
    items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    return response(200, {'suggestions': items})

# ── POST /cost-suggestions/dismiss ────────────────────────
def dismiss_suggestion(body):
    table = dynamodb.Table(os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions'))
    resource_id = body.get('resource_id')
    result = table.scan()
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
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    result = table.scan()
    items = result.get('Items', [])
    security = [i for i in items if i.get('event_type') in ['security', 'remediation']]
    if not account_id:
        return response(200, {'events': []})
    if account_id:
        security = [i for i in security if i.get('account_id') == account_id]
    security.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
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
def ask_agent(body):
    import requests as req
    message = body.get('message', '')
    context = body.get('context', {})
    user_id = body.get('user_id', 'default-user')
    gemini_key = os.getenv('GEMINI_API_KEY')

    role_arn, region, account_id = get_user_role_arn(user_id=user_id)

    metrics_table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    anomalies_table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))

    recent_metrics = metrics_table.scan(Limit=10).get('Items', [])
    recent_anomalies = anomalies_table.scan(Limit=5).get('Items', [])

    if account_id:
        recent_metrics = [m for m in recent_metrics if m.get('account_id') == account_id]
        recent_anomalies = [a for a in recent_anomalies if a.get('account_id') == account_id]

    unresolved = [a for a in recent_anomalies if not a.get('resolved', False)]

    system_prompt = f"""You are Cloud Guardian AI — an expert AWS infrastructure assistant.
Current account state (Account: {account_id or 'unknown'}, Region: {region}):
- Recent metrics: {json.dumps(recent_metrics, cls=DecimalEncoder)[:500]}
- Unresolved anomalies: {json.dumps(unresolved, cls=DecimalEncoder)[:500]}
- Additional context: {json.dumps(context)[:200]}
Answer questions specifically about their infrastructure. Be concise and actionable."""

    gemini_response = req.post(
        f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}',
        headers={'Content-Type': 'application/json'},
        json={
            'systemInstruction': {
                'parts': [{'text': system_prompt}]
            },
            'contents': [
                {'parts': [{'text': message}]}
            ],
            'generationConfig': {
                'temperature': 0.3,
                'maxOutputTokens': 400
            }
        }
    )
    ai_text = gemini_response.json().get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', 'Error generating response')
    return response(200, {'reply': ai_text})

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
        return response(400, {'error': f'Could not assume role: {str(e)}'})

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
def update_user_profile(body):
    user_id = body.get('user_id')
    if not user_id:
        return response(400, {'error': 'user_id required'})
    
    table = dynamodb.Table('cloud-guardian-users')
    
    update_expr = "SET #n = :n, email = :e"
    expr_names = {'#n': 'name'}
    expr_vals = {
        ':n': body.get('name', 'User'),
        ':e': body.get('email', ''),
    }
    
    if 'avatar_initials' in body:
        update_expr += ", avatar_initials = :a"
        expr_vals[':a'] = body['avatar_initials']
        
    try:
        table.update_item(
            Key={'user_id': user_id},
            UpdateExpression=update_expr,
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
            'aws_connected': aws_connected,
            'connected_account_id': item.get('account_id', '')
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

# ── Main router ────────────────────────────────────────────
def main(event, context):
    global current_origin
    headers = event.get('headers') or {}
    current_origin = headers.get('origin') or headers.get('Origin') or '*'

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
        return {'statusCode': 200, 'headers': cors_headers(current_origin), 'body': ''}

    print(f"{method} {path}")

    user_id = 'default-user'
    token = get_token_from_cookie(headers)
    if not token:
        auth_header = headers.get('authorization') or headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            
    if token:
        v_sub = verify_token(token)
        if v_sub:
            user_id = v_sub

    if user_id == 'default-user':
        user_id = query.get('user_id', body.get('user_id', 'default-user'))

    request_region = query.get('region', 'us-east-1')

    if path == '/auth/session' and method == 'POST':
        req_token = body.get('token')
        if not req_token: return response(400, {'error': 'Token required'})
        v_sub = verify_token(req_token)
        if not v_sub: return response(401, {'error': 'Invalid token'})
        return response(200, {'success': True, 'userId': v_sub}, {
            'Set-Cookie': f'cg_token={req_token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=604800'
        })
        
    if path == '/auth/logout' and method == 'POST':
        return response(200, {'success': True}, {
            'Set-Cookie': 'cg_token=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0'
        })

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
        ('POST', '/accounts/connect'):         lambda: connect_account(body),
        ('GET',  '/accounts/me'):              lambda: get_connected_account(query.get('user_id', user_id)),
        ('GET',  '/audit-logs'):               lambda: get_audit_logs(request_region, user_id),
        ('POST', '/users/profile'):            lambda: update_user_profile(body),
        ('GET',  '/users/profile'):            lambda: get_user_profile(user_id),
    }

    handler = routes.get((method, path))
    if handler:
        return handler()

    return response(404, {'error': f'Route {method} {path} not found'})