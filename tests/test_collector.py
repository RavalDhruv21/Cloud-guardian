import pytest
import boto3
from moto import mock_aws
from unittest.mock import patch
from decimal import Decimal
import sys
import os
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lambdas.collector.handler import list_running_instances, collect_ec2_metrics, save_metrics_to_dynamodb

@mock_aws
def test_list_running_instances_empty():
    """Should return empty list when no instances running"""
    ec2 = boto3.client('ec2', region_name='us-east-1')
    result = list_running_instances(ec2)
    assert result == []

@mock_aws
def test_collect_ec2_metrics_no_data():
    """Should return None when no metric datapoints exist"""
    cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
    result = collect_ec2_metrics(cloudwatch, 'i-fake123')
    assert result is None

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
        'timestamp': '2025-01-01T00:00:00',
        'collected_at': '2025-01-01T00:00:00'
    }]

    save_metrics_to_dynamodb(sample)

    # Verify it was saved
    table = dynamodb.Table('cloud-guardian-metrics')
    response = table.get_item(Key={
        'instance_id': 'i-test001',
        'timestamp': '2025-01-01T00:00:00'
    })
    assert response['Item']['cpu_avg'] == Decimal('45.2')


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