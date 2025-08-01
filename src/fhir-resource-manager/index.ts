import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { FHIRResourceManager } from './resourceManager';
import { logger } from './logger';

/**
 * AWS Lambda handler for FHIR Resource Management
 * Handles CRUD operations for FHIR R4 resources
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  logger.info('FHIR Resource Manager invoked', {
    requestId: context.awsRequestId,
    httpMethod: event.httpMethod,
    path: event.path,
    queryString: event.queryStringParameters,
  });

  try {
    const resourceManager = new FHIRResourceManager();
    
    // Parse the path to extract resource type and ID
    const pathParts = event.path.split('/').filter(part => part);
    const resourceType = pathParts[1]; // /fhir/Patient -> Patient
    const resourceId = pathParts[2]; // /fhir/Patient/123 -> 123

    let result;

    switch (event.httpMethod) {
      case 'GET':
        if (resourceId) {
          // Get specific resource by ID
          result = await resourceManager.getResource(resourceType, resourceId);
        } else {
          // Search resources with query parameters
          result = await resourceManager.searchResources(resourceType, event.queryStringParameters || {});
        }
        break;

      case 'POST':
        // Create new resource
        const createBody = JSON.parse(event.body || '{}');
        result = await resourceManager.createResource(resourceType, createBody);
        break;

      case 'PUT':
        // Update existing resource
        if (!resourceId) {
          return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: 'Resource ID required for PUT operation'
            })
          };
        }
        const updateBody = JSON.parse(event.body || '{}');
        result = await resourceManager.updateResource(resourceType, resourceId, updateBody);
        break;

      case 'DELETE':
        // Delete resource
        if (!resourceId) {
          return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: 'Resource ID required for DELETE operation'
            })
          };
        }
        await resourceManager.deleteResource(resourceType, resourceId);
        result = { message: 'Resource deleted successfully' };
        break;

      default:
        return {
          statusCode: 405,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: `Method ${event.httpMethod} not allowed`
          })
        };
    }

    logger.info('FHIR operation completed successfully', {
      requestId: context.awsRequestId,
      operation: `${event.httpMethod} ${resourceType}`,
      resourceId
    });

    return {
      statusCode: event.httpMethod === 'POST' ? 201 : 200,
      headers: {
        'Content-Type': 'application/fhir+json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify(result)
    };

  } catch (error) {
    logger.error('FHIR Resource Manager error', {
      requestId: context.awsRequestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    const statusCode = error instanceof Error && 'statusCode' in error 
      ? (error as any).statusCode 
      : 500;

    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        requestId: context.awsRequestId
      })
    };
  }
}