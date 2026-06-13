import boto3
import json
import os
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

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
    items = table.scan().get('Items', [])
    if account_id:
        items = [i for i in items if i.get('account_id') == account_id]
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    return [i for i in items if i.get('timestamp', '') >= week_ago]

def get_cost_suggestions(account_id=None):
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions'))
    items = table.scan().get('Items', [])
    if account_id:
        items = [i for i in items if i.get('account_id') == account_id]
    return [i for i in items if i.get('status') != 'dismissed']

def generate_report(anomalies, cost_suggestions, account_id, region):
    prompt = f"""Write a weekly AWS infrastructure health report.
Account: {account_id}, Region: {region}
Anomalies this week: {len(anomalies)} | Cost opportunities: {len(cost_suggestions)}
Anomalies: {json.dumps(anomalies, default=str)[:1500]}
Cost suggestions: {json.dumps(cost_suggestions, default=str)[:800]}

Include: 1) Executive summary 2) Critical issues 3) Cost savings 4) Health score /10 5) Top 3 actions next week.
Plain text, concise."""
    response = requests.post(GROQ_API_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
        json={"model": "llama-3.1-8b-instant",
              "messages": [{"role": "user", "content": prompt}],
              "temperature": 0.3, "max_tokens": 1000})
    response.raise_for_status()
    return response.json()['choices'][0]['message']['content']

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

def main(event=None, context=None):
    print("Generating weekly reports for all users...")
    users = get_all_users()

    if not users:
        return {'statusCode': 200, 'body': 'No connected accounts'}

    reports_generated = 0
    for user in users:
        account_id = user.get('account_id')
        region = user.get('region', 'us-east-1')
        user_id = user.get('user_id')
        if not account_id:
            continue
        print(f"Generating report for account {account_id} (user {user_id})")
        try:
            anomalies = get_weekly_anomalies(account_id=account_id)
            suggestions = get_cost_suggestions(account_id=account_id)
            report = generate_report(anomalies, suggestions, account_id, region)
            save_to_s3(report, account_id)
            send_sns(report, account_id)
            reports_generated += 1
        except Exception as e:
            print(f"Error generating report for {account_id}: {e}")

    return {'statusCode': 200, 'body': json.dumps({'reports_generated': reports_generated})}

if __name__ == '__main__':
    result = main()
    print(result['body'])