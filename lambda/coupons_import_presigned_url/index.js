// coupons_import_presigned_url
// POST /coupons/import_presigned_url   with body { "filename": "<name>.json" }
// (see samples/t4_sample_coupon_import_presigned_url_event.json)
//
// Returns a pre-signed URL that lets the client upload that one file
// straight to the "coupons" S3 bucket with an HTTP PUT:
//   { "status": "success", "url": "...", "filename": "...", "expiresIn": 300 }
//
// The URL is signed for PutObject on exactly the key in "filename", so it
// can't be used to upload any other file, read files, or delete them.
// It stops working after 5 minutes.

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET_NAME = process.env.BUCKET_NAME || 'coupons';
const EXPIRES_IN = 300; // seconds

// The client calls the URL from outside LocalStack, so it must be signed for
// the address the client uses (http://localhost:4566), not LocalStack's
// internal one. S3_PUBLIC_ENDPOINT is set by the deploy script.
function getEndpoint() {
  if (process.env.S3_PUBLIC_ENDPOINT) return process.env.S3_PUBLIC_ENDPOINT;
  if (process.env.AWS_ENDPOINT_URL) return process.env.AWS_ENDPOINT_URL;
  return undefined;
}

const endpoint = getEndpoint();
const s3 = new S3Client({
  endpoint,
  forcePathStyle: Boolean(endpoint),
  // Newer SDK versions add a checksum of an EMPTY body to pre-signed URLs,
  // which makes S3 reject real uploads. Only add checksums when S3 needs them.
  requestChecksumCalculation: 'WHEN_REQUIRED',
});

// Plain file names ending in .json only: no folders, no "..".
const SAFE_FILENAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,200}\.json$/;

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
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

  const filename = body && body.filename;
  if (typeof filename !== 'string' || !SAFE_FILENAME.test(filename) || filename.includes('..')) {
    return response(400, {
      message: 'filename must be a plain file name ending in .json, e.g. coupon.json',
    });
  }

  try {
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: BUCKET_NAME, Key: filename }),
      { expiresIn: EXPIRES_IN }
    );
    return response(200, { status: 'success', url, filename, expiresIn: EXPIRES_IN });
  } catch (err) {
    console.error(`Error creating pre-signed URL for ${filename}`, err);
    return response(500, { message: 'Could not create upload URL' });
  }
};
