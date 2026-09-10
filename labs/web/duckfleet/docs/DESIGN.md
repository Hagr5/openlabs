# DuckFleet — Design Notes

Internal document describing the architecture, trust boundaries, and the
intended solution path of the DuckFleet training deployment.

## 1. Architecture

Two services on one compose network (`duckfleet`):

```
browser ──HTTP/1.1──> gateway:4000 ──gRPC (h2c)──> backend:50051
  SPA                    Express +            grpc-js services
  (static)               gRPC-Web bridge      SQLite at /data
```

- **gateway** (published `4000:4000`): serves the static console at `/`,
  exposes the gRPC-Web bridge at `POST /api/grpc/<package.Service>/<Method>`,
  and answers `GET /healthz` by probing backend health. It holds no
  credentials and performs no authorization of its own — it forwards caller
  headers as gRPC metadata.
- **backend** (no published ports): grpc-js server on `:50051` with
  `auth.AuthService`, `fleet.FleetService`, `events.EventService`,
  `admin.AdminService`, `grpc.health.v1.Health`, and
  `grpc.reflection.v1alpha.ServerReflection`. SQLite lives at `/data`
  (named volume `backend-data`); the file is created and seeded on first boot.

Both images are built offline-safe: all npm dependencies are installed at
build time, and the reflection descriptor set is compiled with `protoc`
during the backend build.

## 2. Trust boundaries (as designed vs as built)

| Boundary | Design intent | As built |
|---|---|---|
| Edge → gateway | TLS + WAF strip internal headers | Lab runs plain HTTP; nothing strips headers |
| Gateway → backend | Gateway authenticates callers, backend trusts gateway network | Backend authenticates bearer JWTs itself, but trusts **any** `x-internal-call` metadata value, which the gateway forwards verbatim from the client |
| Reflection | Disabled outside dev | Enabled on the backend and reachable through the bridge |
| Token issuance | Reachable only by internal schedulers | Exposed on the same gRPC server as everything else |

The intended lesson: authorization decisions must be made on verified caller
identity (the JWT), never on network location or on client-supplied metadata.

## 3. Authorization matrix (implemented)

| Method | Requires | Behavior |
|---|---|---|
| `auth.AuthService/Login` | nothing | `USER` JWT on valid creds; 5 failures → 10 min lockout; generic `INVALID_CREDENTIALS` |
| `auth.AuthService/WhoAmI`, `fleet.*` | valid JWT | any role |
| `events.EventService/Subscribe` | valid JWT | FLEET always served; AUDIT/AUTH requested **without** `x-internal-call: true` → silently downgraded to FLEET-only (`x-acl: public`); with the header → requested categories (`x-acl: internal`) |
| `admin.AdminService/IssueToken` | valid JWT + `x-internal-call: true` | mints a JWT for the `user_id` in the request, role resolved from the DB — **the flaw**: no entitlement check binds caller to subject |
| `admin.AdminService/GetFlag` | valid JWT with `role=ADMIN` | returns `FLAG` env; anything else → `7 ADMIN_ROLE_REQUIRED`; identity comes only from the verified token |
| reflection / health | nothing | full schema / SERVING |

`GetFlag` ignores `x-user-id` and friends entirely. `IssueToken` takes no role
input — minting for your own id yields another `USER` token, which keeps the
sanity-check step honest. Unknown `user_id` → `3 USER_NOT_FOUND`.

## 4. Event emitter

- Every 10 s: `fleet_heartbeat` (FLEET), JSON payload with tick/vehicle count;
  vehicle statuses rotate deterministically so polling clients see movement.
- Every 30 s: audit cycle — `SessionAudit` entries for the routing and
  maintenance service accounts, one for `ops-admin@duckurity.example`
  (`KEY_ROTATION_REMINDER`, carrying the admin's user id), one AUTH-category
  scheduler refresh, and a `TokenIssuedAudit{issued_for: "svc-scheduler",
  scope: "fleet:write"}` record that carries **no token value**.
- No replay: subscribers only see events emitted after they connect. Streams
  are capped at 5 minutes server-side.

## 5. Attack surface

- `GET /`, static console (bundles public `auth`+`fleet` descriptors only).
- `POST /api/grpc/*` — raw frame bridge, binary and base64-text modes,
  unary + server-streaming + single-request bidi (reflection).
- `GET /healthz` — gateway + backend health.
- Everything else is closed: no JSON transcoding, no debug endpoints, no
  stack traces, parameterized SQL throughout, HS256 JWTs with explicit
  algorithm check and 2 h expiry, lockouts on login.

## 6. Intended solution path

1. Observe the console's gRPC-Web traffic (`/api/grpc/auth.AuthService/Login`).
2. Replay as the dispatcher → `USER` JWT; `WhoAmI` confirms the role.
3. Drive `ServerReflectionInfo` through the bridge: `list_services`, then
   `file_containing_symbol` per service → recover `events` + `admin`.
4. `GetFlag` as USER → `7` (correct gate, dead end).
5. `Subscribe{AUDIT,AUTH}` as USER → `200 OK`, `x-acl: public`, heartbeats only.
6. Resend with `x-internal-call: true` → `x-acl: internal`, audit feed
   arrives; decode a `SessionAudit` payload → admin user id.
7. `IssueToken{own id}` + header → `USER` token (confirms arbitrary minting).
8. `IssueToken{admin id}` + header → `ADMIN` JWT.
9. `GetFlag` with the admin JWT → `DUCK{...}`.

`solve.py` automates exactly this. `tests/validate.mjs` asserts every stage,
plus the dead ends (spoofed `x-user-id`, `alg:none`, bad signature), plus
reset determinism.

## 7. Reset plan

State lives in two places: the SQLite file and the session secret, both in
the `backend-data` volume. `docker compose down -v && docker compose up -d`
drops the volume; first boot reseeds fixed UUIDs/users/vehicles and mints a
fresh session secret (or reuses `SESSION_SECRET` from `.env`). The `FLAG`
value always comes from the operator's environment.
