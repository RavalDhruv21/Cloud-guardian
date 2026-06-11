import aws_cdk as cdk
from cdk.cdk_stack import CloudGuardianStack

app = cdk.App()
CloudGuardianStack(app, "CloudGuardianStack")
app.synth()