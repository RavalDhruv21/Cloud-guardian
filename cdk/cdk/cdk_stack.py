from aws_cdk import (
    Stack, Duration, RemovalPolicy,
    aws_lambda as _lambda,
    aws_dynamodb as dynamodb,
    aws_events as events,
    aws_events_targets as targets,
    aws_iam as iam,
    aws_sns as sns,
    aws_sns_subscriptions as subs,
)
from constructs import Construct
import os

class CloudGuardianStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # ── Environment ───────────────────────────────────
        alert_email = os.getenv('ALERT_EMAIL', 'your@email.com')
        aws_region  = os.getenv('AWS_DEFAULT_REGION', 'us-east-1')

        # ── DynamoDB Tables ───────────────────────────────

        metrics_table = dynamodb.Table(
            self, 'MetricsTable',
            table_name='cloud-guardian-metrics',
            partition_key=dynamodb.Attribute(name='instance_id', type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name='timestamp', type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        anomalies_table = dynamodb.Table(
            self, 'AnomaliesTable',
            table_name='cloud-guardian-anomalies',
            partition_key=dynamodb.Attribute(name='instance_id', type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name='timestamp', type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        cost_table = dynamodb.Table(
            self, 'CostTable',
            table_name='cloud-guardian-cost-suggestions',
            partition_key=dynamodb.Attribute(name='account_id', type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name='timestamp', type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # ── SNS Topic ─────────────────────────────────────
        alert_topic = sns.Topic(
            self, 'AlertTopic',
            topic_name='cloud-guardian-alerts',
            display_name='Cloud Guardian Alerts',
        )
        alert_topic.add_subscription(subs.EmailSubscription(alert_email))

        # ── IAM Role for Lambdas ──────────────────────────
        lambda_role = iam.Role(
            self, 'LambdaRole',
            role_name='cloud-guardian-lambda-role',
            assumed_by=iam.ServicePrincipal('lambda.amazonaws.com'),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name('service-role/AWSLambdaBasicExecutionRole'),
                iam.ManagedPolicy.from_aws_managed_policy_name('AmazonDynamoDBFullAccess'),
                iam.ManagedPolicy.from_aws_managed_policy_name('AmazonEC2ReadOnlyAccess'),
                iam.ManagedPolicy.from_aws_managed_policy_name('CloudWatchReadOnlyAccess'),
                iam.ManagedPolicy.from_aws_managed_policy_name('AmazonSNSFullAccess'),
                iam.ManagedPolicy.from_aws_managed_policy_name('AWSPriceListServiceFullAccess'),
            ],
        )

        # Extra permissions for cost optimizer + remediation
        lambda_role.add_to_policy(iam.PolicyStatement(
            actions=[
                'ec2:StopInstances', 'ec2:StartInstances',
                'ec2:ModifyInstanceAttribute',
                'ec2:DeleteVolume', 'ec2:ReleaseAddress',
                'ec2:RevokeSecurityGroupIngress',
                'rds:StopDBInstance', 'rds:StartDBInstance',
                'rds:DescribeDBInstances',
                's3:PutPublicAccessBlock', 's3:GetPublicAccessBlock',
                's3:ListAllMyBuckets', 's3:ListBucket',
                'pricing:GetProducts',
                'sts:GetCallerIdentity',
            ],
            resources=['*'],
        ))

        # Common Lambda environment
        common_env = {
            'DYNAMODB_METRICS_TABLE': 'cloud-guardian-metrics',
            'DYNAMODB_ANOMALIES_TABLE': 'cloud-guardian-anomalies',
            'DYNAMODB_COST_TABLE': 'cloud-guardian-cost-suggestions',
            'SNS_TOPIC_ARN': alert_topic.topic_arn,
            'GEMINI_API_KEY': os.getenv('GEMINI_API_KEY', ''),
        }

        # ── Lambda Functions ──────────────────────────────

        collector = _lambda.Function(
            self, 'Collector',
            function_name='cloud-guardian-collector',
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler='handler.main',
            code=_lambda.Code.from_asset('../build/collector.zip'),
            role=lambda_role,
            timeout=Duration.seconds(300),
            memory_size=256,
            environment=common_env,
        )

        ai_analyzer = _lambda.Function(
            self, 'AiAnalyzer',
            function_name='cloud-guardian-ai-analyzer',
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler='handler.main',
            code=_lambda.Code.from_asset('../build/ai_analyzer.zip'),
            role=lambda_role,
            timeout=Duration.seconds(300),
            memory_size=256,
            environment=common_env,
        )

        cost_optimizer = _lambda.Function(
            self, 'CostOptimizer',
            function_name='cloud-guardian-cost-optimizer',
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler='handler.handler',
            code=_lambda.Code.from_asset('../build/cost_optimizer.zip'),
            role=lambda_role,
            timeout=Duration.seconds(300),
            memory_size=256,
            environment=common_env,
        )

        report_generator = _lambda.Function(
            self, 'ReportGenerator',
            function_name='cloud-guardian-report-generator',
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler='handler.main',
            code=_lambda.Code.from_asset('../build/report_generator.zip'),
            role=lambda_role,
            timeout=Duration.seconds(300),
            memory_size=256,
            environment=common_env,
        )

        api = _lambda.Function(
            self, 'Api',
            function_name='cloud-guardian-api',
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler='handler.main',
            code=_lambda.Code.from_asset('../build/api.zip'),
            role=lambda_role,
            timeout=Duration.seconds(30),
            memory_size=256,
            environment=common_env,
        )

        # ── EventBridge Schedules ─────────────────────────

        # Collector — every 15 minutes
        events.Rule(
            self, 'CollectorSchedule',
            rule_name='cloud-guardian-collector-schedule',
            schedule=events.Schedule.rate(Duration.minutes(15)),
            targets=[targets.LambdaFunction(collector)],
        )

        # AI Analyzer — every 15 minutes (after collector)
        events.Rule(
            self, 'AnalyzerSchedule',
            rule_name='cloud-guardian-analyzer-schedule',
            schedule=events.Schedule.rate(Duration.minutes(15)),
            targets=[targets.LambdaFunction(ai_analyzer)],
        )

        # Cost Optimizer — every Sunday at 9am UTC
        events.Rule(
            self, 'CostOptimizerSchedule',
            rule_name='cloud-guardian-cost-schedule',
            schedule=events.Schedule.cron(minute='0', hour='9', week_day='SUN'),
            targets=[targets.LambdaFunction(cost_optimizer)],
        )

        # Report Generator — every Monday at 8am UTC
        events.Rule(
            self, 'ReportSchedule',
            rule_name='cloud-guardian-report-schedule',
            schedule=events.Schedule.cron(minute='0', hour='8', week_day='MON'),
            targets=[targets.LambdaFunction(report_generator)],
        )