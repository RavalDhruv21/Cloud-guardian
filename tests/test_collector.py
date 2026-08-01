import pytest
import boto3
import json
from datetime import datetime, timezone, timedelta
from moto import mock_aws
from unittest.mock import patch
from decimal import Decimal
import sys
import os
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lambdas.collector import handler
from lambdas.collector.handler import (
    list_running_instances, collect_ec2_metrics_batch, save_metrics_to_dynamodb,
    discover_cwagent_metrics, collect_cwagent_metrics,
)

@mock_aws
def test_list_running_instances_empty():
    """Should return empty list when no instances running"""
    ec2 = boto3.client('ec2', region_name='us-east-1')
    result = list_running_instances(ec2)
    assert result == []

@mock_aws
def test_collect_ec2_metrics_batch_no_data():
    """Should return an empty dict when no metric datapoints exist"""
    cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
    result = collect_ec2_metrics_batch(cloudwatch, ['i-fake123'])
    assert result == {}

@mock_aws
def test_save_metrics_to_dynamodb():
    """Should save metrics to DynamoDB without error"""
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')

    # Create the table first
    dynamodb.create_table(
        TableName='cloud-guardian-metrics',
        KeySchema=[
            {'AttributeName': 'instance_id', 'KeyType': 'HASH'},
            {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
        ],
        AttributeDefinitions=[
            {'AttributeName': 'instance_id', 'AttributeType': 'S'},
            {'AttributeName': 'timestamp', 'AttributeType': 'S'}
        ],
        BillingMode='PAY_PER_REQUEST'
    )

    sample = [{
        'instance_id': 'i-test001',
        'cpu_avg': 45.2,
        'cpu_max': 67.1,
        'cpu_avg_24h': 40.0,
        'sustained_high_minutes': 0,
        'cpu_std_24h': 5.3,
        'cpu_avg_1h': 44.0,
        'rate_of_change': 1.2,
        'datapoint_count': 288,
        'timestamp': '2025-01-01T00:00:00',
        'collected_at': '2025-01-01T00:00:00',
        # Optional network/disk/status-check fields — should convert to
        # Decimal alongside the base fields without needing to be named
        # explicitly in save_metrics_to_dynamodb.
        'network_in_avg': 123456.0,
        'ebs_write_ops_avg': 42.0,
        'status_check_failed': 0,
    }]

    save_metrics_to_dynamodb(sample)

    # Verify it was saved
    table = dynamodb.Table('cloud-guardian-metrics')
    response = table.get_item(Key={
        'instance_id': 'i-test001',
        'timestamp': '2025-01-01T00:00:00'
    })
    assert response['Item']['cpu_avg'] == Decimal('45.2')
    assert response['Item']['network_in_avg'] == Decimal('123456.0')
    assert response['Item']['status_check_failed'] == Decimal('0')


@mock_aws
def test_discover_cwagent_metrics_empty_when_agent_not_installed():
    """Should gracefully return no matches when no CWAgent metrics exist —
    the common case, since most instances don't have the agent installed."""
    cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
    result = discover_cwagent_metrics(cloudwatch, ['i-fake123'])
    assert result == {}


@mock_aws
def test_collect_cwagent_metrics_no_instances_returns_none():
    cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
    assert collect_cwagent_metrics(cloudwatch, {}) is None


@mock_aws
def test_collect_ec2_metrics_batch_includes_extra_metrics_when_present():
    """When CloudWatch has network/disk/status-check datapoints (not just
    CPU), collect_ec2_metrics_batch should enrich them the same way as CPU."""
    cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
    instance_id = 'i-extrametrics'
    # 10 minutes in the past — moto's get_metric_data excludes datapoints
    # exactly at EndTime, and collect_ec2_metrics_batch's EndTime is "now".
    timestamp = datetime.now(timezone.utc) - timedelta(minutes=10)
    dims = [{'Name': 'InstanceId', 'Value': instance_id}]

    for metric_name, value in [
        ('CPUUtilization', 42.0), ('NetworkIn', 1_000_000.0), ('NetworkOut', 500_000.0),
        ('EBSReadOps', 10.0), ('EBSWriteOps', 20.0), ('StatusCheckFailed', 0.0),
    ]:
        cloudwatch.put_metric_data(Namespace='AWS/EC2', MetricData=[{
            'MetricName': metric_name, 'Dimensions': dims, 'Timestamp': timestamp, 'Value': value,
        }])

    result = collect_ec2_metrics_batch(cloudwatch, [instance_id])
    assert instance_id in result
    metric = result[instance_id]
    assert metric['cpu_avg'] == 42.0
    assert 'network_in_avg' in metric
    assert 'ebs_write_ops_avg' in metric
    assert metric['status_check_failed'] == 0


@mock_aws
def test_collect_for_user_splits_large_account_into_batches():
    """Accounts with more running instances than INSTANCE_BATCH_SIZE should be
    split into smaller SQS batches instead of processed in one invocation."""
    ec2 = boto3.client('ec2', region_name='us-east-1')
    ec2.run_instances(ImageId='ami-12345678', MinCount=3, MaxCount=3, InstanceType='t2.micro')

    sqs = boto3.client('sqs', region_name='us-east-1')
    queue_url = sqs.create_queue(QueueName='collector-queue')['QueueUrl']
    os.environ['COLLECTOR_QUEUE_URL'] = queue_url

    with patch.object(handler, 'INSTANCE_BATCH_SIZE', 2):
        result = handler.collect_for_user({'account_id': '123456789012', 'user_id': 'u1', 'region': 'us-east-1'})

    assert result == 0  # this invocation only enqueues batches, it doesn't collect metrics
    messages = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10).get('Messages', [])
    assert len(messages) == 2  # ceil(3 instances / batch size 2)
    total_instances = sum(len(json.loads(m['Body'])['instance_ids']) for m in messages)
    assert total_instances == 3


def test_real_dynamodb_connection():
    """Test writing to real DynamoDB — requires AWS credentials"""
    dynamodb = boto3.resource(
        'dynamodb',
        region_name=os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
    )
    table = dynamodb.Table(os.getenv('DYNAMODB_METRICS_TABLE', 'cloud-guardian-metrics'))

    # Write a test item
    table.put_item(Item={
        'instance_id': 'i-test-phase2',
        'timestamp': '2025-01-01T00:00:00',
        'cpu_avg': Decimal('42.5'),
        'cpu_max': Decimal('55.0'),
        'collected_at': '2025-01-01T00:00:00',
        'test': True
    })

    # Read it back
    response = table.get_item(Key={
        'instance_id': 'i-test-phase2',
        'timestamp': '2025-01-01T00:00:00'
    })

    assert response['Item']['cpu_avg'] == Decimal('42.5')
    print("Real DynamoDB connection works")