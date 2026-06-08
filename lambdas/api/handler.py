import json
import boto3
import os
from datetime import datetime, timezone
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Content-Type': 'application/json'
    }

def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': cors_headers(),
        'body': json.dumps(body, cls=DecimalEncoder)
    }

# ── GET /metrics ──────────────────────────────────────────
def get_metrics(account_id=None, region=None):
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    result = table.scan()
    items = result.get('Items', [])
    if account_id:
        items = [i for i in items if i.get('account_id') == account_id]
    if region:
        items = [i for i in items if i.get('region', 'us-east-1') == region]
    items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    return response(200, {'metrics': items[:50]})


def get_instance_metrics_history(instance_id, region='us-east-1'):
    """Fetch last 24 hours of CPU data from CloudWatch"""
    try:
        from datetime import timedelta
        cloudwatch = boto3.client('cloudwatch', region_name=region)
        
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=24)
        
        result = cloudwatch.get_metric_statistics(
            Namespace='AWS/EC2',
            MetricName='CPUUtilization',
            Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
            StartTime=start_time,
            EndTime=end_time,
            Period=3600,
            Statistics=['Average', 'Maximum']
        )
        
        datapoints = result.get('Datapoints', [])
        datapoints.sort(key=lambda x: x['Timestamp'])
        
        chart_data = []
        for dp in datapoints:
            chart_data.append({
                'time': dp['Timestamp'].strftime('%H:%M'),
                'cpu': round(dp['Average'], 2),
                'cpu_max': round(dp['Maximum'], 2),
            })
        
        return response(200, {'history': chart_data, 'instance_id': instance_id})
    except Exception as e:
        return response(500, {'error': str(e)})


# ── GET /anomalies ─────────────────────────────────────────
def get_anomalies(query_params=None):
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    result = table.scan()
    items = result.get('Items', [])

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
        ExpressionAttributeValues={
            ':r': True,
            ':t': datetime.now(timezone.utc).isoformat()
        }
    )
    return response(200, {'message': 'Anomaly marked as resolved'})

# ── GET /cost-suggestions ──────────────────────────────────
def get_cost_suggestions(query_params=None):
    table = dynamodb.Table(os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions'))
    result = table.scan()
    items = result.get('Items', [])
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
def get_security_events(query_params=None):
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    result = table.scan()
    items = result.get('Items', [])
    security = [i for i in items if i.get('event_type') in ['security', 'remediation']]
    security.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    return response(200, {'events': security})

# ── GET /reports ───────────────────────────────────────────
def get_reports():
    s3 = boto3.client('s3', region_name='us-east-1')
    bucket = os.getenv('S3_BUCKET_NAME')

    try:
        result = s3.list_objects_v2(Bucket=bucket, Prefix='reports/')
        objects = result.get('Contents', [])
        reports = []
        for obj in objects:
            key = obj['Key']
            url = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket, 'Key': key},
                ExpiresIn=3600
            )
            reports.append({
                'key': key,
                'date': obj['LastModified'].isoformat(),
                'url': url,
                'size': obj['Size']
            })
        reports.sort(key=lambda x: x['date'], reverse=True)
        return response(200, {'reports': reports})
    except Exception as e:
        return response(500, {'error': str(e)})

# ── POST /agent ────────────────────────────────────────────
def ask_agent(body):
    import requests as req
    message = body.get('message', '')
    context = body.get('context', {})
    groq_key = os.getenv('GROQ_API_KEY')

    metrics_table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))
    anomalies_table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))

    recent_metrics = metrics_table.scan(Limit=10).get('Items', [])
    recent_anomalies = anomalies_table.scan(Limit=5).get('Items', [])
    unresolved = [a for a in recent_anomalies if not a.get('resolved', False)]

    system_prompt = f"""You are Cloud Guardian AI — an expert AWS infrastructure assistant.
Current account state:
- Recent metrics: {json.dumps(recent_metrics, cls=DecimalEncoder)[:500]}
- Unresolved anomalies: {json.dumps(unresolved, cls=DecimalEncoder)[:500]}
- Additional context: {json.dumps(context)[:200]}

Answer questions specifically about their infrastructure. Be concise and actionable.
Keep responses under 150 words unless more detail is needed."""

    groq_response = req.post(
        'https://api.groq.com/openai/v1/chat/completions',
        headers={'Authorization': f'Bearer {groq_key}', 'Content-Type': 'application/json'},
        json={
            'model': 'llama-3.1-8b-instant',
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': message}
            ],
            'temperature': 0.3,
            'max_tokens': 400
        }
    )

    ai_text = groq_response.json()['choices'][0]['message']['content']
    return response(200, {'reply': ai_text})

# ── POST /accounts/connect ─────────────────────────────────
def connect_account(body):
    import boto3 as b3
    role_arn = body.get('role_arn')
    nickname = body.get('nickname', 'My AWS Account')
    region = body.get('region', 'us-east-1')

    if not role_arn:
        return response(400, {'error': 'role_arn required'})

    try:
        sts = b3.client('sts')
        assumed = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName='CloudGuardianValidation',
            DurationSeconds=900
        )
        account_id = assumed['AssumedRoleUser']['Arn'].split(':')[4]

        users_table = dynamodb.Table('cloud-guardian-users')
        users_table.put_item(Item={
            'user_id': 'default-user',
            'account_id': account_id,
            'role_arn': role_arn,
            'nickname': nickname,
            'region': region,
            'connected_at': datetime.now(timezone.utc).isoformat(),
            'status': 'active'
        })

        return response(200, {
            'message': 'Account connected successfully',
            'account_id': account_id
        })
    except Exception as e:
        return response(400, {'error': f'Could not assume role: {str(e)}'})
    
    
    
def get_audit_logs(region='us-east-1'):
    try:
        cloudtrail = boto3.client('cloudtrail', region_name=region)
        
        result = cloudtrail.lookup_events(
            MaxResults=50,
        )
        
        events = []
        for event in result.get('Events', []):
            source = event.get('EventSource', '')
            name = event.get('EventName', '')
            if any(svc in source for svc in ['lambda', 'dynamodb', 's3', 'sns', 'apigateway', 'cloudwatch', 'cloudtrail']):
                events.append({
                    'event_id': event.get('EventId', ''),
                    'action': name,
                    'service': source.replace('.amazonaws.com', ''),
                    'user': event.get('Username', 'system'),
                    'status': 'success',
                    'region': region,
                    'time': event.get('EventTime', '').isoformat() if event.get('EventTime') else '',
                    'detail': f"{name} — {', '.join([r.get('ResourceName', '') for r in event.get('Resources', [])])}"
                })

        events.sort(key=lambda x: x.get('time', ''), reverse=True)
        return response(200, {'logs': events[:50]})

    except Exception as e:
        return response(500, {'error': str(e)})
    
    

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

    # Handle CORS preflight
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    print(f"{method} {path}")

    routes = {
        ('GET', '/metrics/history'):           lambda: get_instance_metrics_history(query.get('instance_id', ''),query.get('region', 'us-east-1')),
        ('GET', '/metrics'):                   lambda: get_metrics(query.get('account_id'),query.get('region')),
        ('GET',  '/anomalies'):                lambda: get_anomalies(query),
        ('POST', '/anomalies/resolve'):        lambda: resolve_anomaly(body),
        ('GET',  '/cost-suggestions'):         lambda: get_cost_suggestions(query),
        ('POST', '/cost-suggestions/dismiss'): lambda: dismiss_suggestion(body),
        ('GET',  '/security-events'):          lambda: get_security_events(query),
        ('GET',  '/reports'):                  lambda: get_reports(),
        ('POST', '/agent'):                    lambda: ask_agent(body),
        ('POST', '/accounts/connect'):         lambda: connect_account(body),
        ('GET', '/audit-logs'):                lambda: get_audit_logs(query.get('region', 'us-east-1')),
    }

    handler = routes.get((method, path))
    if handler:
        return handler()

    return response(404, {'error': f'Route {method} {path} not found'})