const crypto = require('crypto');
const { PUBLIC_KEY } = require('../keys');

// SnapSync originally verified tokens using the 'jsonwebtoken' library
// directly, but that blocked a legacy internal client that needed HS256
// support. To unblock it, a small custom verifier was written that reads
// the algorithm straight from the token header and dispatches to the
// matching primitive - using the same public key material for both.
// This is the intentional vulnerability for this challenge: nothing here
// restricts callers to the algorithm the token was actually issued with.

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(base64urlDecode(headerB64).toString('utf8'));
  const payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8'));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64urlDecode(sigB64);

  if (header.alg === 'RS256') {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signingInput);
    if (!verifier.verify(PUBLIC_KEY, signature)) {
      throw new Error('invalid signature');
    }
  } else if (header.alg === 'HS256') {
    const expected = crypto.createHmac('sha256', PUBLIC_KEY).update(signingInput).digest();
    if (expected.length !== signature.length || !crypto.timingSafeEqual(expected, signature)) {
      throw new Error('invalid signature');
    }
  } else {
    throw new Error('unsupported algorithm');
  }

  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw new Error('token expired');
  }

  return payload;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing bearer token' });
  }
  try {
    req.user = verifyToken(parts[1]);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden', message: `${role} role required` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
