# VITAS FHIR Serverless Infrastructure

This directory contains the AWS SAM-based serverless infrastructure for implementing FHIR R4 compliance in the VITAS healthcare application.

## Architecture Overview

The FHIR serverless infrastructure provides:

- **FHIR R4 API Gateway** - RESTful endpoints for healthcare interoperability
- **Lambda Functions** - Serverless processing for FHIR resources
- **DynamoDB Storage** - Scalable, FHIR-compliant data persistence  
- **S3 Document Storage** - Secure storage for medical documents and attachments
- **Cognito Authentication** - OAuth 2.0 with healthcare-specific scopes
- **CloudWatch Monitoring** - Comprehensive logging and audit trails

## Directory Structure

```
fhir-serverless/
├── template.yaml              # SAM template defining infrastructure
├── samconfig.toml            # SAM configuration for multiple environments
├── package.json              # Node.js dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── src/                      # Lambda function source code
│   ├── fhir-resource-manager/  # Main FHIR CRUD operations
│   ├── hl7-message-processor/  # HL7 v2.x message processing
│   ├── fhir-translator/        # Legacy to FHIR conversion
│   ├── authorizer/             # Custom Lambda authorizer
│   └── shared/                 # Shared utilities and types
├── tests/                    # Unit and integration tests
├── events/                   # Sample event files for testing
└── .github/                  # GitHub Actions CI/CD workflows
```

## Prerequisites

- [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate permissions
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) v1.125.0+
- [Node.js](https://nodejs.org/) v20.x
- [npm](https://www.npmjs.com/) v10.x

## Quick Start

### 1. Install Dependencies

```bash
cd fhir-serverless
npm install
```

### 2. Validate SAM Template

```bash
sam validate --lint
```

### 3. Build Application

```bash
sam build
```

### 4. Deploy to Development

```bash
sam deploy --config-env dev
```

### 5. Test Locally

```bash
# Start local API Gateway
sam local start-api --port 3001

# Test specific function
sam local invoke FHIRResourceManagerFunction --event events/patient-create.json
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build SAM application |
| `npm run deploy:dev` | Deploy to development environment |
| `npm run deploy:staging` | Deploy to staging environment |
| `npm run deploy:prod` | Deploy to production environment |
| `npm run local:start` | Start local API Gateway on port 3001 |
| `npm run test` | Run unit tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript type checking |
| `npm run validate` | Validate SAM template |

## Environment Configuration

The infrastructure supports three environments:

### Development (`dev`)
- Stack name: `vitas-fhir-dev`
- Minimal resources for development testing
- Relaxed CORS policies
- Extended CloudWatch log retention

### Staging (`staging`)
- Stack name: `vitas-fhir-staging`
- Production-like configuration
- Integration testing environment
- Security scanning and compliance checks

### Production (`prod`)
- Stack name: `vitas-fhir-prod`
- Full security controls
- Performance optimized
- Comprehensive monitoring and alerting

## FHIR R4 Resources Supported

Currently implemented FHIR resources:

- ✅ **Patient** - Patient demographics and administrative information
- ✅ **Encounter** - Healthcare interactions and appointments
- ⏳ **Practitioner** - Healthcare providers and doctors
- ⏳ **DocumentReference** - SOAP reports and medical documents
- ⏳ **Observation** - Clinical findings and measurements
- ⏳ **Condition** - Diagnoses and medical conditions

## API Endpoints

Base URL: `https://{api-id}.execute-api.{region}.amazonaws.com/{environment}`

### Patient Resource
```
GET    /fhir/Patient          # Search patients
POST   /fhir/Patient          # Create patient
GET    /fhir/Patient/{id}     # Get patient by ID
PUT    /fhir/Patient/{id}     # Update patient
DELETE /fhir/Patient/{id}     # Delete patient
```

### Encounter Resource
```
GET    /fhir/Encounter        # Search encounters
POST   /fhir/Encounter        # Create encounter
GET    /fhir/Encounter/{id}   # Get encounter by ID
PUT    /fhir/Encounter/{id}   # Update encounter
```

### HL7 Integration
```
POST   /hl7/message           # Process HL7 v2.x messages
POST   /fhir/translate        # Convert between HL7 and FHIR
```

## Authentication

The API uses OAuth 2.0 with healthcare-specific scopes:

- `patient.read` - Read patient resources
- `patient.write` - Create/update patient resources
- `encounter.read` - Read encounter resources
- `encounter.write` - Create/update encounter resources

### Example Authorization Header
```
Authorization: Bearer {jwt-token}
```

## Data Model

### DynamoDB Single Table Design

The FHIR resources are stored in a single DynamoDB table with the following key structure:

```
PK: RESOURCE#{resourceType}#{id}
SK: v#{versionId}

GSI1PK: PATIENT#{patientId}        # Patient-centric queries
GSI1SK: CREATED#{timestamp}

GSI2PK: ENCOUNTER#{encounterId}     # Encounter-centric queries  
GSI2SK: RESOURCE#{resourceType}
```

### S3 Document Storage

Large documents and attachments are stored in S3:

```
Bucket: vitas-fhir-documents-{environment}-{account-id}
Key Pattern: {resourceType}/{resourceId}/{attachmentId}
```

## Development Workflow

### 1. Local Development

```bash
# Install dependencies
npm install

# Start local API
npm run local:start

# Run tests
npm run test:watch

# Type checking
npm run type-check
```

### 2. Testing

```bash
# Unit tests
npm test

# Integration tests with coverage
npm run test:coverage

# FHIR compliance validation
npm run test:fhir-compliance
```

### 3. Deployment

```bash
# Development environment
git push origin dev

# Staging environment  
git push origin staging

# Production environment
git push origin main
```

## CI/CD Pipeline

GitHub Actions workflows provide automated:

1. **Code Quality** - Linting, type checking, security scanning
2. **Testing** - Unit tests, integration tests, FHIR validation
3. **Deployment** - Environment-specific deployments
4. **Monitoring** - Post-deployment health checks

### Required Secrets

Configure these secrets in your GitHub repository:

```
AWS_ACCESS_KEY_ID           # Development AWS credentials
AWS_SECRET_ACCESS_KEY       
AWS_ACCESS_KEY_ID_STAGING   # Staging AWS credentials
AWS_SECRET_ACCESS_KEY_STAGING
AWS_ACCESS_KEY_ID_PROD      # Production AWS credentials  
AWS_SECRET_ACCESS_KEY_PROD
TEST_JWT_TOKEN              # Test JWT for integration tests
PROD_JWT_TOKEN              # Production JWT for health checks
SLACK_WEBHOOK               # Slack notifications (optional)
```

## Monitoring and Logging

### CloudWatch Dashboards

Access pre-configured dashboards for:

- FHIR API performance metrics
- Lambda function health and duration  
- DynamoDB read/write capacity and throttling
- Error rates and response times

### Audit Logging

All PHI access is logged with:

- User identification
- Resource type and ID (masked)
- Timestamp and operation
- Request source and outcome

### Alarms

Automatic alerts for:

- High error rates (>5%)
- Unusual access patterns
- Resource capacity thresholds
- Security violations

## Security Considerations

### Data Protection

- All data encrypted at rest (DynamoDB, S3)
- TLS 1.2+ for data in transit
- AWS KMS for key management
- S3 bucket policies prevent public access

### Access Control

- Least-privilege IAM roles
- Resource-based permissions
- FHIR scope-based authorization
- Multi-factor authentication for admin operations

### Compliance

- HIPAA-compliant infrastructure
- Audit logs for all PHI access
- Data retention policies
- Regular security assessments

## Troubleshooting

### Common Issues

1. **SAM Build Failures**
   ```bash
   # Clear cache and rebuild
   sam build --use-container --cached false
   ```

2. **DynamoDB Throttling**
   ```bash
   # Check CloudWatch metrics
   aws logs filter-log-events --log-group-name /aws/lambda/vitas-fhir-resource-manager-dev
   ```

3. **Authentication Errors**
   ```bash
   # Validate JWT token
   npm run test:auth -- --token="your-jwt-token"
   ```

### Support

For technical support:

1. Check the [troubleshooting guide](../docs/fhir/troubleshooting.md)
2. Review CloudWatch logs
3. Create an issue in the GitHub repository
4. Contact the VITAS development team

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Ensure FHIR compliance
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.# vitas-fhir
# vitas-fhir
