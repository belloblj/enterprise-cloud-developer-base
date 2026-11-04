// Unit tests for coupons_get_token. DynamoDB is mocked, so no LocalStack needed.
// The stored hash is the real bcrypt (12 rounds) hash of tester1's password.
const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const jwt = require('jsonwebtoken');
const { handler } = require('../index.js');
const sampleEvent = require('../../../samples/t3_sample_coupons_get_token_event.json');
const sampleResponse = require('../../../samples/t3_sample_get_token_response.json');

const SECRET = '0HXc4w5NEzA61HkV';
const tester1 = {
  username: 'tester1',
  password: '$2a$12$wCqYSCDDoHdlUCI7rBBHO..c4KleiSzZqH8NXMHdLIcLsVxFmvG7C',
};

const ddbMock = mockClient(DynamoDBDocumentClient);

const apiGatewayEvent = (body) => ({
  resource: '/token',
  path: '/token',
  httpMethod: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

beforeEach(() => ddbMock.reset());

describe('Coupon get token', () => {
  test('Should return a token and expiresIn for valid credentials (sample event)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: tester1 });

    const response = await handler(apiGatewayEvent(sampleEvent), null);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(Object.keys(body).sort()).toStrictEqual(Object.keys(sampleResponse).sort());
    expect(body.expiresIn).toBe(3600);
    expect(typeof body.token).toBe('string');
  });

  test('Should sign the token with the shared secret, for one hour', async () => {
    ddbMock.on(GetCommand).resolves({ Item: tester1 });

    const response = await handler(apiGatewayEvent(sampleEvent), null);
    const claims = jwt.verify(JSON.parse(response.body).token, SECRET, { algorithms: ['HS256'] });

    expect(claims.sub).toBe('tester1');
    expect(claims.exp - claims.iat).toBe(3600);
  });

  test('Should look the user up in the users table', async () => {
    ddbMock.on(GetCommand).resolves({ Item: tester1 });

    await handler(apiGatewayEvent(sampleEvent), null);

    const input = ddbMock.commandCalls(GetCommand)[0].args[0].input;
    expect(input).toStrictEqual({ TableName: 'users', Key: { username: 'tester1' } });
  });

  test('Should return 403 for a wrong password', async () => {
    ddbMock.on(GetCommand).resolves({ Item: tester1 });

    const response = await handler(apiGatewayEvent({ username: 'tester1', password: 'wrong' }), null);

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).token).toBeUndefined();
  });

  test('Should return 403 for an unknown user', async () => {
    ddbMock.on(GetCommand).resolves({});

    const response = await handler(apiGatewayEvent({ username: 'nobody', password: 'x' }), null);

    expect(response.statusCode).toBe(403);
  });

  test('Should return 403 when username or password is missing', async () => {
    const response = await handler(apiGatewayEvent({ username: 'tester1' }), null);

    expect(response.statusCode).toBe(403);
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });

  test('Should return 400 for a body that is not JSON', async () => {
    const response = await handler(apiGatewayEvent('{not json'), null);

    expect(response.statusCode).toBe(400);
  });

  test('Should return 500 when DynamoDB fails', async () => {
    ddbMock.on(GetCommand).rejects(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handler(apiGatewayEvent(sampleEvent), null);

    expect(response.statusCode).toBe(500);
  });
});
