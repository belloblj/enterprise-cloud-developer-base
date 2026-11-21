// coupons_import
// POST /coupons/import
//
// Saves coupons as JSON files in the "coupons" S3 bucket, one file per coupon,
// named after its coupon_id:  319326de971100158f6fa0daeec978fba1f17e4b.json
// No processing is done here; the ETL system picks the files up later.
//
// The request body can be either:
//   - a single coupon (see samples/t4_sample_coupon_import_event.json), or
//   - a list of coupons in a "coupons" field: { "coupons": [ {...}, {...} ] }
//
// Returns { "status": "success" } once every file is in the bucket.

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET_NAME = process.env.BUCKET_NAME || 'coupons';

// coupon_id becomes the file name, so only allow safe characters
// (no "/" or ".." that could write somewhere else in the bucket).
const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;

function getEndpoint() {
  if (process.env.AWS_ENDPOINT_URL) return process.env.AWS_ENDPOINT_URL;
  if (process.env.LOCALSTACK_HOSTNAME) {
    return `http://${process.env.LOCALSTACK_HOSTNAME}:${process.env.EDGE_PORT || 4566}`;
  }
  return undefined;
}

const endpoint = getEndpoint();
const s3 = new S3Client({ endpoint, forcePathStyle: Boolean(endpoint) });

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  // API Gateway sends the body as a string; a direct test event may be the
  // coupon itself.
  if (!event) return {};
  if (event.body === undefined) return event;
  if (event.body === null || event.body === '') return {};
  if (typeof event.body === 'object') return event.body;
  return JSON.parse(event.body);
}

exports.handler = async function(event) {
  let body;
  try {
    body = parseBody(event);
  } catch (err) {
    return response(400, { message: 'Request body must be valid JSON' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response(400, { message: 'Request body must be a JSON object' });
  }

  const coupons = Array.isArray(body.coupons) ? body.coupons : [body];
  if (coupons.length === 0) {
    return response(400, { message: 'The coupons list is empty' });
  }

  const invalid = coupons.findIndex((c) =>
    !c || typeof c !== 'object' || typeof c.coupon_id !== 'string' || !SAFE_ID.test(c.coupon_id));
  if (invalid !== -1) {
    return response(400, {
      message: `Coupon ${invalid} needs a coupon_id made of letters, numbers, "-" or "_"`,
    });
  }

  try {
    await Promise.all(coupons.map((coupon) => s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${coupon.coupon_id}.json`,
      Body: JSON.stringify(coupon, null, 2),
      ContentType: 'application/json',
    }))));
  } catch (err) {
    console.error('Error writing coupon files to S3', err);
    return response(500, { message: 'Could not import coupons' });
  }

  return response(200, { status: 'success' });
};
