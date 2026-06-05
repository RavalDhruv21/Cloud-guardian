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

    raw_text = response.json()['choices'][0]['message']['content']
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    raw_text = raw_text.strip()

    return json.loads(raw_text)

def send_sns_alert(diagnosis, metric):
    """Send alert email via SNS if anomaly detected"""
    if not SNS_TOPIC_ARN:
        print("No SNS topic configured — skipping alert")
        return

    sns = boto3.client('sns', region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1'))

    subject = f"[{diagnosis['severity'].upper()}] Cloud Guardian Alert — {metric['instance_id']}"
    message = f"""
Cloud Guardian Anomaly Detected
================================
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

    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=subject,
        Message=message
    )
    print(f"Alert sent via SNS for {metric['instance_id']}")

def save_anomaly(instance_id, metrics, diagnosis):
    """Save anomaly to DynamoDB"""
    dynamodb = boto3.resource(
        'dynamodb',
        region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
    )
    table = dynamodb.Table(
        os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies')
    )

    item = {
        'instance_id': instance_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'metrics_snapshot': json.dumps(metrics, default=str),
        'severity': diagnosis['severity'],
        'summary': diagnosis['summary'],
        'likely_cause': diagnosis['likely_cause'],
        'recommended_action': diagnosis['recommended_action'],
        'cost_impact': diagnosis['estimated_monthly_cost_impact'],
        'resolved': False
    }

    table.put_item(Item=item)
    print(f"Anomaly saved: {diagnosis['severity']} — {diagnosis['summary']}")

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
        'collected_at': new_image.get('collected_at', {}).get('S', '')
    }

def main(event=None, context=None):
    """Lambda handler — triggered by DynamoDB Stream"""
    print(f"AI Analyzer triggered with {len(event.get('Records', []))} records")

    results = []

    # Handle DynamoDB stream records
    if event and 'Records' in event:
        for record in event['Records']:
            metric = parse_stream_record(record)
            if not metric or not metric['instance_id']:
                continue

            print(f"Analyzing {metric['instance_id']} — CPU avg: {metric['cpu_avg']}%")

            try:
                diagnosis = call_groq(metric)
                print(f"Diagnosis: {diagnosis['severity']} — {diagnosis['summary']}")

                # Only save and alert if anomaly detected
                if diagnosis['anomaly_detected']:
                    save_anomaly(metric['instance_id'], metric, diagnosis)
                    send_sns_alert(diagnosis, metric)
                else:
                    print(f"No anomaly detected for {metric['instance_id']} — all normal")

                results.append({
                    'instance_id': metric['instance_id'],
                    'diagnosis': diagnosis
                })

            except Exception as e:
                print(f"Error analyzing {metric['instance_id']}: {str(e)}")
                continue

    # Handle manual invocation with sample data for testing
    else:
        print("No stream records — running with sample data for testing")
        sample_metrics = [
            {
                "instance_id": "i-0abc123456",
                "cpu_avg": 94.5,
                "cpu_max": 98.2,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "collected_at": datetime.now(timezone.utc).isoformat()
            }
        ]
        for metric in sample_metrics:
            diagnosis = call_groq(metric)
            print(f"Diagnosis: {diagnosis['severity']} — {diagnosis['summary']}")
            results.append({'instance_id': metric['instance_id'], 'diagnosis': diagnosis})

    return {
        'statusCode': 200,
        'body': json.dumps({'results': results}, default=str)
    }

if __name__ == '__main__':
    result = main()
    print(result['body'])