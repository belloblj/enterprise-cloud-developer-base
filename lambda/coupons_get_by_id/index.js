// coupons_get_by_id
// Receives an API Gateway (Lambda proxy) event with the coupon id in the path
// parameter "id" (GET /coupons/{id}) and returns the matching coupon from the
// "coupons" DynamoDB table, in the same shape as
// samples/t2_coupons_get_by_id_response.json.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME || 'coupons';

// LocalStack passes its address to the function through AWS_ENDPOINT_URL
// (or LOCALSTACK_HOSTNAME on older versions). On real AWS neither is set.
function getEndpoint() {
  if (process.env.AWS_ENDPOINT_URL) return process.env.AWS_ENDPOINT_URL;
  if (process.env.LOCALSTACK_HOSTNAME) {
    return `http://${process.env.LOCALSTACK_HOSTNAME}:${process.env.EDGE_PORT || 4566}`;
  }
  return undefined;
}

const docClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: getEndpoint() })
);

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

exports.handler = async function(event) {
  const id = event && event.pathParameters && event.pathParameters.id;
  if (!id) {
    return response(400, { message: 'Path parameter "id" is required' });
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { coupon_id: id },
    }));

    if (!result.Item) {
      return response(404, { message: `Coupon ${id} not found` });
    }

    return response(200, result.Item);
  } catch (err) {
    console.error(`Error retrieving coupon ${id}`, err);
    return response(500, { message: 'Could not retrieve coupon' });
  }
};
