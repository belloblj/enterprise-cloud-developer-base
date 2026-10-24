// Unit tests for coupons_update. DynamoDB is mocked, so no LocalStack needed.
const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { handler } = require('../index.js');
const sampleCoupon = require('../../../samples/t2_coupons_get_by_id_response.json');

const ddbMock = mockClient(DynamoDBDocumentClient);

const apiGatewayEvent = (id, body) => ({
  resource: '/coupons/{id}',
  path: `/coupons/${id}`,
  httpMethod: 'PUT',
  pathParameters: id === undefined ? null : { id },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

beforeEach(() => ddbMock.reset());

describe('Coupon update', () => {
  test('Should return the updated coupon', async () => {
    const updated = { ...sampleCoupon, title: 'Save 25% on Fairmont hotels' };
    ddbMock.on(UpdateCommand).resolves({ Attributes: updated });

    const response = await handler(
      apiGatewayEvent(sampleCoupon.coupon_id, { title: updated.title }), null);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual(updated);
  });

  test('Should only update the fields sent, on an existing coupon', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: {} });

    await handler(apiGatewayEvent('abc123', { coupon_code: 'SAVE25', end_date: '1704067200' }), null);

    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.TableName).toBe('coupons');
    expect(input.Key).toStrictEqual({ coupon_id: 'abc123' });
    expect(input.UpdateExpression).toBe('SET #f0 = :v0, #f1 = :v1');
    expect(input.ExpressionAttributeNames).toStrictEqual({ '#f0': 'coupon_code', '#f1': 'end_date' });
    expect(input.ExpressionAttributeValues).toStrictEqual({ ':v0': 'SAVE25', ':v1': '1704067200' });
    expect(input.ConditionExpression).toBe('attribute_exists(coupon_id)');
    expect(input.ReturnValues).toBe('ALL_NEW');
  });

  test('Should not allow the coupon_id to be changed', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: {} });

    await handler(apiGatewayEvent('abc123', { coupon_id: 'other', title: 'New' }), null);

    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(Object.values(input.ExpressionAttributeNames)).toStrictEqual(['title']);
    expect(input.Key).toStrictEqual({ coupon_id: 'abc123' });
  });

  test('Should return 404 when the coupon does not exist', async () => {
    const err = new Error('The conditional request failed');
    err.name = 'ConditionalCheckFailedException';
    ddbMock.on(UpdateCommand).rejects(err);

    const response = await handler(apiGatewayEvent('missing', { title: 'x' }), null);

    expect(response.statusCode).toBe(404);
  });

  test('Should return 400 for invalid JSON', async () => {
    const response = await handler(apiGatewayEvent('abc123', '{not json'), null);

    expect(response.statusCode).toBe(400);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  test('Should return 400 when there is nothing to update', async () => {
    const response = await handler(apiGatewayEvent('abc123', {}), null);

    expect(response.statusCode).toBe(400);
  });

  test('Should return 400 when the id path parameter is missing', async () => {
    const response = await handler(apiGatewayEvent(undefined, { title: 'x' }), null);

    expect(response.statusCode).toBe(400);
  });

  test('Should return 500 when DynamoDB fails', async () => {
    ddbMock.on(UpdateCommand).rejects(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handler(apiGatewayEvent('abc123', { title: 'x' }), null);

    expect(response.statusCode).toBe(500);
  });
});
