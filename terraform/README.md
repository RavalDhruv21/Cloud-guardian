# Cloud Guardian — Terraform lab

A learning-scoped Terraform stack, **not** a mirror of production. It uses its
own naming (`cloudguardian-lab-dev-*` by default) so it can never collide with
the real `cloud-guardian-*` resources deployed by `.github/workflows/deploy.yml`.

## What's here

The backend half of the architecture from the root [README](../README.md):

- 7 Lambdas (api, collector, cost_optimizer, remediation, report_generator,
  ai_analyzer, analytics_export), each with its own least-privilege IAM role
- API Gateway (HTTP API) fronting the `api` Lambda
- 4 DynamoDB tables (on-demand billing)
- 4 SQS queues + dead-letter queues, wired as Lambda triggers
- 1 SNS topic for alerts
- 1 EventBridge schedule (hourly) that kicks off `collector` and `cost_optimizer`
- 1 private S3 bucket for reports/exports

**Not included** (by choice, for this first pass): Cognito auth, the
CloudFront + S3 frontend hosting, and real Lambda application code. Each
`src/<function>/handler.py` is a placeholder stub — swap in the real code
from `../lambdas/<function>/` once you're comfortable with the Terraform
side and want the lab to actually do something.

## Usage

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

Everything is on-demand/pay-per-use (DynamoDB PAY_PER_REQUEST, no NAT
gateways, no always-on compute), so an idle stack costs close to nothing —
but `terraform destroy` when you're done experimenting.

```bash
terraform destroy
```

## Suggested next steps, in order

1. Read through `dynamodb.tf` and `sqs.tf` first — they're the simplest
   resources here.
2. Read `iam.tf` next to see how each Lambda's permissions are scoped to only
   what it touches, instead of one shared admin-ish role.
3. `lambda.tf` shows a `for_each` over a locals map — the same 7 resources
   would otherwise be ~7x copy-pasted blocks.
4. Swap one placeholder handler (e.g. `src/collector/handler.py`) for the
   real `../lambdas/collector/handler.py` and `terraform apply` to see the
   change roll out.
5. Once this feels familiar, decide whether to extend it toward the real
   architecture (Cognito, CloudFront/S3 frontend) or start a second pass
   that actually imports/manages the live prod resources — that's a bigger,
   riskier step and worth its own conversation.
