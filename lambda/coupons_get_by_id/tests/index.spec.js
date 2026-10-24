// Unit tests for coupons_get_by_id. DynamoDB is mocked, so no LocalStack needed.
const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { handler } = require('../index.js');
const sampleCoupon = require('../../../samples/t2_coupons_get_by_id_response.json');

const ddbMock = mockClient(DynamoDBDocumentClient);

const apiGatewayEvent = (id) => ({
  resource: '/coupons/{id}',
  path: `/coupons/${id}`,
  httpMethod: 'GET',
  pathParameters: id === undefined ? null : { id },
  body: null,
});

beforeEach(() => ddbMock.reset());

describe('Coupon get by id', () => {
  test('Should return the coupon matching the id (sample response)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleCoupon });

    const response = await handler(apiGatewayEvent(sampleCoupon.coupon_id), null);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual(sampleCoupon);
  });

  test('Should look up the coupons table by coupon_id', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleCoupon });

    await handler(apiGatewayEvent('abc123'), null);

    const input = ddbMock.commandCalls(GetCommand)[0].args[0].input;
    expect(input).toStrictEqual({ TableName: 'coupons', Key: { coupon_id: 'abc123' } });
  });

  test('Should return 404 when the coupon does not exist', async () => {
    ddbMock.on(GetCommand).resolves({});

    const response = await handler(apiGatewayEvent('missing'), null);

    expect(response.statusCode).toBe(404);
  });

  test('Should return 400 when the id path parameter is missing', async () => {
    const response = await handler(apiGatewayEvent(undefined), null);

    expect(response.statusCode).toBe(400);
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });

  test('Should return 500 when DynamoDB fails', async () => {
    ddbMock.on(GetCommand).rejects(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handler(apiGatewayEvent('abc123'), null);

    expect(response.statusCode).toBe(500);
  });
});
