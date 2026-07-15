import boto3
import json
import os
import requests
from botocore.exceptions import ClientError
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

def _report_s3_key(account_id):
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    return f"reports/{account_id}/weekly-report-{timestamp}.txt"


def report_already_exists(account_id):
    """Checks whether today's report was already generated for this account —
    guards against burning a Gemini call on SQS retries or a duplicate
    dispatch_users run re-enqueueing the same account the same day."""
    bucket = os.getenv('S3_BUCKET_NAME')
    s3 = boto3.client('s3', region_name='us-east-1')
    try:
        s3.head_object(Bucket=bucket, Key=_report_s3_key(account_id))
        return True
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == '404':
            return False
        raise


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


def generate_reports_batch(accounts_data):
    """
    Same report as generate_report, but for multiple accounts in a single
    Gemini request — cuts call volume when one Lambda invocation receives
    several SQS records at once (batch size > 1).
    accounts_data: [{account_id, region, anomalies, cost_suggestions}, ...]
    Returns {account_id: report_text}.
    """
    if not accounts_data:
        return {}
    if len(accounts_data) == 1:
        a = accounts_data[0]
        return {a['account_id']: generate_report(a['anomalies'], a['cost_suggestions'], a['account_id'], a['region'])}

    accounts_json = {
        a['account_id']: {
            'region': a['region'],
            'anomalies_count': len(a['anomalies']),
            'cost_opportunities_count': len(a['cost_suggestions']),
            'anomalies': json.loads(json.dumps(a['anomalies'][:10], default=str)),
            'cost_suggestions': json.loads(json.dumps(a['cost_suggestions'][:5], default=str)),
        }
        for a in accounts_data
    }
    prompt = f"""Write a 3-day AWS infrastructure health report for EACH of the following AWS accounts, independently.

Accounts (keyed by account_id):
{json.dumps(accounts_json, indent=2)}

For each account, include exactly these sections: 1) Executive summary 2) Critical issues 3) Cost savings 4) Health score /10 5) Top 3 actions next 3 days.
Format each report clearly and complete all 5 sections. Plain text, concise.

Respond ONLY with a JSON object keyed by account_id (no markdown, no extra text), where each value is that account's full report text as a single string. Every account_id above must appear as a key."""
    response = requests.post(GEMINI_API_URL,
        headers={"Content-Type": "application/json"},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4000 * len(accounts_data)}
        })
    response.raise_for_status()
    raw_text = response.json()['candidates'][0]['content']['parts'][0]['text'].strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    return json.loads(raw_text.strip())


def save_to_s3(report_text, account_id):
    s3 = boto3.client('s3', region_name='us-east-1')
    bucket = os.getenv('S3_BUCKET_NAME')
    key = _report_s3_key(account_id)
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

def generate_for_users(users):
    """
    Generate + deliver reports for a batch of connected accounts (as delivered
    by one SQS invocation), using a single batched Gemini call for whatever
    accounts don't already have today's report. Raises on failure so the SQS
    event source retries and, after exhausting retries, routes the message(s)
    to the DLQ instead of the failure disappearing silently.
    """
    pending = []
    for user in users:
        account_id = user.get('account_id')
        if not account_id:
            continue
        if report_already_exists(account_id):
            print(f"Report already exists today for account {account_id}, skipping")
            continue
        pending.append({
            'account_id': account_id,
            'region': user.get('region', 'us-east-1'),
            'anomalies': get_weekly_anomalies(account_id=account_id),
            'cost_suggestions': get_cost_suggestions(account_id=account_id),
        })

    if not pending:
        return

    print(f"Generating {len(pending)} report(s) for accounts: {[a['account_id'] for a in pending]}")
    reports = generate_reports_batch(pending)

    for a in pending:
        report = reports.get(a['account_id'])
        if report is None:
            print(f"No report returned for account {a['account_id']}, skipping")
            continue
        save_to_s3(report, a['account_id'])
        send_sns(report, a['account_id'])


def dispatch_users():
    """Fan out: enqueue one SQS message per connected account instead of looping
    through every account serially inside a single (15-minute-capped) invocation."""
    users = get_all_users()
    print(f"Report dispatch for {len(users)} connected accounts")
    if not users:
        return {'statusCode': 200, 'body': 'No connected accounts'}

    queue_url = os.environ['REPORT_GENERATOR_QUEUE_URL']
    sqs = boto3.client('sqs', region_name='us-east-1')
    for user in users:
        sqs.send_message(QueueUrl=queue_url, MessageBody=json.dumps(user))

    return {'statusCode': 200, 'body': json.dumps({'message': f'Dispatched {len(users)} accounts to the report-generator queue'})}


def main(event=None, context=None):
    if event and event.get('Records') and event['Records'][0].get('eventSource') == 'aws:sqs':
        users = [json.loads(record['body']) for record in event['Records']]
        generate_for_users(users)
        return {'statusCode': 200, 'body': json.dumps({'reports_generated': len(event['Records'])})}

    return dispatch_users()

if __name__ == '__main__':
    result = main()
    print(result['body'])