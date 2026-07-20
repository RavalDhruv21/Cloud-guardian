import boto3
import csv
import io
import os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')

COST_FIELDS = [
    'account_id', 'timestamp', 'resource_id', 'resource_type', 'issue',
    'recommendation', 'saving_per_month', 'instance_type', 'days_idle',
    'region', 'status',
]

MISCONFIG_FIELDS = [
    'account_id', 'instance_id', 'timestamp', 'issue_type', 'severity',
    'summary', 'resolved', 'last_seen',
]


def scan_table(table_name):
    """Full scan across all accounts — the export's job is exactly the
    cross-tenant view the per-account GSIs and query patterns don't give us."""
    table = dynamodb.Table(table_name)
    items = []
    kwargs = {}
    while True:
        result = table.scan(**kwargs)
        items.extend(result.get('Items', []))
        last_key = result.get('LastEvaluatedKey')
        if not last_key:
            break
        kwargs['ExclusiveStartKey'] = last_key
    return items


def get_cost_suggestions():
    table_name = os.getenv('DYNAMODB_COST_TABLE', 'cloud-guardian-cost-suggestions')
    items = scan_table(table_name)
    return [i for i in items if i.get('status') != 'dismissed']


def get_misconfig_findings():
    table_name = os.getenv('DYNAMODB_ANOMALIES_TABLE', 'cloud-guardian-anomalies')
    items = scan_table(table_name)
    return [i for i in items if i.get('event_type') == 'security']


def to_csv(items, fields):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    for item in items:
        row = {k: item.get(k, '') for k in fields}
        writer.writerow(row)
    return buf.getvalue()


def upload_csv(csv_text, key):
    bucket = os.environ['S3_BUCKET_NAME']
    s3 = boto3.client('s3', region_name='us-east-1')
    s3.put_object(Bucket=bucket, Key=key, Body=csv_text.encode('utf-8'), ContentType='text/csv')
    print(f"Export saved: s3://{bucket}/{key}")
    return key


def run_export():
    prefix = os.getenv('ANALYTICS_EXPORT_PREFIX', 'exports/analytics')

    cost_suggestions = get_cost_suggestions()
    misconfig_findings = get_misconfig_findings()

    cost_csv = to_csv(cost_suggestions, COST_FIELDS)
    misconfig_csv = to_csv(misconfig_findings, MISCONFIG_FIELDS)

    cost_key = upload_csv(cost_csv, f"{prefix}/cost_suggestions.csv")
    misconfig_key = upload_csv(misconfig_csv, f"{prefix}/misconfig_findings.csv")

    print(f"Exported {len(cost_suggestions)} cost suggestions, {len(misconfig_findings)} misconfig findings "
          f"at {datetime.now(timezone.utc).isoformat()}")

    return {
        'cost_suggestions_key': cost_key,
        'cost_suggestions_count': len(cost_suggestions),
        'misconfig_findings_key': misconfig_key,
        'misconfig_findings_count': len(misconfig_findings),
    }


EXPORT_FILES = {
    'cost-suggestions': 'cost_suggestions.csv',
    'misconfig-findings': 'misconfig_findings.csv',
}


def api_handler(event, context):
    """API Gateway proxy handler — serves the latest exported CSVs over HTTPS
    (behind an API-key-protected REST API) so Power BI's Web connector can
    pull them without needing S3 request signing."""
    file_param = (event.get('pathParameters') or {}).get('file')
    s3_key_name = EXPORT_FILES.get(file_param)
    if not s3_key_name:
        return {'statusCode': 404, 'body': 'Unknown export file'}

    bucket = os.environ['S3_BUCKET_NAME']
    prefix = os.getenv('ANALYTICS_EXPORT_PREFIX', 'exports/analytics')
    s3 = boto3.client('s3', region_name='us-east-1')
    obj = s3.get_object(Bucket=bucket, Key=f"{prefix}/{s3_key_name}")
    csv_body = obj['Body'].read().decode('utf-8')

    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'text/csv'},
        'body': csv_body,
    }


def main(event=None, context=None):
    result = run_export()
    return {'statusCode': 200, 'body': result}


if __name__ == '__main__':
    print(main()['body'])
