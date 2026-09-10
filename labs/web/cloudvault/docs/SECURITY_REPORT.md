# cloudvault security report

## 9.1 Executive summary

CloudVault is a document-ingestion platform whose GraphQL API accepts external URLs for import. An authenticated low-privileged user can chain six weaknesses to reach a protected internal vault entry and read the flag.

Primary vulnerability: SSRF through the platform's fetch feature.

Impact: full compromise of the internal service mesh, including read access to privileged vault entries.

Learning objective: trust-boundary reasoning across a multi-service architecture.

## 9.2 Challenge overview

- Application: document-ingestion platform with a GraphQL API
- Scenario: a seeded user can submit URLs for import
- Primary vulnerability: SSRF (V2)
- Secondary vulnerabilities: V1, V3, V4, V5, V6
- Difficulty: hard
- Estimated solve time: 45 to 75 minutes for a competent player

## 9.3 Architecture and trust boundaries

Five Docker services on two networks. Only cloudvault-api publishes a host port (8080). The worker, metadata service, sample library, and vault API are reachable only from the internal network.

Authentication uses JWTs for player sessions and a shared secret for API-to-worker calls. Authorization for vault access uses Bearer tokens plus a role claim.

Trust boundaries:

1. Player to cloudvault-api.
2. cloudvault-api to import-worker. Shared secret.
3. import-worker to metadata-service, sample-library, internal-vault-api. Network segment.
4. internal-vault-api to vault data. Bearer token plus role check.

## 9.4 Attacker starting point

- Credentials: player / changeme123
- Role: low-privileged player
- Network access: port 8080 only
- Restrictions: cannot reach internal services directly

## 9.5 Attack surface

- GraphQL endpoint: POST /graphql
- Queries: viewer, jobs, importJob, serviceStatus
- Mutations: login, createImport, updateImport, executeImport, cancelImport
- Internal services: reachable only through the worker's outbound fetch

## 9.6 Vulnerability description

Type: server-side request forgery with a multi-step escalation chain.

Root cause: the worker fetches player-supplied URLs without re-validating redirect destinations. An internal service trusts network origin alone. A vault endpoint trusts a client-supplied role instead of binding it to the authenticated token.

Preconditions: one valid player account. No other access required.

## 9.7 Intended attack path

1. Authenticate as player.
2. List import jobs. Note the seeded demo job.
3. Execute the job. The worker follows a redirect to the metadata service and returns a synthetic worker credential.
4. Use the credential to call the vault assume-worker endpoint with an escalated role.
5. Receive a privileged session.
6. Read the protected vault entry and retrieve the flag.

## 9.8 Impact assessment

- Confidentiality: read access to internal service responses and to the protected vault entry.
- Integrity: arbitrary POST requests can be crafted to internal services.
- Availability: not directly affected.
- Privilege gained: from low-privileged player to vault admin role.

## 9.9 Flag retrieval

The flag is the value field of a protected vault entry. Reaching it requires a session whose role matches that entry's required role. The legitimate worker credential does not hold that role. Only the escalation flaw grants it.

## 9.10 Root cause

Three distinct trust failures compound:

1. Validation versus execution mismatch. The initial URL is validated, the redirect target is not.
2. Network location as identity. The metadata service answers any internal caller.
3. Client-controlled authorization. The vault trusts the requested role instead of deriving it from the token.

## 9.11 Remediation

See REMEDIATION.md.

## 9.12 Verification and retest

Vulnerable behaviour: authenticated requests through the chain reach the vault. Unauthenticated direct requests to internal services fail.

Expected secure behaviour: redirect destinations are re-validated. Roles are bound to tokens. The metadata service authenticates callers.

Retest: run pytest tests/ from the lab directory. Run python3 scripts/validate.py from the repository root.

Regression: each service ships unit tests that lock the individual fixes.

## 9.13 Unintended attack paths

One was found and closed during development. The vault session token was originally unsigned base64, which allowed a player to forge an admin session and skip V5 and V6. The session is now HMAC-SHA256 signed. A regression test confirms forged and tampered sessions are rejected.

No other unintended paths were found.

## 9.14 Conclusion

CloudVault shows that trust-boundary errors compound. Each individual flaw is plausible in isolation. Together they allow a low-privileged user to reach a privileged internal resource. The lab teaches players to reason about where validation stops and execution begins, and about the difference between authentication and authorization.
