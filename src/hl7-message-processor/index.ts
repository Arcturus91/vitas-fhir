import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('HL7 Message Processor - TODO: Implement HL7 v2.x processing');
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'HL7 Message Processor - Not implemented yet',
      event: event.body,
    }),
  };
};