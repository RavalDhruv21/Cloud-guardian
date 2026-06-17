import json
import os
import requests
import boto3
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
SNS_TOPIC_ARN = os.getenv("SNS_TOPIC_ARN")

def get_all_users():
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table('cloud-guardian-users')
        result = table.scan()
        return result.get('Items', [])
    except Exception as e:
        print(f"Error getting users: {e}")
        return []

def get_assumed_client(service, role_arn, region):
    if not role_arn:
        return boto3.client(service, region_name=region)
    try:
        sts = boto3.client('sts')
        assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName='CloudGuardianAIAnalyzer')
        creds = assumed['Credentials']
        return boto3.client(service, region_name=region,
            aws_access_key_id=creds['AccessKeyId'],
            aws_secret_access_key=creds['SecretAccessKey'],
            aws_session_token=creds['SessionToken'])
    except Exception as e:
        print(f"Role assumption failed: {e}")
        return boto3.client(service, region_name=region)

def call_gemini(metrics_data):
    prompt = f"""You are an AWS infrastructure monitoring expert.
Analyze the following EC2 metrics and detect any anomalies.
CRITICAL RULES for Anomaly Detection:
1. NEVER flag "High CPU usage" if 'cpu_avg' or 'cpu_max' are low (e.g., < 10%). Only flag High CPU usage if 'cpu_avg' > 75% or 'cpu_max' > 85%.
2. If CPU metrics are extremely low, you may classify it as an "Underutilized Instance" anomaly (Severity: low), but NEVER as High CPU.
3. Be highly accurate and avoid false positives. If the metrics look normal and within typical operational boundaries, set "anomaly_detected" to false.
Metrics data: {json.dumps(metrics_data, indent=2)}
Respond ONLY in this exact JSON format:
{{"anomaly_detected": true or false, "severity": "low" or "medium" or "high" or "critical",
"summary": "one line summary", "likely_cause": "cause", "recommended_action": "action",
"estimated_monthly_cost_impact": "cost impact"}}"""
    headers = {"Content-Type": "application/json"}
    body = {
        "systemInstruction": {
            "parts": [{"text": "You are an AWS infrastructure expert. Always respond in valid JSON only."}]
        },
        "contents": [
            {"parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 500
        }
    }
    response = requests.post(GEMINI_API_URL, headers=headers, json=body)
    response.raise_for_status()
    try:
        raw_text = response.json()['candidates'][0]['content']['parts'][0]['text'].strip()
    except Exception as e:
        print(f"Error parsing Gemini response: {e}, {response.text}")
        raise
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    return json.loads(raw_text.strip())

def send_sns_alert(diagnosis, metric, account_id=None):
    if not SNS_TOPIC_ARN:
        return
    sns = boto3.client('sns', region_name='us-east-1')
    subject = f"[{diagnosis['severity'].upper()}] Cloud Guardian Alert — {metric['instance_id']}"
    message = f"""Cloud Guardian Anomaly Detected
Account: {account_id or 'unknown'} | Instance: {metric['instance_id']}
Severity: {diagnosis['severity'].upper()} | {diagnosis['summary']}
Cause: {diagnosis['likely_cause']}
Action: {diagnosis['recommended_action']}
Cost: {diagnosis['estimated_monthly_cost_impact']}"""
    sns.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject, Message=message)

def save_anomaly(instance_id, metrics, diagnosis, account_id=None, user_id=None):
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
    if account_id:
        item['account_id'] = account_id
    if user_id:
        item['user_id'] = user_id
    table.put_item(Item=item)

def get_live_metrics(role_arn, region, account_id):
    ec2 = get_assumed_client('ec2', role_arn, region)
    cloudwatch = get_assumed_client('cloudwatch', role_arn, region)
    instances_resp = ec2.describe_instances(Filters=[{'Name': 'instance-state-name', 'Values': ['running']}])
    metrics = []
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
            if datapoints:
                datapoints.sort(key=lambda x: x['Timestamp'])
                latest = datapoints[-1]
                metrics.append({
                    'instance_id': instance_id,
                    'cpu_avg': round(latest['Average'], 2),
                    'cpu_max': round(latest['Maximum'], 2),
                    'timestamp': latest['Timestamp'].isoformat(),
                    'account_id': account_id, 'region': region,
                })
    return metrics

def parse_stream_record(record):
    if record.get('eventName') not in ['INSERT', 'MODIFY']:
        return None
    new_image = record['dynamodb'].get('NewImage', {})
    return {
        'instance_id': new_image.get('instance_id', {}).get('S', ''),
        'cpu_avg': float(new_image.get('cpu_avg', {}).get('N', 0)),
        'cpu_max': float(new_image.get('cpu_max', {}).get('N', 0)),
        'account_id': new_image.get('account_id', {}).get('S', None),
        'user_id': new_image.get('user_id', {}).get('S', None),
    }

def main(event=None, context=None):
    print("AI Analyzer triggered")
    results = []

    # Handle DynamoDB stream records
    if event and 'Records' in event:
        for record in event['Records']:
            metric = parse_stream_record(record)
            if not metric or not metric['instance_id']:
                continue
            account_id = metric.get('account_id')
            user_id = metric.get('user_id')
            try:
                diagnosis = call_gemini(metric)
                if diagnosis['anomaly_detected']:
                    save_anomaly(metric['instance_id'], metric, diagnosis, account_id=account_id, user_id=user_id)
                    send_sns_alert(diagnosis, metric, account_id=account_id)
                results.append({'instance_id': metric['instance_id'], 'diagnosis': diagnosis})
            except Exception as e:
                print(f"Error analyzing {metric['instance_id']}: {e}")

    # Manual invocation — scan all connected users
    else:
        users = get_all_users()
        print(f"Manual scan for {len(users)} connected accounts")
        for user in users:
            role_arn = user.get('role_arn')
            region = user.get('region', 'us-east-1')
            account_id = user.get('account_id')
            user_id = user.get('user_id')
            if not role_arn or not account_id:
                continue
            print(f"Analyzing account {account_id} for user {user_id}")
            try:
                live_metrics = get_live_metrics(role_arn, region, account_id)
                for metric in live_metrics:
                    try:
                        diagnosis = call_gemini(metric)
                        if diagnosis['anomaly_detected']:
                            save_anomaly(metric['instance_id'], metric, diagnosis, account_id=account_id, user_id=user_id)
                            send_sns_alert(diagnosis, metric, account_id=account_id)
                        results.append({'instance_id': metric['instance_id'], 'diagnosis': diagnosis})
                    except Exception as e:
                        print(f"Error analyzing {metric['instance_id']}: {e}")
            except Exception as e:
                print(f"Error fetching metrics for {account_id}: {e}")

    return {'statusCode': 200, 'body': json.dumps({'results': results}, default=str)}

if __name__ == '__main__':
    result = main()
    print(result['body'])