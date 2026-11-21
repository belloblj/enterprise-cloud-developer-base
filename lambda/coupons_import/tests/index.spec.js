// Unit tests for coupons_import. S3 is mocked, so no LocalStack needed.
const { mockClient } = require('aws-sdk-client-mock');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { handler } = require('../index.js');
const sampleCoupon = require('../../../samples/t4_sample_coupon_import_event.json');

const s3Mock = mockClient(S3Client);

const apiGatewayEvent = (body) => ({
  resource: '/coupons/import',
  path: '/coupons/import',
  httpMethod: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

beforeEach(() => s3Mock.reset());

describe('Coupon import', () => {
  test('Should return success status for the sample coupon', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const response = await handler(apiGatewayEvent(sampleCoupon), null);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual({ status: 'success' });
  });

  test('Should save the coupon as <coupon_id>.json in the coupons bucket', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await handler(apiGatewayEvent(sampleCoupon), null);

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.Bucket).toBe('coupons');
    expect(input.Key).toBe('319326de971100158f6fa0daeec978fba1f17e4b.json');
    expect(input.ContentType).toBe('application/json');
    expect(JSON.parse(input.Body)).toStrictEqual(sampleCoupon);
  });

  test('Should also accept the sample coupon as the event itself', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const response = await handler(sampleCoupon, null);

    expect(response.statusCode).toBe(200);
    expect(s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.Key)
      .toBe(`${sampleCoupon.coupon_id}.json`);
  });

  test('Should save one file per coupon from the "coupons" list', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const second = { ...sampleCoupon, coupon_id: 'abc123', coupon_code: 'SAVE10' };

    const response = await handler(apiGatewayEvent({ coupons: [sampleCoupon, second] }), null);

    expect(response.statusCode).toBe(200);
    const keys = s3Mock.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key).sort();
    expect(keys).toStrictEqual([`${sampleCoupon.coupon_id}.json`, 'abc123.json']);
  });

  test('Should return 400 when coupon_id is missing', async () => {
    const { coupon_id: _ignored, ...noId } = sampleCoupon;

    const response = await handler(apiGatewayEvent(noId), null);

    expect(response.statusCode).toBe(400);
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  test('Should refuse a coupon_id that would write outside the file name', async () => {
    const response = await handler(apiGatewayEvent({ ...sampleCoupon, coupon_id: '../other/x' }), null);

    expect(response.statusCode).toBe(400);
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  test('Should not save anything when one coupon in the list is invalid', async () => {
    const response = await handler(apiGatewayEvent({ coupons: [sampleCoupon, { title: 'no id' }] }), null);

    expect(response.statusCode).toBe(400);
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  test('Should return 400 for an empty coupons list', async () => {
    const response = await handler(apiGatewayEvent({ coupons: [] }), null);

    expect(response.statusCode).toBe(400);
  });

  test('Should return 400 for a body that is not JSON', async () => {
    const response = await handler(apiGatewayEvent('{not json'), null);

    expect(response.statusCode).toBe(400);
  });

  test('Should return 500 when S3 fails', async () => {
    s3Mock.on(PutObjectCommand).rejects(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handler(apiGatewayEvent(sampleCoupon), null);

    expect(response.statusCode).toBe(500);
  });
});
