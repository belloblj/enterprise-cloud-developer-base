// coupons_to_secure
// GET /coupons/to_secure  with header  Authorization: Bearer <token>
//
// Validates the JWT made by coupons_get_token (same secret, HS256 only).
// Returns 403 when the token is missing, malformed, signed with another
// secret, or expired. Otherwise returns the protected response.

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '0HXc4w5NEzA61HkV';

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// Header names can arrive in any case (Authorization, authorization, ...)
function getHeader(event, name) {
  const headers = (event && event.headers) || {};
  const key = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function getToken(event) {
  const header = getHeader(event, 'Authorization');
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

exports.handler = async function(event) {
  const token = getToken(event);
  if (!token) {
    return response(403, { message: 'Forbidden: missing token' });
  }

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return response(403, { message: 'Forbidden: invalid or expired token' });
  }

  return response(200, {
    status: 'success',
    username: claims.sub,
  });
};
