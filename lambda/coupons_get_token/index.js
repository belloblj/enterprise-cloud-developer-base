// coupons_get_token
// POST /token  with body { "username": "...", "password": "..." }
// (see samples/t3_sample_coupons_get_token_event.json)
//
// 1. Looks the user up in the "users" DynamoDB table (key: username).
// 2. Compares the password with the bcrypt hash stored in the table
//    (hashes were made with bcrypt, 12 salt rounds).
// 3. If they match, returns a signed JWT and its lifetime in seconds,
//    shaped like samples/t3_sample_get_token_response.json.
//    If not, returns 403.
//
// bcryptjs is a pure-JavaScript version of bcrypt. It reads the same $2a$
// hashes but needs no compiled binary, so a package built on Windows still
// runs in the Linux Lambda runtime.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const USERS_TABLE = process.env.USERS_TABLE || 'users';
const JWT_SECRET = process.env.JWT_SECRET || '0HXc4w5NEzA61HkV';
const EXPIRES_IN = 3600; // seconds (1 hour)

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

const FORBIDDEN = { message: 'Invalid username or password' };

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  return JSON.parse(body);
}

exports.handler = async function(event) {
  let credentials;
  try {
    // API Gateway sends the body as a string; a direct test event may
    // put username/password on the event itself.
    credentials = event && event.body !== undefined ? parseBody(event.body) : event || {};
  } catch (err) {
    return response(400, { message: 'Request body must be valid JSON' });
  }

  const { username, password } = credentials || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return response(403, FORBIDDEN);
  }

  let user;
  try {
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { username },
    }));
    user = result.Item;
  } catch (err) {
    console.error('Error reading users table', err);
    return response(500, { message: 'Could not verify credentials' });
  }

  // Same message for "no such user" and "wrong password" so callers
  // can't find out which usernames exist.
  if (!user || typeof user.password !== 'string' ||
      !(await bcrypt.compare(password, user.password))) {
    return response(403, FORBIDDEN);
  }

  const token = jwt.sign({ sub: username }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: EXPIRES_IN,
  });

  return response(200, { token, expiresIn: EXPIRES_IN });
};
