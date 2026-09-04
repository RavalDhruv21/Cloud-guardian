import json


def handler(event, context):
    """Placeholder for the real lambdas/api/handler.py.

    This lab stack wires up the infrastructure only. Swap this stub for the
    real Lambda source once you're ready to deploy actual application code.
    """
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": "cloudguardian-lab api placeholder", "path": event.get("rawPath")}),
    }
