import boto3
import json
import os
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from boto3.dynamodb.conditions import Key

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

def get_all_users():
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table('cloud-guardian-users')
        result = table.scan()
        return result.get('Items', [])
    except Exception as e:
        print(f"Error getting users: {e}")
        return []

def get_weekly_anomalies(account_id=None):
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    if not account_id:
        return []
    items = table.query(
        IndexName='account_id-timestamp-index',
        KeyConditionExpression=Key('account_id').eq(account_id)
    ).get('Items', [])
    days_ago = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    return [i for i in items if i.get('timestamp', '') >= days_ago]

def get_cost_suggestions(account_id=None):
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions'))
    if not account_id:
        return []
    items = table.query(KeyConditionExpression=Key('account_id').eq(account_id)).get('Items', [])
    return [i for i in items if i.get('status') != 'dismissed']

def generate_report(anomalies, cost_suggestions, account_id, region):
    prompt = f"""Write a 3-day AWS infrastructure health report.
Account: {account_id}, Region: {region}
Anomalies past 3 days: {len(anomalies)} | Cost opportunities: {len(cost_suggestions)}
Anomalies: {json.dumps(anomalies[:10], default=str)}
Cost suggestions: {json.dumps(cost_suggestions[:5], default=str)}

Include exactly these sections: 1) Executive summary 2) Critical issues 3) Cost savings 4) Health score /10 5) Top 3 actions next 3 days.
Format the output clearly and complete all 5 sections. Plain text, concise."""
    response = requests.post(GEMINI_API_URL,
        headers={"Content-Type": "application/json"},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4000}
        })
    response.raise_for_status()
    return response.json()['candidates'][0]['content']['parts'][0]['text']

def save_to_s3(report_text, account_id):
    s3 = boto3.client('s3', region_name='us-east-1')
    bucket = os.getenv('S3_BUCKET_NAME')
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    key = f"reports/{account_id}/weekly-report-{timestamp}.txt"
    s3.put_object(Bucket=bucket, Key=key, Body=report_text.encode('utf-8'), ContentType='text/plain')
    print(f"Report saved: s3://{bucket}/{key}")
    return key

def send_sns(report_text, account_id):
    sns_arn = os.getenv('SNS_TOPIC_ARN')
    if not sns_arn:
        return
    sns = boto3.client('sns', region_name='us-east-1')
    sns.publish(
        TopicArn=sns_arn,
        Subject=f"Cloud Guardian Weekly Report — {datetime.now(timezone.utc).strftime('%Y-%m-%d')} — {account_id}",
        Message=report_text
    )

_QUEUE_URL = os.getenv(
    'REPORT_GENERATOR_QUEUE_URL',
    'https://sqs.us-east-1.amazonaws.com/808715035605/cloud-guardian-report-generator-queue'
)


def generate_for_user(user):
    """Generate + deliver a report for a single connected account. Raises on
    failure so the SQS event source retries and, after exhausting retries,
    routes the message to the DLQ instead of the failure disappearing silently."""
    account_id = user.get('account_id')
    region = user.get('region', 'us-east-1')
    user_id = user.get('user_id')
    if not account_id:
        return
    print(f"Generating report for account {account_id} (user {user_id})")
    anomalies = get_weekly_anomalies(account_id=account_id)
    suggestions = get_cost_suggestions(account_id=account_id)
    report = generate_report(anomalies, suggestions, account_id, region)
    save_to_s3(report, account_id)
    send_sns(report, account_id)


def dispatch_users():
    """Fan out: enqueue one SQS message per connected account instead of looping
    through every account serially inside a single (15-minute-capped) invocation."""
    users = get_all_users()
    print(f"Report dispatch for {len(users)} connected accounts")
    if not users:
        return {'statusCode': 200, 'body': 'No connected accounts'}

    sqs = boto3.client('sqs', region_name='us-east-1')
    for user in users:
        sqs.send_message(QueueUrl=_QUEUE_URL, MessageBody=json.dumps(user))

    return {'statusCode': 200, 'body': json.dumps({'message': f'Dispatched {len(users)} accounts to the report-generator queue'})}


def main(event=None, context=None):
    if event and event.get('Records') and event['Records'][0].get('eventSource') == 'aws:sqs':
        for record in event['Records']:
            generate_for_user(json.loads(record['body']))
        return {'statusCode': 200, 'body': json.dumps({'reports_generated': len(event['Records'])})}

    return dispatch_users()

if __name__ == '__main__':
    result = main()
    print(result['body'])