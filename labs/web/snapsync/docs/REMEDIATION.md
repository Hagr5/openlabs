# SnapSync --- Remediation

## Root Cause

`main-app/src/middleware/auth.js` implements a custom JWT verifier that
selects its verification primitive based on the `alg` field in the
**token's own header** --- data the caller fully controls --- instead of
an algorithm the server decides on ahead of time. It also reuses one RSA
public key as both an RS256 verification key and, when `alg: HS256` is
claimed, an HMAC secret. Because the public key is (correctly, by
design) published via JWKS, any caller can compute a valid HMAC
signature over arbitrary claims.

## Required Fix

Pin the algorithm server-side; never derive it from client input.

As a client, just update your technologies fast :)

**Before (vulnerable):**

    if (header.alg === 'RS256') {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(signingInput);
      if (!verifier.verify(PUBLIC_KEY, signature)) throw new Error('invalid signature');
    } else if (header.alg === 'HS256') {
      const expected = crypto.createHmac('sha256', PUBLIC_KEY).update(signingInput).digest();
      if (expected.length !== signature.length || !crypto.timingSafeEqual(expected, signature)) {
        throw new Error('invalid signature');
      }
    }

**After (fixed) --- using a maintained library with an explicit
allowlist:**

    const jwt = require('jsonwebtoken');

    function verifyToken(token) {
      // Only RS256 is ever accepted, regardless of what the token claims.
      return jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
    }

If a hand-rolled verifier must be kept for some reason, at minimum:

    function verifyToken(token) {
      const [headerB64, payloadB64, sigB64] = token.split('.');
      const header = JSON.parse(base64urlDecode(headerB64).toString('utf8'));

      if (header.alg !== 'RS256') {
        throw new Error('unsupported algorithm'); // reject everything except the one expected mode
      }
      // ...proceed with RS256 verification only
    }
    also check the metadata handling to remove all the data and don’t expoose any info 

## Verification That the Fix Works

After applying the fix, re-run `validate/validate.js`: - The
forged-token exploit step should now return `401 Unauthorized` instead
of `200` with a flag. - All legitimate flows (signup, login, upload,
download, employee token correctly getting `403` on the hidden route)
should be unaffected.
