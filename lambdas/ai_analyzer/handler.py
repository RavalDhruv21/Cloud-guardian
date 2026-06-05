import json
import os
import requests
import boto3
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

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

    # Clean and parse JSON response
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    raw_text = raw_text.strip()

    return json.loads(raw_text)

def save_anomaly(instance_id, metrics, diagnosis):
    """Save anomaly to DynamoDB"""
    dynamodb = boto3.resource(
        'dynamodb',
        region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
    )
    table = dynamodb.Table('cloud-guardian-anomalies')

    item = {
        'instance_id': instance_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'metrics_snapshot': json.dumps(metrics),
        'severity': diagnosis['severity'],
        'summary': diagnosis['summary'],
        'likely_cause': diagnosis['likely_cause'],
        'recommended_action': diagnosis['recommended_action'],
        'resolved': False
    }

    table.put_item(Item=item)
    print(f"Anomaly saved for {instance_id}: {diagnosis['severity']} — {diagnosis['summary']}")

def main(event=None, context=None):
    """Lambda handler"""
    print("Starting AI analysis...")

    # Sample metrics for local testing
    # In production this comes from DynamoDB via event
    sample_metrics = [
        {
            "instance_id": "i-0abc123456",
            "cpu_avg": 94.5,
            "cpu_max": 98.2,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "collected_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "instance_id": "i-0def789012",
            "cpu_avg": 3.1,
            "cpu_max": 5.4,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "collected_at": datetime.now(timezone.utc).isoformat()
        }
    ]

    results = []
    for metric in sample_metrics:
        print(f"\nAnalyzing {metric['instance_id']}...")
        diagnosis = call_groq(metric)

        print(f"Anomaly detected: {diagnosis['anomaly_detected']}")
        print(f"Severity: {diagnosis['severity']}")
        print(f"Summary: {diagnosis['summary']}")
        print(f"Cause: {diagnosis['likely_cause']}")
        print(f"Action: {diagnosis['recommended_action']}")

        results.append({
            'instance_id': metric['instance_id'],
            'diagnosis': diagnosis
        })

    return {
        'statusCode': 200,
        'body': json.dumps({'results': results}, indent=2)
    }

if __name__ == '__main__':
    result = main()
    print(result['body'])