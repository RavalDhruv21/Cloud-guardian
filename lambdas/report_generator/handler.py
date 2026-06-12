import boto3
import json
import os
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

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

def get_weekly_anomalies(account_id=None):
    """Fetch anomalies from the past 7 days for the connected account"""
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    response = table.scan()
    items = response.get('Items', [])

    # Filter by account_id
    if account_id:
        items = [i for i in items if i.get('account_id') == account_id]

    # Filter last 7 days
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recent = [i for i in items if i.get('timestamp', '') >= week_ago]
    return recent

def get_cost_suggestions(account_id=None):
    """Fetch pending cost suggestions for the connected account"""
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions'))
    response = table.scan()
    items = response.get('Items', [])

    # Filter by account_id
    if account_id:
        items = [i for i in items if i.get('account_id') == account_id]

    return [i for i in items if i.get('status') != 'dismissed']

def generate_report_with_ai(anomalies, cost_suggestions, account_id=None, region=None):
    """Ask Groq to write the weekly report"""
    prompt = f"""
You are an AWS infrastructure analyst writing a weekly health report.

Account ID: {account_id or 'unknown'}
Region: {region or 'us-east-1'}

Anomalies detected this week ({len(anomalies)} total):
{json.dumps(anomalies, indent=2, default=str)[:2000]}

Cost optimization opportunities ({len(cost_suggestions)} found):
{json.dumps(cost_suggestions, indent=2, default=str)[:1000]}

Write a clear, professional weekly infrastructure health report.
Include:
1. Executive summary (2-3 sentences)
2. Critical issues requiring immediate attention
3. Cost savings opportunities with estimated total savings
4. Overall infrastructure health score out of 10
5. Top 3 recommended actions for next week

Keep it concise and actionable. Plain text format.
"""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    body = {
        "model": "llama-3.1-8b-instant",
        "messages": [
            {"role": "system", "content": "You are an AWS infrastructure analyst. Write clear, professional reports."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 1000
    }
    response = requests.post(GROQ_API_URL, headers=headers, json=body)
    response.raise_for_status()
    return response.json()['choices'][0]['message']['content']

def save_report_to_s3(report_text, account_id=None):
    """Save the report to S3 — organized by account"""
    s3 = boto3.client('s3', region_name='us-east-1')
    bucket = os.getenv('S3_BUCKET_NAME')
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    # Organize reports by account_id folder
    if account_id:
        key = f"reports/{account_id}/weekly-report-{timestamp}.txt"
    else:
        key = f"reports/weekly-report-{timestamp}.txt"

    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=report_text.encode('utf-8'),
        ContentType='text/plain'
    )
    print(f"Report saved to s3://{bucket}/{key}")
    return key

def send_report_via_sns(report_text, account_id=None):
    """Email the report via SNS"""
    sns_arn = os.getenv('SNS_TOPIC_ARN')
    if not sns_arn:
        return
    sns = boto3.client('sns', region_name='us-east-1')
    sns.publish(
        TopicArn=sns_arn,
        Subject=f"Cloud Guardian Weekly Report — {datetime.now(timezone.utc).strftime('%Y-%m-%d')} — Account {account_id or 'unknown'}",
        Message=report_text
    )
    print("Weekly report sent via email")

def main(event=None, context=None):
    """Lambda handler"""
    print("Generating weekly infrastructure report...")

    # Get user's connected account
    role_arn, region, account_id = get_user_role()
    print(f"Generating report for account: {account_id}, region: {region}")

    anomalies = get_weekly_anomalies(account_id=account_id)
    cost_suggestions = get_cost_suggestions(account_id=account_id)

    print(f"Found {len(anomalies)} anomalies and {len(cost_suggestions)} cost suggestions")

    report = generate_report_with_ai(
        anomalies, cost_suggestions,
        account_id=account_id,
        region=region
    )

    print("\n--- WEEKLY REPORT ---")
    print(report)
    print("--- END REPORT ---\n")

    s3_key = save_report_to_s3(report, account_id=account_id)
    send_report_via_sns(report, account_id=account_id)

    return {
        'statusCode': 200,
        'body': json.dumps({
            'report_saved_to': s3_key,
            'account_id': account_id,
            'anomalies_included': len(anomalies),
            'cost_suggestions_included': len(cost_suggestions)
        })
    }

if __name__ == '__main__':
    result = main()
    print(result['body'])