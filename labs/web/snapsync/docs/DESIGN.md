# SnapSync --- Challenge Design Document

This is Internal design document. Not for player distribution ---
contains the full intended solution path. Distinct from `README.md`
(player-facing) and `SECURITY_REPORT.md` (formal write-up for
evaluators).

## 1. Challenge Metadata

  ------------------------------------------------------------------------
  Field           Value
  --------------- --------------------------------------------------------
  Challenge name  SnapSync

  API type        REST

  Learning        Understand how trusting the JWT alg value provided by
  objective       the client, instead of enforcing the expected algorithm
                  on the server, can let an attacker regenerate tokens
                  with any claims they want. Then, when combined with an
                  information-disclosure bug that reveals an undocumented
                  endpoint, this can lead to full privilege escalation and
                  access to an admin-only function.

  Primary         JWT algorithm confusion (RS256 → HS256), using a
  vulnerability   hand-rolled verifier that reads `alg` from the token
                  header instead of an explicit allowlist
                  (CVE-2026-22817).

  Secondary       Excessive Data Exposure (API3) where an internal route
  vulnerability   is embedded in uploaded photo EXIF metadata and served
                  back to the uploader unmodified.

  Chained impact  Broken Function-Level Authorization (API5) --- the
                  forged `admin` role reaches a real, working,
                  undocumented endpoint.

  Difficulty      Medium--Hard

  Estimated solve 1.5--3 hours for a technically participant unfamiliar
  time            with this specific bug class, 30--45 minutes for someone
                  who already knows JWT attacks

  Required skills HTTP/API request intercepting and replay; JWT structure
                  (header/payload/signature, base64url); basic scripting
                  (Node.js or Python) to sign a token programmatically;
                  reading EXIF metadata.

  Prerequisites   Understanding of the difference between (HMAC) and (RSA)
                  signature verification, and why reusing key material
                  across both is unsafe.

  Flag format     `duckurity(...)`

  Real-world      CVE-2026-22817 (Hono JWT/JWKS middleware, disclosed 13
  basis           Jan 2026, CVSS 8.2 (GHSA-f67f-6cw9-8mq4), CWE-347, fixed
                  in hono@4.11.4)
  ------------------------------------------------------------------------

## 2. Application Scenario

SnapSync is an internal company photo sharing tool ( like a subdomain) ,
where Employees sign up, upload JPEG photos, and download their own
photos back. Which is an realistic feature

## 3. Attacker Starting Point, Roles, Privileges, Assumptions

-   **Access:** Unauthenticated, black-box HTTP access to
    `http://localhost:3000` only. No source code, no credentials, no
    pre-issued token.
-   **Roles in the system:** `employee` ( this is the *only* role
    signup/login can ever issue) and `admin` (not obtainable through any
    legitimate flow).
-   **Assumption:** the participant will create their own `employee`
    account as the very first step; every subsequent step is reachable
    from that starting point using only the application's own HTTP
    surface.
-   **Out of scope / not required:** source code access, container
    access, or any credential beyond what the app itself issues at
    signup.

## 4. Intended Attack Path (design-time)

1.  Recon: `GET /api/docs` (public API reference --- lists auth, photos,
    and health routes only and `GET /.well-known/jwks.json` --- discover
    the RSA public key used to verify RS256 tokens
    (`kid: snapsync-2026-01`). Both endpoints are intentionally public;
    publishing API docs and a JWKS are normal API design, not bugs.
2.  `POST /api/auth/signup` --- get a normal `employee`-role RS256
    token.
3.  `POST /api/photos/upload` then `GET /api/photos/{id}` --- upload any
    JPEG, download it back, and inspect its EXIF `metadata`. It contains
    a literal, undocumented internal endpoint path in the user comment
    (`/api/directory/8d2158cd-hr-sync`). This is the only place the path
    is ever exposed.
4.  Confirm the path is real but role-gated:
    `GET /api/directory/8d2158cd-hr-sync` with the employee token →
    `403`.
5.  Forge an HS256 token with `role: admin`, using the RSA **public**
    key bytes (SPKI PEM, reconstructed from the JWKS) as the HMAC
    secret.
6.  Replay the same request with the forged token → `200`, response
    proxies data from an isolated internal service and includes the
    flag.

## 5. Real-World Basis

This challenge's primary vulnerability was modeled directly on
CVE-2026-22817, disclosed 13 January 2026 against the Hono web
framework's JWT/JWKS verification middleware (CWE-347, CVSS 8.2, patched
in hono@4.11.4).

**The real bug:** When Hono verified a JWT using a JWK or JWKS endpoint,
it normally used the alg value from the matching JWK. However, if the
JWK didn't have an alg field, Hono would fall back to the alg value from
the attacker-controlled JWT header.

Since alg is optional in JWKs and is often missing, an attacker could
get the framework's public key from its JWKS endpoint, use that public
key as the HMAC secret to create an HS256 token, and have the server
accept it as valid.

This result is full authentication bypass in affected deployments.

**How SnapSync adapts it:** `main-app/src/middleware/auth.js` reproduces
the same class of flaw in a simplified, hand-rolled verifier (rather
than reusing Hono itself) so the challenge doesn't depend on pinning a
specific library version, and so the vulnerable branch is easy for a
participant to read and reason about directly: it dispatches on
`header.alg` from the token exactly as the vulnerable Hono code did, and
--- to make the exploit reliably reachable without depending on a
specific JWK-shape edge case --- always reuses the same RSA public key
material as the HMAC secret for the HS256 branch, which is the same
underlying mistake (untrusted `alg` + reused key material) that made the
original CVE exploitable.

## 6. Known Alternative / Unintended Paths Considered

There is no unintended solution, unless you find one tell me :)
