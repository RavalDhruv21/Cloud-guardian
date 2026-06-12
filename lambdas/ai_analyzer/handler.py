import json
import os
import requests
import boto3
from datetime import datetime, timezone
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
SNS_TOPIC_ARN = os.getenv("SNS_TOPIC_ARN")

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
    if not role_arn:
        return boto3.client(service, region_name=region)
    try:
        sts = boto3.client('sts')
        assumed = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName='CloudGuardianAIAnalyzer'
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

def call_groq(metrics_data):
    """Send metrics to Groq and get AI diagnosis"""
    prompt = f"""
You are an AWS infrastructure monitoring expert.
Analyze the following EC2 metrics and detect any anomalies.

Metrics data:
{json.dumps(metrics_data, indent=2)}

Respond ONLY in this exact JSON format, nothing else:
{{
  "anomaly_detected": true or false,
  "severity": "low" or "medium" or "high" or "critical",
  "summary": "one line plain English summary",
  "likely_cause": "what is probably causing this",
  "recommended_action": "what the user should do",
  "estimated_monthly_cost_impact": "cost impact if left unresolved"
}}
"""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    body = {
        "model": "llama-3.1-8b-instant",
        "messages": [
            {"role": "system", "content": "You are an AWS infrastructure expert. Always respond in valid JSON only."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 500
    }
    response = requests.post(GROQ_API_URL, headers=headers, json=body)
    response.raise_for_status()
    raw_text = response.json()['choices'][0]['message']['content'].strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    return json.loads(raw_text.strip())

def send_sns_alert(diagnosis, metric, account_id=None):
    """Send alert email via SNS if anomaly detected"""
    if not SNS_TOPIC_ARN:
        print("No SNS topic configured — skipping alert")
        return
    sns = boto3.client('sns', region_name='us-east-1')
    subject = f"[{diagnosis['severity'].upper()}] Cloud Guardian Alert — {metric['instance_id']}"
    message = f"""
Cloud Guardian Anomaly Detected
================================
Account:   {account_id or 'unknown'}
Instance:  {metric['instance_id']}
Severity:  {diagnosis['severity'].upper()}
Summary:   {diagnosis['summary']}

Likely Cause:
{diagnosis['likely_cause']}

Recommended Action:
{diagnosis['recommended_action']}

Cost Impact:
{diagnosis['estimated_monthly_cost_impact']}

Detected at: {datetime.now(timezone.utc).isoformat()}
"""
    sns.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject, Message=message)
    print(f"Alert sent via SNS for {metric['instance_id']}")

def save_anomaly(instance_id, metrics, diagnosis, account_id=None):
    """Save anomaly to DynamoDB — tagged with account_id"""
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies'))
    item = {
        'instance_id': instance_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'metrics_snapshot': json.dumps(metrics, default=str),
        'severity': diagnosis['severity'],
        'summary': diagnosis['summary'],
        'likely_cause': diagnosis['likely_cause'],
        'recommended_action': diagnosis['recommended_action'],
        'cost_impact': diagnosis['estimated_monthly_cost_impact'],
        'resolved': False,
    }
    # Tag with account_id so dashboard filters correctly per user
    if account_id:
        item['account_id'] = account_id
    table.put_item(Item=item)
    print(f"Anomaly saved for account {account_id}: {diagnosis['severity']} — {diagnosis['summary']}")

def get_live_metrics(role_arn, region, account_id):
    """Fetch real EC2 CPU metrics directly from user's CloudWatch"""
    from datetime import timedelta
    ec2 = get_assumed_client('ec2', role_arn, region)
    cloudwatch = get_assumed_client('cloudwatch', role_arn, region)

    instances_resp = ec2.describe_instances(
        Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]
    )

    metrics = []
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=1)

    for reservation in instances_resp['Reservations']:
        for inst in reservation['Instances']:
            instance_id = inst['InstanceId']
            cw_result = cloudwatch.get_metric_statistics(
                Namespace='AWS/EC2',
                MetricName='CPUUtilization',
                Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
                StartTime=start_time,
                EndTime=end_time,
                Period=300,
                Statistics=['Average', 'Maximum']
            )
            datapoints = cw_result.get('Datapoints', [])
            if datapoints:
                datapoints.sort(key=lambda x: x['Timestamp'])
                latest = datapoints[-1]
                metrics.append({
                    'instance_id': instance_id,
                    'cpu_avg': round(latest['Average'], 2),
                    'cpu_max': round(latest['Maximum'], 2),
                    'timestamp': latest['Timestamp'].isoformat(),
                    'collected_at': datetime.now(timezone.utc).isoformat(),
                    'account_id': account_id,
                    'region': region,
                })
    return metrics

def parse_stream_record(record):
    """Extract metric data from DynamoDB stream record"""
    if record.get('eventName') not in ['INSERT', 'MODIFY']:
        return None
    new_image = record['dynamodb'].get('NewImage', {})
    return {
        'instance_id': new_image.get('instance_id', {}).get('S', ''),
        'timestamp': new_image.get('timestamp', {}).get('S', ''),
        'cpu_avg': float(new_image.get('cpu_avg', {}).get('N', 0)),
        'cpu_max': float(new_image.get('cpu_max', {}).get('N', 0)),
        'collected_at': new_image.get('collected_at', {}).get('S', ''),
        'account_id': new_image.get('account_id', {}).get('S', None),
    }

def main(event=None, context=None):
    """Lambda handler — triggered by DynamoDB Stream or manual invocation"""
    print(f"AI Analyzer triggered")

    # Get user's connected account role
    role_arn, region, account_id = get_user_role()
    print(f"Analyzing for account: {account_id}, region: {region}")

    results = []

    # Handle DynamoDB stream records
    if event and 'Records' in event:
        for record in event['Records']:
            metric = parse_stream_record(record)
            if not metric or not metric['instance_id']:
                continue
            # Use account_id from stream record if available
            metric_account = metric.get('account_id') or account_id
            print(f"Analyzing {metric['instance_id']} — CPU avg: {metric['cpu_avg']}%")
            try:
                diagnosis = call_groq(metric)
                print(f"Diagnosis: {diagnosis['severity']} — {diagnosis['summary']}")
                if diagnosis['anomaly_detected']:
                    save_anomaly(metric['instance_id'], metric, diagnosis, account_id=metric_account)
                    send_sns_alert(diagnosis, metric, account_id=metric_account)
                else:
                    print(f"No anomaly detected for {metric['instance_id']} — all normal")
                results.append({'instance_id': metric['instance_id'], 'diagnosis': diagnosis})
            except Exception as e:
                print(f"Error analyzing {metric['instance_id']}: {str(e)}")
                continue

    # Manual invocation — fetch live metrics from user's account
    else:
        print("Manual invocation — fetching live metrics from user account")
        if role_arn and account_id:
            try:
                live_metrics = get_live_metrics(role_arn, region, account_id)
                print(f"Fetched {len(live_metrics)} live metrics")
                for metric in live_metrics:
                    print(f"Analyzing {metric['instance_id']} — CPU avg: {metric['cpu_avg']}%")
                    try:
                        diagnosis = call_groq(metric)
                        print(f"Diagnosis: {diagnosis['severity']} — {diagnosis['summary']}")
                        if diagnosis['anomaly_detected']:
                            save_anomaly(metric['instance_id'], metric, diagnosis, account_id=account_id)
                            send_sns_alert(diagnosis, metric, account_id=account_id)
                        results.append({'instance_id': metric['instance_id'], 'diagnosis': diagnosis})
                    except Exception as e:
                        print(f"Error analyzing {metric['instance_id']}: {str(e)}")
            except Exception as e:
                print(f"Error fetching live metrics: {str(e)}")
        else:
            print("No connected account found — skipping analysis")

    return {
        'statusCode': 200,
        'body': json.dumps({'results': results, 'account_id': account_id}, default=str)
    }

if __name__ == '__main__':
    result = main()
    print(result['body'])