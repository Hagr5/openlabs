const jwt = require('jsonwebtoken');
const db = require('./db');

// Intentionally simple secret for a training environment.
const SECRET = 'aegis-internal-portal-2024';

function issueToken(employee) {
  return jwt.sign(
    {
      employee_id: employee.employee_id,
      username: employee.username,
      role: db.displayRole(employee)
    },
    SECRET,
    { algorithm: 'HS256', expiresIn: '2h' }
  );
}

// Strict verification used by REST + GraphQL v2 (the hardened surfaces).
function verifyStrict(token) {
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] });
}

// Used by GraphQL v1 login-gate: same strict check, just needs *a* valid
// logged-in caller. The v1 vulnerability is object-level, not authn-level.
function verifyLegacy(token) {
  return verifyStrict(token);
}

// VULNERABLE verifier used by the gRPC AdminService interceptor.
// It manually decodes the JWT and trusts whatever payload it finds,
// completely ignoring the signature - regardless of what `alg` the
// header claims. Any syntactically valid JWT (three dot-separated,
// base64url-decodable segments with a JSON payload) is accepted as-is,
// including tokens signed with a different secret, tokens signed with a
// different algorithm, or tokens with no real signature at all. This
// mirrors real-world signature-verification-skipped JWT bugs, broader
// than the classic alg:none case alone.
function verifyGrpcToken(token) {
  if (!token || typeof token !== 'string' || token.split('.').length < 2) {
    throw new Error('missing or malformed token');
  }
  const [headerB64, payloadB64] = token.split('.');
  // header is decoded only to confirm the segment is valid base64url JSON;
  // its contents (including alg) are never used to decide trust.
  JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

  // VULNERABILITY: no signature verification performed at all, for any alg.
  return payload;
}

function extractBearer(req) {
  const header = req.headers['authorization'] || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

module.exports = {
  SECRET,
  issueToken,
  verifyStrict,
  verifyLegacy,
  verifyGrpcToken,
  extractBearer
};
