/**
 * FHIR Resource Manager
 * Handles CRUD operations for FHIR R4 resources with DynamoDB storage
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';
import { addSeconds, formatISO } from 'date-fns';

interface FHIRResource {
  resourceType: string;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
    profile?: string[];
  };
  [key: string]: any;
}

interface FHIRBundle {
  resourceType: 'Bundle';
  id: string;
  type: string;
  total?: number;
  entry?: {
    resource: FHIRResource;
    fullUrl?: string;
  }[];
}

export class FHIRResourceManager {
  private dynamoClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'sa-east-1'
    });
    this.dynamoClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.FHIR_TABLE_NAME || 'vitas-fhir-resources-dev';
    
    logger.debug('FHIRResourceManager initialized', {
      tableName: this.tableName,
      region: process.env.AWS_REGION
    });
  }

  private generateResourceId(): string {
    return uuidv4();
  }

  private getCurrentTimestamp(): string {
    return formatISO(new Date());
  }

  private buildPrimaryKey(resourceType: string, id: string): { PK: string; SK: string } {
    return {
      PK: `RESOURCE#${resourceType}#${id}`,
      SK: 'v1' // Start with version 1
    };
  }

  private validateResourceType(resourceType: string): boolean {
    const validTypes = ['Patient', 'Encounter', 'Practitioner', 'DocumentReference', 'Observation', 'Condition'];
    return validTypes.includes(resourceType);
  }

  private addMetadata(resource: FHIRResource, isUpdate: boolean = false, existingVersionId?: string): FHIRResource {
    const currentTime = this.getCurrentTimestamp();
    const versionId = isUpdate && existingVersionId 
      ? String(parseInt(existingVersionId) + 1)
      : '1';

    return {
      ...resource,
      meta: {
        ...resource.meta,
        versionId,
        lastUpdated: currentTime,
        profile: resource.meta?.profile || [`http://hl7.org/fhir/StructureDefinition/${resource.resourceType}`]
      }
    };
  }

  /**
   * Create a new FHIR resource
   */
  async createResource(resourceType: string, resource: any): Promise<FHIRResource> {
    logger.fhirOperation('CREATE', resourceType);
    
    // 1. Validate resource type
    if (!this.validateResourceType(resourceType)) {
      throw new Error(`Unsupported resource type: ${resourceType}`);
    }

    // 2. Validate basic resource structure
    if (!resource || typeof resource !== 'object') {
      throw new Error('Invalid resource: must be an object');
    }

    if (resource.resourceType && resource.resourceType !== resourceType) {
      throw new Error(`Resource type mismatch: expected ${resourceType}, got ${resource.resourceType}`);
    }

    // 3. Generate resource ID if not provided
    const resourceId = resource.id || this.generateResourceId();
    
    // 4. Add FHIR metadata
    const resourceWithMetadata = this.addMetadata({
      ...resource,
      resourceType,
      id: resourceId
    });

    // 5. Build DynamoDB item
    const { PK, SK } = this.buildPrimaryKey(resourceType, resourceId);
    const dynamoItem = {
      PK,
      SK,
      resourceType,
      resourceId,
      lastUpdated: resourceWithMetadata.meta!.lastUpdated,
      versionId: resourceWithMetadata.meta!.versionId,
      resource: resourceWithMetadata,
      // GSI indexes for querying
      GSI1PK: `RESOURCE_TYPE#${resourceType}`,
      GSI1SK: `CREATED#${resourceWithMetadata.meta!.lastUpdated}`,
      GSI2PK: `PATIENT#${resourceType === 'Patient' ? resourceId : resource.subject?.reference?.split('/')[1] || 'unknown'}`,
      GSI2SK: `RESOURCE#${resourceType}#${resourceId}`
    };

    // 6. Store in DynamoDB
    try {
      await this.dynamoClient.send(new PutCommand({
        TableName: this.tableName,
        Item: dynamoItem,
        ConditionExpression: 'attribute_not_exists(PK)' // Prevent overwriting existing resources
      }));

      logger.info('FHIR resource created successfully', {
        resourceType,
        resourceId,
        versionId: resourceWithMetadata.meta!.versionId
      });

      return resourceWithMetadata;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error(`Resource ${resourceType}/${resourceId} already exists`);
      }
      logger.error('Failed to create FHIR resource', {
        resourceType,
        resourceId,
        error: error.message
      });
      throw new Error(`Failed to create resource: ${error.message}`);
    }
  }

  /**
   * Get a specific FHIR resource by ID
   */
  async getResource(resourceType: string, id: string): Promise<FHIRResource> {
    logger.fhirOperation('READ', resourceType, id);
    
    // 1. Validate resource type and ID
    if (!this.validateResourceType(resourceType)) {
      throw new Error(`Unsupported resource type: ${resourceType}`);
    }

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid resource ID');
    }

    // 2. Build primary key for DynamoDB query
    const { PK, SK } = this.buildPrimaryKey(resourceType, id);

    try {
      // 3. Query DynamoDB for the resource
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: this.tableName,
        Key: { PK, SK }
      }));

      // 4. Check if resource exists
      if (!result.Item) {
        const error = new Error(`Resource ${resourceType}/${id} not found`);
        (error as any).statusCode = 404;
        throw error;
      }

      logger.info('FHIR resource retrieved successfully', {
        resourceType,
        resourceId: id,
        versionId: result.Item.versionId
      });

      // 5. Return the FHIR resource
      return result.Item.resource as FHIRResource;

    } catch (error: any) {
      if (error.statusCode === 404) {
        throw error; // Re-throw 404 errors as-is
      }
      
      logger.error('Failed to retrieve FHIR resource', {
        resourceType,
        resourceId: id,
        error: error.message
      });
      throw new Error(`Failed to retrieve resource: ${error.message}`);
    }
  }

  /**
   * Update an existing FHIR resource
   */
  async updateResource(resourceType: string, id: string, resource: any): Promise<FHIRResource> {
    logger.fhirOperation('UPDATE', resourceType, id);
    
    // 1. Validate resource type and ID
    if (!this.validateResourceType(resourceType)) {
      throw new Error(`Unsupported resource type: ${resourceType}`);
    }

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid resource ID');
    }

    // 2. Validate resource structure
    if (!resource || typeof resource !== 'object') {
      throw new Error('Invalid resource: must be an object');
    }

    if (resource.resourceType && resource.resourceType !== resourceType) {
      throw new Error(`Resource type mismatch: expected ${resourceType}, got ${resource.resourceType}`);
    }

    // 3. Get existing resource to check if it exists and get current version
    let existingResource;
    try {
      const { PK, SK } = this.buildPrimaryKey(resourceType, id);
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: this.tableName,
        Key: { PK, SK }
      }));

      if (!result.Item) {
        const error = new Error(`Resource ${resourceType}/${id} not found`);
        (error as any).statusCode = 404;
        throw error;
      }

      existingResource = result.Item;
    } catch (error: any) {
      if (error.statusCode === 404) {
        throw error;
      }
      logger.error('Failed to retrieve existing resource for update', {
        resourceType,
        resourceId: id,
        error: error.message
      });
      throw new Error(`Failed to update resource: ${error.message}`);
    }

    // 4. Add updated metadata
    const resourceWithMetadata = this.addMetadata({
      ...resource,
      resourceType,
      id
    }, true, existingResource.versionId);

    // 5. Build updated DynamoDB item
    const { PK, SK } = this.buildPrimaryKey(resourceType, id);
    const updatedSK = `v${resourceWithMetadata.meta!.versionId}`;
    
    const dynamoItem = {
      PK,
      SK: updatedSK,
      resourceType,
      resourceId: id,
      lastUpdated: resourceWithMetadata.meta!.lastUpdated,
      versionId: resourceWithMetadata.meta!.versionId,
      resource: resourceWithMetadata,
      // GSI indexes for querying
      GSI1PK: `RESOURCE_TYPE#${resourceType}`,
      GSI1SK: `UPDATED#${resourceWithMetadata.meta!.lastUpdated}`,
      GSI2PK: `PATIENT#${resourceType === 'Patient' ? id : resource.subject?.reference?.split('/')[1] || 'unknown'}`,
      GSI2SK: `RESOURCE#${resourceType}#${id}`
    };

    try {
      // 6. Store updated resource (creates new version)
      await this.dynamoClient.send(new PutCommand({
        TableName: this.tableName,
        Item: dynamoItem
      }));

      // 7. Update the main version pointer (v1) to point to latest version
      await this.dynamoClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { PK, SK: 'v1' },
        UpdateExpression: 'SET #resource = :resource, #lastUpdated = :lastUpdated, #versionId = :versionId',
        ExpressionAttributeNames: {
          '#resource': 'resource',
          '#lastUpdated': 'lastUpdated',
          '#versionId': 'versionId'
        },
        ExpressionAttributeValues: {
          ':resource': resourceWithMetadata,
          ':lastUpdated': resourceWithMetadata.meta!.lastUpdated,
          ':versionId': resourceWithMetadata.meta!.versionId
        }
      }));

      logger.info('FHIR resource updated successfully', {
        resourceType,
        resourceId: id,
        oldVersionId: existingResource.versionId,
        newVersionId: resourceWithMetadata.meta!.versionId
      });

      return resourceWithMetadata;

    } catch (error: any) {
      logger.error('Failed to update FHIR resource', {
        resourceType,
        resourceId: id,
        error: error.message
      });
      throw new Error(`Failed to update resource: ${error.message}`);
    }
  }

  /**
   * Delete a FHIR resource
   */
  async deleteResource(resourceType: string, id: string): Promise<void> {
    logger.fhirOperation('DELETE', resourceType, id);
    
    // 1. Validate resource type and ID
    if (!this.validateResourceType(resourceType)) {
      throw new Error(`Unsupported resource type: ${resourceType}`);
    }

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid resource ID');
    }

    // 2. Check if resource exists
    const { PK, SK } = this.buildPrimaryKey(resourceType, id);
    
    try {
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: this.tableName,
        Key: { PK, SK }
      }));

      if (!result.Item) {
        const error = new Error(`Resource ${resourceType}/${id} not found`);
        (error as any).statusCode = 404;
        throw error;
      }

      // 3. Delete the resource (soft delete by marking as deleted)
      // In FHIR, we typically do a soft delete to maintain audit trails
      const deletedResource = {
        ...result.Item.resource,
        meta: {
          ...result.Item.resource.meta,
          lastUpdated: this.getCurrentTimestamp(),
          versionId: String(parseInt(result.Item.versionId) + 1)
        },
        // FHIR deletion marker
        _deleted: true
      };

      const deletedItem = {
        ...result.Item,
        resource: deletedResource,
        lastUpdated: deletedResource.meta.lastUpdated,
        versionId: deletedResource.meta.versionId,
        deleted: true
      };

      // 4. Update the resource to mark as deleted
      await this.dynamoClient.send(new PutCommand({
        TableName: this.tableName,
        Item: deletedItem
      }));

      logger.info('FHIR resource deleted successfully', {
        resourceType,
        resourceId: id,
        versionId: deletedResource.meta.versionId
      });

    } catch (error: any) {
      if (error.statusCode === 404) {
        throw error; // Re-throw 404 errors as-is
      }
      
      logger.error('Failed to delete FHIR resource', {
        resourceType,
        resourceId: id,
        error: error.message
      });
      throw new Error(`Failed to delete resource: ${error.message}`);
    }
  }

  /**
   * Search FHIR resources with query parameters
   */
  async searchResources(resourceType: string, searchParams: Record<string, any>): Promise<FHIRBundle> {
    logger.fhirOperation('SEARCH', resourceType);
    
    // 1. Validate resource type
    if (!this.validateResourceType(resourceType)) {
      throw new Error(`Unsupported resource type: ${resourceType}`);
    }

    // 2. Parse pagination parameters
    const count = parseInt(searchParams._count) || 20; // Default page size
    const offset = parseInt(searchParams._offset) || 0;
    
    // 3. Build query parameters
    const queryParams: any = {
      TableName: this.tableName,
      IndexName: 'GSI1', // Use GSI1 for resource type queries
      KeyConditionExpression: 'GSI1PK = :resourceTypeKey',
      ExpressionAttributeValues: {
        ':resourceTypeKey': `RESOURCE_TYPE#${resourceType}`,
        ':deleted': false
      },
      FilterExpression: 'attribute_not_exists(deleted) OR deleted = :deleted',
      Limit: count,
      ScanIndexForward: false // Most recent first
    };

    // 4. Handle additional search parameters
    if (searchParams._lastUpdated) {
      queryParams.KeyConditionExpression += ' AND begins_with(GSI1SK, :lastUpdatedPrefix)';
      queryParams.ExpressionAttributeValues[':lastUpdatedPrefix'] = 'CREATED';
    }

    // 5. Add patient-specific filtering if searching for patient-related resources
    if (searchParams.subject && resourceType !== 'Patient') {
      const patientId = searchParams.subject.replace('Patient/', '');
      queryParams.IndexName = 'GSI2';
      queryParams.KeyConditionExpression = 'GSI2PK = :patientKey';
      queryParams.ExpressionAttributeValues[':patientKey'] = `PATIENT#${patientId}`;
    }

    try {
      // 6. Execute the query
      const result = await this.dynamoClient.send(new QueryCommand(queryParams));
      
      // 7. Process results and build FHIR Bundle
      const resources = (result.Items || []).map(item => item.resource as FHIRResource);
      
      const bundle: FHIRBundle = {
        resourceType: 'Bundle',
        id: this.generateResourceId(),
        type: 'searchset',
        total: result.Count || 0,
        entry: resources.map(resource => ({
          resource,
          fullUrl: `${resourceType}/${resource.id}`
        }))
      };

      logger.info('FHIR resource search completed', {
        resourceType,
        resultCount: resources.length,
        searchParams: Object.keys(searchParams)
      });

      return bundle;

    } catch (error: any) {
      logger.error('Failed to search FHIR resources', {
        resourceType,
        searchParams,
        error: error.message
      });
      throw new Error(`Failed to search resources: ${error.message}`);
    }
  }
}