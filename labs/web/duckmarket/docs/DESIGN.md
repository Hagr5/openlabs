# DuckMarket — Design Document

*Internal build notes for the Duckurity platform lab. This document describes architecture, trust boundaries and operations. It is not part of the player experience.*

## 1. Metadata

| Item | Value |
|---|---|
| Challenge | DuckMarket (Functions Preview) |
| Class | Broken Function Level Authorization (BFLA / OWASP API6:2023) |
| Difficulty | Medium-Hard |
| Solve estimate | 2–3 hours |
| Flag format | `DUCK{...}` |
| Flag location | `/flag.txt` inside the `fn-runtime` container only |
| Flag injection | `FLAG` env var → entrypoint writes `/flag.txt` (owner `sbx_duck1051`, mode 0400) → env var scrubbed before the server starts |

## 2. Architecture

```
                       ┌──────────────────────────────────────────┐
 player ──HTTP:4000──▶│  platform (Node 20 / Express + Apollo 4)  │
                       │   ├─ REST: /api/auth, /api/account/v2,   │
                       │   │         /api/catalog, /api/healthz,   │
                       │   │         /api/file-management/staged  │
                       │   ├─ GraphQL: /api/graphql/preview        │
                       │   └─ SQLite (/data volume)                │
                       └───────────────┬──────────────────────────┘
                                       │ internal compose network
                                       │ (shared-key authenticated)
                       ┌───────────────▼──────────────────────────┐
                       │  fn-runtime (Node 20, no published ports) │
                       │   ├─ /v1/provision  (validate + extract)  │
                       │   ├─ /v1/execute    (spawn sandboxed node)│
                       │   ├─ /flag.txt     (the secret)           │
                       │   └─ /packages volume (uploaded code)      │
                       └──────────────────────────────────────────┘
```

- **platform** — the whole user-facing product: storefront SPA, session auth, profile REST API, catalog, and the Functions-preview GraphQL API. It owns the database and mediates every interaction with the runtime.
- **fn-runtime** — the managed `nodejs22.x` execution environment. Reachable only from `platform` over the compose network. It is never exposed to players directly (no published ports).

## 3. Trust boundaries

1. **Player → platform** (HTTP, port 4000): session-cookie authenticated, CSRF-protected for mutations. Standard users are `ROLE_USER`; internal operators are `ROLE_ADMIN`.
2. **platform → fn-runtime** (internal network, port 8081): service-to-service only, guarded by a shared key header. Players never talk to this service directly.
3. **fn-runtime → uploaded code**: uploaded packages run as the unprivileged `sbx_duck1051` user in a per-function directory, with a 5-second execution timeout and log caps. The runtime holds no secrets other than the flag file, and has no network egress needs.

## 4. Data model

- `users` — id (fixed UUIDs), email, bcrypt password hash, profile fields, `ROLE_USER`/`ROLE_ADMIN`
- `functions` — per-account serverless functions (name, status, runtime, upload token, main entry)
- `staged_uploads` — one-time tokens bridging function creation to the ZIP PUT endpoint
- `webhook_configurations` — USER/CHANGED subscriptions with optional function destinations
- `function_invocations` — execution records with timestamped logs
- `products` — storefront catalog seed rows

Seeded identities (deterministic across resets):

| Identity | UUID | Role |
|---|---|---|
| Daffy Dumas (`daffy@duckurity.example` / `DuckSeason2024!`) | `9b7f8a2c-0c7f-4bfa-9d14-ea5ee07d5b3c` | ROLE_USER |
| Opal Oversight (`ops@duckurity.example`, random password) | `4f22a649-92c2-4d64-9d55-9ce8a8ba6b02` | ROLE_ADMIN |

The admin password is generated at boot from `SEED_ADMIN_PASSWORD` (test environments) or a random 24-byte value (player environments) — never exposed through any API.

## 5. Attack surface (player-visible)

| Surface | Auth | Notes |
|---|---|---|
| Storefront SPA | public | static; the JS bundle contains the full API endpoint map |
| `GET /api/catalog/products` | public | seeded catalog |
| `GET /api/healthz` | public | DB + runtime health |
| `POST /api/auth/login` / `logout` | public | session + CSRF cookie issuance; lockout after 5 failures |
| `GET/PUT /api/account/v2/users/{uuid}` | session | own-profile or admin only (BOLA enforced) |
| `PUT /api/file-management/staged/{token}` | session + valid staging token | ZIP only, ≤5MB |
| `POST /api/graphql/preview` | session | Functions preview: functions, webhooks, invocation |
| `GET /api/graphql/preview` | session | minimal interactive console (dev convenience) |

Everything else is 404 or internal.

## 6. The intentional flaw ( spoiler — the one deliberate bug)

**Inconsistent enforcement of the Functions pilot entitlement across equivalent execution paths.**

The Functions pilot is restricted to entitled accounts (admins + pilot partners). The entitlement check (`lib/entitlements.js`) exists and is applied on the highest-risk path — **direct invocation** (`invokeFunction`) — where standard users correctly receive `FORBIDDEN: invoking account functions requires the Functions pilot entitlement`.

Three other paths were shipped by the integrations team **without** the same check:

1. `createAccountFunction` — any authenticated user can register a function
2. staged ZIP upload + provisioning — any function owner can deploy arbitrary code
3. webhook function destinations + USER_CHANGED event dispatch — any user can bind their function to a profile-change event and have the platform execute it for them

The chain gives a standard user full server-side code execution inside the managed runtime; command output (including `/flag.txt`) is returned through `lastInvocation.logs`.

**This is the only intentional vulnerability.** Every other surface uses parameterized SQL, token-validated uploads, zip-slip-safe extraction, session cookies with CSRF double-submit, per-account lockout, generic error masking, and BOLA checks on profile/function access. Webhook destinations accept function IDs only (HTTP URL destinations are rejected — no SSRF surface).

### The recon hint

The storefront bundle (`platform/public/assets/app.js`) contains an `API_CONFIG` object with `integrations.previewEndpoint: "/api/graphql/preview"` — an ordinary-looking leftover for an unshipped feature. It is not linked anywhere in the UI, not mentioned in the README, and is the intended discovery vector.

## 7. Intended solution path

1. Sign in as the documented standard user; capture `SESSIONID` + `XSRF-TOKEN`.
2. Read the storefront JS bundle; find the preview endpoint in `API_CONFIG`.
3. Introspect `/api/graphql/preview`; discover functions, staging upload, invocation, webhook types.
4. `createAccountFunction` → id + `StagedFile.uploadLink`.
5. Build a ZIP (`package.json` + `index.js` exporting `handler`) that runs `execSync("whoami")` and `execSync("cat /flag.txt")`, logging both; PUT it to the upload link.
6. Poll `function(id)` until `READY` / `runtime: "nodejs22.x"`.
7. `invokeFunction` → **FORBIDDEN** (the dead end that teaches the lesson).
8. `createAccountWebhookConfiguration` with `{ USER, [CHANGED], destination: { functionId } }` → ACTIVE.
9. `PUT /api/account/v2/users/{uuid}` on your own profile → USER_CHANGED event (~1s).
10. Poll `function(id).lastInvocation` → logs contain `sbx_duck1051` and the flag.

`solution/solve.py` automates 1–10; `solution/OFFICIAL_SOLUTION.md` documents it as a disclosure report.

## 8. Non-goals / hardening that is NOT the bug

The managed runtime executing uploaded code with only basic sandboxing is the **feature**, not the flaw. Players cannot escape the container; they can only run code *inside* the runtime as `sbx_duck1051` (which is the intended objective). If a solve attempt tries to break out of the container, attack the Docker host, or read the flag from anywhere other than a runtime execution, it is off the intended path.

## 9. Reset plan

- All user-created state lives in SQLite (`/data` volume) and the packages volume; both are removed by `docker compose down -v`.
- Sessions are in-memory and die with the platform container.
- `seed.js` is idempotent: it only inserts when the DB is empty, and all identifiers are fixed — a reset restores the exact initial state.
- The flag is re-materialized at every `fn-runtime` boot from the `FLAG` env var, then scrubbed from the environment.

## 10. Operational knobs

| Knob | Default | Where |
|---|---|---|
| `FLAG` | `DUCK{local_dev_placeholder}` | `.env` |
| `SESSION_SECRET` | dev fallback | `.env` |
| `FUNCTION_RUNTIME_SHARED_KEY` | dev fallback | `.env` |
| `SEED_ADMIN_PASSWORD` | random | platform env (test harness only) |
| Max functions / webhooks per account | 10 / 10 | `src/config.js` quotas |
| ZIP size cap | 5 MB | config |
| Execution timeout | 5 s | executor |
| Session TTL | 2 h | config |
| Login lockout | 5 failures / 10 min | config |

## 11. Difficulty knobs (maintainer-only)

- **Easier:** pre-load the GraphQL console's default query with a sample `createAccountFunction` mutation.
- **Harder:** remove `previewEndpoint` from the storefront bundle and require content/endpoint discovery by other means.
