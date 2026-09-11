# ShopVault Security Report

This report documents the challenge, its component weaknesses, the
intended attack path at a phase level, and the recommended remediation.
Exact requests, values, and command sequences are retained by the
author and are not published here.

## 9.1 Executive Summary

ShopVault is a deliberately vulnerable REST API challenge that models
an e-commerce backend. The participant starts unauthenticated with a
single API target and must chain several component weaknesses into a
vertical privilege-escalation path that reaches a manager-only
protected resource containing the flag.

The primary vulnerability family is API chaining: individually
moderate weaknesses, an authentication response discrepancy, a
client-trusted rate-limit identity, and a low-entropy HS256 signing
secret, combine into a critical compromise.

## 9.2 Challenge Overview

- **Application type:** Flask REST API backed by SQLite
- **Roles:** user, admin, manager (all resolved from the database)
- **Difficulty:** hard
- **Estimated solve time:** 60–90 minutes
- **Primary family:** API chaining
- **Component families:** observable authentication discrepancy;
  client-controlled rate-limit identity; low-entropy HMAC signing
  secret

## 9.3 Architecture & Trust Boundaries

Components:

- Gunicorn (single worker) fronting a Flask application
- SQLite database with a users table containing id, username,
  password_hash, role, and is_active; reseeded on container start
- HS256 JWT bearer authentication

Authentication: username + password produces a JWT containing
subject, username, role, issued-at, and expiry.

Authorization: on every authenticated request, role is re-resolved
from the database via the token subject. The role claim in the JWT
payload is not trusted.

Trust boundaries crossed by the intended path:

- Authentication responses differ observably between failure modes
- The lockout identity is derived from a client-supplied header
- The JWT signing secret is short and thematically tied to an internal
  codename exposed by an unauthenticated endpoint

## 9.4 Attacker Starting Point

- Initial access: none
- Credentials: none
- Role: none
- Known information: API base URL only
- Restrictions: no source access at play time. The repository is
  public, but the intended solve path assumes black-box interaction
  with the running container.

## 9.5 Attack Surface

The API exposes authentication, user self-service, administrative
user management, and manager-only reporting. One undocumented
endpoint returns a themed reconnaissance hint. One undocumented
endpoint under the administrative namespace is a decoy: it requires
real administrative authentication and returns no useful data.

Exact endpoint paths are not enumerated here, so that the
reconnaissance phase of the challenge remains intact. The full route
list is visible in `app/server.py` to anyone reviewing the source.

## 9.6 Vulnerability Description

Three component weaknesses are introduced. Each is a well-known
class. The learning objective is the composition.

**Component A, low-entropy HS256 signing secret.** The signing key
is short, human-chosen, and thematically related to a codename that
is exposed by an unauthenticated endpoint. HS256 is symmetric, so an
offline dictionary or mask attack against a captured token recovers
the key. With the key, arbitrary tokens can be forged and signed.
(CWE-327, CWE-330)

**Component B, observable authentication discrepancy.** Failed
authentication responses differ between "unknown account" and "known
account, wrong credential." An attacker can therefore enumerate valid
usernames cheaply before spending effort on a password attack.
(CWE-203)

**Component C, client-trusted rate-limit identity.** The login
lockout is keyed on a client-supplied header rather than a
server-side source. Rotating the header value resets the lockout,
making a real credential attack against the one seeded account with
a wordlist-recoverable password practical. (CWE-345, CWE-346)

## 9.7 Intended Attack Path

High-level phase outline. Exact requests, values, and commands are
deliberately omitted from this public document.

1. **Reconnaissance**, enumerate the API surface and discover an
   undocumented endpoint that leaks a themed codename.
2. **Username enumeration**, reason about plausible seeded usernames
   from the service context, and confirm a valid one via the
   authentication response discrepancy.
3. **Credential attack**, rotate the client-supplied lockout identity
   header to defeat the login lockout, then perform a wordlist-based
   password search against the confirmed low-privilege account.
4. **Token analysis**, capture a legitimate low-privilege JWT and
   decode its structure to confirm the signing algorithm.
5. **Offline key recovery**, use the codename from step 1 to seed a
   narrow offline mask attack on the captured token. The codename
   reduces the effective keyspace from the full length of the secret
   down to a small set of digit-suffix lengths.
6. **Token forgery**, sign a new JWT with the recovered key and a
   privileged subject. Verify it against a low-impact administrative
   endpoint before proceeding.
7. **Account takeover via legitimate administrative functionality** , 
   use the forged token to invoke the administrative password-reset
   endpoint against the manager-role account.
8. **Objective**, authenticate as the manager account and read the
   protected reporting endpoint.

## 9.8 Impact Assessment

- **Confidentiality:** high, full user enumeration, access to
  manager-only reporting, access to the flag
- **Integrity:** high, arbitrary password reset for any account
- **Availability:** low, no direct denial-of-service path in the
  intended chain
- **Privileges gained:** unauthenticated to manager-level

## 9.9 Flag Retrieval

- **Required condition:** a valid JWT whose subject resolves via the
  database to a user with the manager role, presented to the
  manager-only reporting endpoint.
- **How the vulnerability leads to the flag:** the chain in §9.7 is
  the only path that yields a legitimate manager-role token, because
  the manager account is seeded with an unguessable password, and
  because the role claim in a forged-but-unsigned token is not
  trusted by the server.

## 9.10 Root Cause

- **Component A:** convenience over security, a memorable secret was
  chosen and tied thematically to an internal codename that was
  itself exposed by an endpoint.
- **Component B:** a well-intentioned UX decision, distinguishing
  failure modes to help legitimate users, that leaks account
  existence.
- **Component C:** rate limiting implemented against a
  client-supplied identity without validating that the request
  actually originated from a trusted proxy.

## 9.11 Remediation

- **Component A:** generate a cryptographically random signing secret
  at deployment time (32+ bytes). Validate secret strength at
  application startup. Do not tie secret material to any
  human-readable identifier. Do not expose internal codenames via any
  endpoint, documented or otherwise.
- **Component B:** return an identical error message and status code
  for both failure modes. Ensure comparable response timing between
  the two branches.
- **Component C:** only trust the forwarded-for header when the
  immediate peer is a known, allowlisted proxy. Otherwise, key the
  lockout off the server-observed source address. Prefer a
  maintained rate-limiting library with a proper storage backend over
  a hand-rolled in-process counter.

## 9.12 Verification & Retest

Vulnerable behavior was confirmed during development with a
black-box methodology against a running container. Detailed evidence
,  requests, responses, tool output, is retained by the author.

Post-remediation retest procedure: re-run the lab's automated test
suite after applying the §9.11 fixes. The tests that currently assert
the presence of each intentional weakness should be updated to assert
the fixed behavior instead, and should fail against the vulnerable
build.

## 9.13 Unintended Attack Paths

Several plausible shortcuts were identified during design and
black-box playtesting and were closed before submission. Categories
rather than exact reproductions are listed here.

- **Token payload tampering without re-signing**, not exploitable,
  because role is re-resolved from the database rather than read from
  the token payload.
- **Direct brute force of the privileged accounts**, not practical,
  because the privileged accounts are seeded with long random
  passwords. Only the low-privilege account has a wordlist-recoverable
  password, and that account alone does not grant access to the flag.
- **Signing-secret recovery from the service name alone**, not
  possible; the secret is tied to a separate codename that requires
  active endpoint discovery.
- **Timing-based username enumeration**, mitigated on the "unknown
  account" branch with a dummy password-hash comparison, so that the
  message-based discrepancy is the sole reliable enumeration signal.
- **Narrow API-specific wordlists**, the undiscoverable endpoint is
  intentionally not present in API-specific fuzzing wordlists; a
  broader general-purpose wordlist is required. This is judged
  acceptable and matches the intended reconnaissance difficulty.

## 9.14 Conclusion

ShopVault chains three moderate weaknesses into a complete
unauthenticated-to-manager privilege-escalation path. The challenge
was hardened through live black-box playtesting, with each closed
shortcut backed by an automated regression test. The remaining path
requires genuine reconnaissance, reasoned inference from limited
information, and offline hash-cracking technique, matching the hard
difficulty rating.

The remediation in §9.11 has not been applied to the running
challenge instance (doing so would defeat the challenge). It exists
as guidance for how a production system exhibiting these weaknesses
should be fixed.
