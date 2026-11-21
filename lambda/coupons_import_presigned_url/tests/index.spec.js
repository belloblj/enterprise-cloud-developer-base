// Unit tests for coupons_import_presigned_url.
// Signing a URL happens locally (no network call), so no mocks are needed;
// dummy credentials and the LocalStack address are set below.
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.S3_PUBLIC_ENDPOINT = 'http://localhost:4566';

const { handler } = require('../index.js');
const sampleEvent = require('../../../samples/t4_sample_coupon_import_presigned_url_event.json');

const apiGatewayEvent = (body) => ({
  resource: '/coupons/import_presigned_url',
  path: '/coupons/import_presigned_url',
  httpMethod: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('Coupon import pre-signed url', () => {
  test('Should return success status and a URL for the sample event', async () => {
    const response = await handler(apiGatewayEvent(sampleEvent), null);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('success');
    expect(body.filename).toBe(sampleEvent.filename);
    expect(body.expiresIn).toBe(300);
    expect(typeof body.url).toBe('string');
  });

  test('Should sign the URL for uploading exactly that file to the coupons bucket', async () => {
    const response = await handler(apiGatewayEvent(sampleEvent), null);
    const url = new URL(JSON.parse(response.body).url);

    expect(url.origin).toBe('http://localhost:4566');
    expect(url.pathname).toBe(`/coupons/${sampleEvent.filename}`);
    expect(url.searchParams.get('x-id')).toBe('PutObject');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('Should not lock the URL to an empty-file checksum', async () => {
    const response = await handler(apiGatewayEvent(sampleEvent), null);
    const url = new URL(JSON.parse(response.body).url);

    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(url.searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
  });

  test('Should work with the coupon.json file name from the instructions', async () => {
    const response = await handler(apiGatewayEvent({ filename: 'coupon.json' }), null);

    expect(response.statusCode).toBe(200);
    expect(new URL(JSON.parse(response.body).url).pathname).toBe('/coupons/coupon.json');
  });

  test('Should also accept the sample as the event itself', async () => {
    const response = await handler(sampleEvent, null);

    expect(response.statusCode).toBe(200);
  });

  test('Should return 400 when filename is missing', async () => {
    const response = await handler(apiGatewayEvent({}), null);

    expect(response.statusCode).toBe(400);
  });

  test('Should return 400 for a file that is not .json', async () => {
    const response = await handler(apiGatewayEvent({ filename: 'script.exe' }), null);

    expect(response.statusCode).toBe(400);
  });

  test('Should return 400 for a filename with a folder or ".."', async () => {
    for (const filename of ['../secret.json', 'other/coupon.json', '..json', '.hidden.json']) {
      const response = await handler(apiGatewayEvent({ filename }), null);
      expect(response.statusCode).toBe(400);
    }
  });

  test('Should return 400 for a body that is not JSON', async () => {
    const response = await handler(apiGatewayEvent('{not json'), null);

    expect(response.statusCode).toBe(400);
  });
});
