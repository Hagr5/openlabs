# Executive Summary

SnapSync is a deliberately vulnerable internal photo-sharing app, built
as a CTF challenge. It combines two bugs: a JWT verifier that trusts
whatever algorithm is named in the token\'s own header, and a separate
information-disclosure bug that leaks an internal route through a
photo\'s EXIF metadata.

The attacker starts with a normal, unprivileged employee account and
chains these two bugs together to become an admin and reach an
admin-only endpoint.

The main bug is based on a real 2026 production vulnerability,
CVE-2026-22817, in Hono's JWT middleware. On its own, this bug is a full
authentication bypass: anyone who can read the public JWKS endpoint can
forge a token with any claims they want, even for an account that
doesn't exist.

The challenge is meant to teach two things: how algorithm-confusion bugs
work, and why an endpoint being hard to find isn\'t the same as it being
secure. The second bug also gives players a bit of practice at
OSINT-style digging through data the app hands back to them.

# Challenge Overview

-   **Application functionality:** account signup/login, JPEG photo
    upload, photo listing, and photo download, all behind JWT bearer
    authentication.

-   **Scenario:** an internal company tool (\"SnapSync\") that staff use
    to share work photos.

-   **Primary vulnerability:** JWT algorithm confusion (RS256 → HS256).

-   **Secondary vulnerability:** Excessive Data Exposure (OWASP API3)
    --- a server-internal route reference is embedded in EXIF metadata
    and served back to users unchanged.

-   **Difficulty:** Medium

# Architecture & Trust Boundaries

Two services, isolated on a private Docker network (snapsync_net):

![](media/image1.png){width="5.0in" height="3.5in"}

**Trust boundaries:**

1\. The player, inside main-app, is the only boundary the player
directly controls. Authentication is via a bearer JWT; the role
(employee/admin) is claimed inside the token and is supposed to be
cryptographically tied to the key the server actually signed it with.

2\. main-app ↔ internal-processing-svc is a boundary the player never
touches directly. internal-processing-svc is deployed with expose (not
ports) in docker-compose.yml, so it has no host-mapped port and can't be
reached from outside snapsync_net. It's the only thing holding the flag,
which is loaded at container start from a Docker secret
(/run/secrets/flag) rather than an environment variable or a baked-in
file, so it never shows up in the image, in main-app's process, or in
any container's build history.

3\. Persistent state --- the SQLite database, uploaded files, and the
generated RSA keypair --- lives in named Docker volumes local to
main-app, and is wiped by docker compose down -v.

**Authentication:** signup and login issue a JWT signed with RS256,
using a 2048-bit RSA keypair generated fresh on each deployment
(main-app/src/keys.js). The matching public key is published at
/.well-known/jwks.json --- on its own, a normal and expected thing to do
for RS256.

**Authorization:** a single check, requireRole(\'admin\'), gates the one
sensitive route. There\'s no broader RBAC system to audit.

# Attacker Starting Point

-   **Initial access:** unauthenticated HTTP access to main-app only
    (http://localhost:3000).

-   **Credentials:** none given. Self-service signup is the only way to
    get an account, and it always issues the employee role.

-   **Role/privileges at start:** none, then employee after signing up.

-   **Known information:** only what the running app reveals through
    normal use. No source code or infrastructure access is assumed or
    needed.

-   **Restrictions:** none beyond the player rules in README.md.

# Attack Surface

This is a REST API over HTTP/JSON. The table below lists the routes,
auth requirements, and what each one does:

  ----------------------------------------------------------------------------------
  **Method & path**                 **Auth         **Purpose**
                                    required**     
  --------------------------------- -------------- ---------------------------------
  GET /api/docs                     none           Hand-written public API reference
                                                   (auth, photos, health, JWKS).
                                                   Doesn\'t list the hidden
                                                   directory-sync route.

  GET /.well-known/jwks.json        none           Publishes the RSA public key
                                                   (JWK) used to verify RS256
                                                   tokens.

  GET /api/health                   none           Liveness check.

  POST /api/auth/signup             none           Creates an account. Always issues
                                                   the employee role.

  POST /api/auth/login              none           Logs in an existing account.

  GET /api/photos                   bearer token   Lists your own photos.

  POST /api/photos/upload           bearer token   Uploads a JPEG. The server embeds
                                                   an internal reference in the EXIF
                                                   data and stores it.

  GET /api/photos/:id               bearer token,  Downloads a stored, EXIF-tagged
                                    must own the   photo.
                                    photo          

  GET                               bearer token,  Target. Undocumented. Proxies
  /api/directory/8d2158cd-hr-sync   role: admin    internal-processing-svc and
                                                   returns the flag on success.
  ----------------------------------------------------------------------------------

Rough workflow: sign up as an employee, upload and download a photo
(this is where the EXIF leak happens), then hit the directory-sync
endpoint (the privileged step). Two controls matter here: the JWT check
in middleware/auth.js, and the single requireRole('admin') check on that
last route.

# Vulnerability Description

Type: CWE-347 (Improper Verification of Cryptographic Signature) via JWT
algorithm confusion, plus a secondary CWE-200 (Exposure of Sensitive
Information) via EXIF metadata.

Affected component: main-app/src/middleware/auth.js (primary),
main-app/src/routes/photos.js (secondary).

Failed security control: algorithm pinning at verification time. The
verifier is supposed to only accept the algorithm the server actually
signs with (RS256); instead it branches on whatever header.alg the
caller sends.

**Root cause in code:** verifyToken() in auth.js does this:

> if (header.alg === \'RS256\') {\
> // verify signature using PUBLIC_KEY as an RSA public key\
> } else if (header.alg === \'HS256\') {\
> // verify signature using PUBLIC_KEY as an HMAC secret\
> }

Because the same RSA public key is reused both as the RS256 verification
key and, whenever a token claims alg: HS256, as the HMAC secret --- and
because that public key is intentionally public via JWKS --- anyone can
compute a valid HMAC-SHA256 signature over a payload of their choosing
(including role: admin) using the public key bytes as the secret. The
server\'s own verifier accepts it.

# Intended Attack Path

The full request-by-request walkthrough, with exact payloads and tooling
notes (including the SPKI-vs-PKCS1 PEM pitfall) and the negative-case
matrix, is in SOLUTION.md. Short version:

1\. GET /.well-known/jwks.json → get the RSA public key and kid.

2\. POST /api/auth/signup → get a valid employee RS256 token.

3\. POST /api/photos/upload, then GET /api/photos/{id} → download the
photo and read its EXIF UserComment: internal-ref:
/api/directory/8d2158cd-hr-sync.

4\. GET /api/directory/8d2158cd-hr-sync with the employee token → 403
(confirms the route is real and role-gated, not just discoverable).

5\. Rebuild the JWK as an SPKI PEM
(crypto.createPublicKey(\...).export(\...)) and sign { sub, role:
\'admin\' } with algorithm: \'HS256\', using that PEM string as the HMAC
key.

6\. Replay the same request with the forged token → 200 { \"status\":
\"synced\", \"log\": { \"status\": \"complete\", \"flag\":
\"duckurity(\...)\" } }.

# Impact Assessment

-   **Confidentiality --- High:** forging arbitrary claims lets anyone
    who's turned an unauthenticated session into an employee account
    impersonate admin and reach admin-only data or functionality ---
    here, the internal directory-sync response, which in a real system
    could plausibly include HR/employee data.

-   **Integrity --- Medium:** the forged token\'s claims (sub, role) are
    entirely attacker-controlled. In a system with more admin-only
    endpoints that write data, this would extend to unauthorized writes.

-   **Availability --- not directly hit:** the demonstrated endpoint is
    read-only, though the same auth bypass would generally also threaten
    availability controls (e.g., admin-only rate-limit resets) in a
    broader system.

-   **Privileges gained:** vertical privilege escalation from employee
    to admin, without ever holding valid admin credentials.

# Flag Retrieval

**Required condition:** a successful GET to
/api/directory/8d2158cd-hr-sync, carrying a bearer token whose signature
verifies under the server's flawed algorithm-dispatch logic and whose
role claim is admin.

**How the bug leads to the flag:** main-app treats a
successfully-verified admin token as enough to call
internal-processing-svc\'s /directory-status endpoint on the caller\'s
behalf, and passes its JSON response --- including the flag field ---
straight back to the caller, unmodified.

**Evidence of exploitation:** see SOLUTION.md for the exact captured
response, and validate/validate.js for an automated, repeatable
reproduction that checks the flag comes back in the expected format.

# Root Cause

The verifier picks its cryptographic algorithm from client-supplied,
unauthenticated token data (header.alg) instead of from a fixed
server-side expectation. Combine that with reusing one piece of key
material (PUBLIC_KEY) across two structurally different verification
modes --- an asymmetric signature check and a symmetric HMAC check ---
and anyone with access to that (intentionally public) key can produce
signatures the server will accept for a mode it never meant to allow
externally.

# Remediation

Full detail is in REMEDIATION.md. In short:

-   Pin the accepted algorithm(s) explicitly at verification time
    (algorithms: \[\'RS256\'\]), never derived from the token itself.

-   Replace the hand-rolled verifier with a maintained, up-to-date JWT
    library --- this exact bug class shipped in real libraries in 2026
    (Hono CVE-2026-22817, PyJWT CVE-2026-48526).

-   Strip internal-only bookkeeping (like the directory-sync reference)
    out of anything served back to end users; keep such references
    out-of-band if they need to exist at all.

# Verification & Retest

**Vulnerable behavior (current):** an HS256 token signed with the RSA
public key bytes and role: admin is accepted by requireAuth /
requireRole(\'admin\').

**Expected behavior after the fix:** the same forged token must be
rejected with 401 Unauthorized once the verifier pins algorithms:
\[\'RS256\'\] and stops branching on the token\'s own alg header.

**Retest steps:** 1. Apply the fix in REMEDIATION.md to auth.js. 2.
Rebuild and reset the environment (./reset.sh). 3. Re-run
validate/validate.js --- the forged-token step (step 6) should now fail
with 401, while every legitimate flow (signup, login, upload, download,
employee-token 403 on the hidden route) should keep passing.

**Regression check:** validate/validate.js doubles as this check --- it
keeps passing its negative cases (missing auth → 401, employee token on
the hidden route → 403, guessed paths → 404) regardless of the fix,
while its exploit assertion is expected to flip from pass to fail once
the fix lands. That flip is itself confirmation the fix works.

# Unintended Attack Paths

These were explicitly tested during design and validation, and confirmed
not to offer a shortcut around the intended path:

  -----------------------------------------------------------------------
  **Attempt**                           **Result**
  ------------------------------------- ---------------------------------
  GET /api/docs                         Only lists the intentionally
                                        public routes. The directory-sync
                                        route isn\'t there, confirming
                                        it\'s not exposed through the
                                        docs.

  GET /api/directory/sync,              Plain 404, same as a route that
  /api/directory/sync-photo, and other  doesn\'t exist. No hint that
  guessed paths, with a valid token     another path is out there.

  Correct, discovered path with no      401 Unauthorized
  Authorization header                  

  Correct, discovered path with a       403 Forbidden
  valid, non-forged employee token      

  Reading the endpoint path straight    Still 403. Confirms the path
  from source (skipping the             itself isn\'t the security
  EXIF-discovery step) with a real      boundary; only the
  employee token                        forged-admin-role check is.

  Trying to get the admin role by       Ignored. The role is hardcoded
  tampering with the signup/login       server-side at signup and never
  request body (e.g. adding             read from client input.
  \"role\":\"admin\" to the signup      
  payload)                              
  -----------------------------------------------------------------------

No alternative solution path was found. No unrelated bug --- SQL
injection, path traversal on file download, IDOR on /api/photos/:id ---
turned out to be exploitable in this build; the photo download route
correctly checks photo.owner_id !== user.id before serving a file.

# Real-World Basis

The main vulnerability is based directly on CVE-2026-22817, a Hono
JWT/JWKS verification bug disclosed in January 2026. It was rated CVSS
8.2 and fixed in hono@4.11.4.

In the real bug, Hono used the alg value from the matching JWK when one
was available. But if the JWK didn\'t include an alg field, it fell back
to trusting the alg value from the JWT header instead. Since alg is
optional and often missing from JWKS configs, an attacker could take the
server\'s RSA public key, use it as an HMAC secret to build an HS256
token, and get the server to accept it --- a full authentication bypass.

SnapSync recreates the same basic mistake in
main-app/src/middleware/auth.js. Instead of using a vulnerable library
version, the challenge uses a small custom JWT verifier that trusts the
client-supplied alg value and reuses the same key material for both the
asymmetric and symmetric algorithms.

This makes the bug easier to see: participants can read the code and
follow exactly what goes wrong. The full reasoning behind that design
choice is in DESIGN.md §6.

A similar PyJWT bug, CVE-2026-48526, shows this kind of
algorithm-confusion issue isn\'t limited to one framework or language.
