# VITAS FHIR Hybrid Deployment Guide

This guide walks you through deploying the FHIR serverless infrastructure alongside your existing Next.js application.

## Overview

The hybrid approach means:
- ✅ Your existing Next.js app continues working unchanged
- 🆕 FHIR API Gateway/Lambda added for external integrations
- 🔄 Both systems access the same DynamoDB tables
- 📊 Your data becomes FHIR-compliant without migration

## Prerequisites

1. **AWS CLI configured** with appropriate permissions
2. **SAM CLI installed** (v1.125.0+)
3. **Node.js 20.x** and npm
4. **Existing DynamoDB tables** are accessible

## Step 1: Configure Your Table Names

Before deploying, you need to specify your existing DynamoDB table names.

### Option A: Update samconfig.toml (Recommended)

Edit `samconfig.toml` and add your table names:

```toml
[dev.deploy.parameters]
parameter_overrides = "Environment=dev ExistingPatientsTable=YourPatientsTable ExistingAppointmentsTable=YourAppointmentsTable ExistingDoctorsTable=YourDoctorsTable"
```

### Option B: Deploy with Parameters

Deploy with table names as parameters:

```bash
sam deploy --config-env dev \
  --parameter-overrides \
    Environment=dev \
    ExistingPatientsTable=YourPatientsTable \
    ExistingAppointmentsTable=YourAppointmentsTable \
    ExistingDoctorsTable=YourDoctorsTable
```

## Step 2: Deploy to Development

```bash
cd fhir-serverless

# Install dependencies
npm install

# Build the application
sam build

# Deploy to development
sam deploy --config-env dev
```

## Step 3: Verify Deployment

After deployment, you'll get outputs like:

```
FHIRApiUrl: https://abc123.execute-api.us-east-1.amazonaws.com/dev
CognitoUserPoolId: us-east-1_ABC123
```

### Test the FHIR API

```bash
# Get the API URL from deployment outputs
FHIR_API_URL="https://your-api-id.execute-api.region.amazonaws.com/dev"

# Test patient endpoint (should return empty list initially)
curl "$FHIR_API_URL/fhir/Patient" \
  -H "Content-Type: application/fhir+json"
```

## Step 4: Data Flow Verification

### Your Current App (Unchanged)
```bash
# Your Next.js app continues to work exactly as before
curl http://localhost:3000/api/get-patient-detail?patientId=123
# Returns your existing patient data format
```

### New FHIR API (Added)
```bash
# New FHIR API returns same data in FHIR format
curl "$FHIR_API_URL/fhir/Patient/123" \
  -H "Content-Type: application/fhir+json"
# Returns FHIR R4 compliant patient resource
```

## Step 5: Environment-Specific Deployments

### Staging Environment
```bash
sam deploy --config-env staging \
  --parameter-overrides \
    Environment=staging \
    ExistingPatientsTable=StagingPatientsTable \
    ExistingAppointmentsTable=StagingAppointmentsTable \
    ExistingDoctorsTable=StagingDoctorsTable
```

### Production Environment
```bash
sam deploy --config-env prod \
  --parameter-overrides \
    Environment=prod \
    ExistingPatientsTable=ProdPatientsTable \
    ExistingAppointmentsTable=ProdAppointmentsTable \
    ExistingDoctorsTable=ProdDoctorsTable
```

## Step 6: Authentication Setup

The FHIR API uses Cognito for authentication. To create test users:

```bash
# Get User Pool ID from deployment outputs
USER_POOL_ID="us-east-1_ABC123"

# Create a test user
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username testdoctor \
  --user-attributes Name=email,Value=doctor@example.com \
  --temporary-password TempPass123! \
  --message-action SUPPRESS
```

## Monitoring and Logs

### View Lambda Logs
```bash
# FHIR Resource Manager logs
sam logs --stack-name vitas-fhir-dev --name FHIRResourceManagerFunction --tail

# HL7 Processor logs
sam logs --stack-name vitas-fhir-dev --name HL7MessageProcessorFunction --tail
```

### CloudWatch Dashboards
After deployment, check AWS Console → CloudWatch → Dashboards for:
- API Gateway metrics
- Lambda performance
- DynamoDB usage

## Integration Examples

### External EHR System Integration

```bash
# External system can query your patients via FHIR
curl "$FHIR_API_URL/fhir/Patient?identifier=dni|12345678" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/fhir+json"
```

### HL7 Message Processing

```bash
# Send HL7 ADT message
curl "$FHIR_API_URL/hl7/message" \
  -X POST \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: text/plain" \
  -d "MSH|^~\&|SendingApp|SendingFac|ReceivingApp|ReceivingFac|20240101120000||ADT^A01|123|P|2.5"
```

## Troubleshooting

### Common Issues

1. **Permission Denied on DynamoDB**
   ```bash
   # Check table names match your actual tables
   aws dynamodb list-tables --region us-east-1
   ```

2. **API Gateway 502 Errors**
   ```bash
   # Check Lambda logs for errors
   sam logs --stack-name vitas-fhir-dev --name FHIRResourceManagerFunction
   ```

3. **CORS Issues**
   - The API Gateway is configured with permissive CORS for development
   - For production, update the CORS settings in template.yaml

### Debugging Steps

1. **Verify Lambda Functions**
   ```bash
   # Test function locally
   sam local invoke FHIRResourceManagerFunction --event events/patient-get.json
   ```

2. **Check Environment Variables**
   ```bash
   # Verify Lambda has correct table names
   aws lambda get-function-configuration --function-name vitas-fhir-resource-manager-dev
   ```

3. **Test DynamoDB Access**
   ```bash
   # Verify Lambda can read your tables
   aws logs filter-log-events \
     --log-group-name /aws/lambda/vitas-fhir-resource-manager-dev \
     --start-time $(date -d '1 hour ago' +%s)000
   ```

## Rollback Plan

If you need to remove the FHIR infrastructure:

```bash
# Delete the CloudFormation stack
aws cloudformation delete-stack --stack-name vitas-fhir-dev

# Your Next.js app continues working unchanged
```

## Next Steps

1. **Implement FHIR Resources**: Start with Patient resource transformation
2. **Add Authentication**: Configure OAuth scopes for different access levels
3. **External Integration**: Connect with EHR systems using FHIR endpoints
4. **Monitoring**: Set up CloudWatch alarms and dashboards

## Support

- **Logs**: Check CloudWatch logs for detailed error information
- **Metrics**: Monitor API Gateway and Lambda metrics
- **Documentation**: Refer to `README.md` for detailed API documentation
- **Issues**: Create GitHub issues for bugs or feature requests

The hybrid approach allows you to add FHIR compliance gradually while keeping your existing application stable and functional.