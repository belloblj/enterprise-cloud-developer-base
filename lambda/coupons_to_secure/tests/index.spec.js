// Unit tests for coupons_to_secure (JWT validation).
const jwt = require('jsonwebtoken');
const { handler } = require('../index.js');

const SECRET = '0HXc4w5NEzA61HkV';

const apiGatewayEvent = (headers) => ({
  resource: '/coupons/to_secure',
  path: '/coupons/to_secure',
  httpMethod: 'GET',
  headers,
  body: null,
});

const validToken = () => jwt.sign({ sub: 'tester1' }, SECRET, { algorithm: 'HS256', expiresIn: 3600 });

describe('Coupon to secure', () => {
  test('Should return success for a valid token', async () => {
    const response = await handler(apiGatewayEvent({ Authorization: `Bearer ${validToken()}` }), null);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual({ status: 'success', username: 'tester1' });
  });

  test('Should accept the header in lower case', async () => {
    const response = await handler(apiGatewayEvent({ authorization: `Bearer ${validToken()}` }), null);

    expect(response.statusCode).toBe(200);
  });

  test('Should return 403 when there is no token', async () => {
    const response = await handler(apiGatewayEvent({}), null);

    expect(response.statusCode).toBe(403);
  });

  test('Should return 403 when the header has no "Bearer" prefix', async () => {
    const response = await handler(apiGatewayEvent({ Authorization: validToken() }), null);

    expect(response.statusCode).toBe(403);
  });

  test('Should return 403 for a token signed with another secret', async () => {
    const forged = jwt.sign({ sub: 'tester1' }, 'not-the-secret', { expiresIn: 3600 });

    const response = await handler(apiGatewayEvent({ Authorization: `Bearer ${forged}` }), null);

    expect(response.statusCode).toBe(403);
  });

  test('Should return 403 for an expired token', async () => {
    const expired = jwt.sign({ sub: 'tester1', exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);

    const response = await handler(apiGatewayEvent({ Authorization: `Bearer ${expired}` }), null);

    expect(response.statusCode).toBe(403);
  });

  test('Should return 403 for a token that was tampered with', async () => {
    const [header, , signature] = validToken().split('.');
    const fakePayload = Buffer.from(JSON.stringify({ sub: 'admin' })).toString('base64url');

    const response = await handler(
      apiGatewayEvent({ Authorization: `Bearer ${header}.${fakePayload}.${signature}` }), null);

    expect(response.statusCode).toBe(403);
  });

  test('Should return 403 for an unsigned ("none" algorithm) token', async () => {
    const unsigned = jwt.sign({ sub: 'tester1' }, null, { algorithm: 'none' });

    const response = await handler(apiGatewayEvent({ Authorization: `Bearer ${unsigned}` }), null);

    expect(response.statusCode).toBe(403);
  });
});
