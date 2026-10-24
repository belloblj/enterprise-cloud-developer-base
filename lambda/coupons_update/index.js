// coupons_update
// Receives an API Gateway (Lambda proxy) event with the coupon id in the path
// parameter "id" and a JSON body with the fields to change, for example:
//   PUT /coupons/{id}   { "title": "Save 25% on Fairmont hotels" }
// Only the fields sent are changed, and the coupon must already exist.
// Returns the full coupon after the update.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME || 'coupons';

function getEndpoint() {
  if (process.env.AWS_ENDPOINT_URL) return process.env.AWS_ENDPOINT_URL;
  if (process.env.LOCALSTACK_HOSTNAME) {
    return `http://${process.env.LOCALSTACK_HOSTNAME}:${process.env.EDGE_PORT || 4566}`;
  }
  return undefined;
}

const docClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: getEndpoint() }),
  { marshallOptions: { removeUndefinedValues: true } }
);

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  return JSON.parse(body);
}

exports.handler = async function(event) {
  const id = event && event.pathParameters && event.pathParameters.id;
  if (!id) {
    return response(400, { message: 'Path parameter "id" is required' });
  }

  let updates;
  try {
    updates = parseBody(event.body);
  } catch (err) {
    return response(400, { message: 'Request body must be valid JSON' });
  }

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return response(400, { message: 'Request body must be a JSON object' });
  }

  delete updates.coupon_id; // the table key can't be changed
  const fields = Object.keys(updates);
  if (fields.length === 0) {
    return response(400, { message: 'No fields to update' });
  }

  // Build "SET #f0 = :v0, #f1 = :v1" so any field name is safe to use,
  // including DynamoDB reserved words.
  const names = {};
  const values = {};
  const sets = fields.map((field, i) => {
    names[`#f${i}`] = field;
    values[`:v${i}`] = updates[field];
    return `#f${i} = :v${i}`;
  });

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { coupon_id: id },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(coupon_id)', // don't create new coupons
      ReturnValues: 'ALL_NEW',
    }));
    return response(200, result.Attributes);
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return response(404, { message: `Coupon ${id} not found` });
    }
    console.error(`Error updating coupon ${id}`, err);
    return response(500, { message: 'Could not update coupon' });
  }
};
