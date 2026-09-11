# DuckFleet — Remediation

## Root causes

1. **Client-controlled metadata treated as authority.** The backend grants the
   internal event feed and the token-issuance capability on the strength of
   `x-internal-call: true` metadata. The gateway forwards arbitrary `x-*`
   request headers as metadata, so any caller can assert internal status. This
   is the single primary defect behind both the streaming and the method
   authorization failures.
2. **Missing entitlement check on `IssueToken`.** Even for genuine internal
   callers, the method mints a session for an arbitrary `user_id` with no
   check that the caller may act for that subject. It should either be
   restricted to a scheduler identity with an explicit allow-list, or removed
   in favor of a proper login/impersonation flow with audit.
3. **Silent downgrade instead of fail-closed.** `Subscribe` reduces the
   requested categories without telling the caller (except for the `x-acl`
   header). Fail closed: reject unauthorized category requests with
   `PERMISSION_DENIED` so entitlement gaps are visible in logs and tests.
4. **Reflection enabled on an externally reachable server.** Full
   `FileDescriptorProto` disclosure handed over the internal schema,
   including method and field names that made the rest of the chain
   scriptable in minutes.

## Fixes

- **Gateway**: strip all `x-internal-*` headers (deny-list) — better, only
  forward an explicit allow-list (`authorization`, tracing headers). Set
  internal metadata itself when the gateway has authenticated an internal
  client; never accept it from the edge. Document the header contract between
  gateway and backend and test it.
- **Backend**: derive every authorization decision from the verified JWT
  (`sub`, `role`) and, where needed, a server-side entitlement table.
  `IssueToken` must require an admin role *and* an explicit delegation grant
  for the target subject; log every issuance with caller, subject, and scope.
- **Streaming authz**: evaluate requested categories against entitlements up
  front; return `PERMISSION_DENIED` naming the denied category instead of
  downgrading.
- **Reflection**: disable server reflection in any externally reachable
  deployment (environment flag, default off); keep it only in dev, where it
  should still require authentication.
- **Defense in depth**: separate the internal scheduler API onto its own
  listener that is not routed by the edge gateway at all; give service
  accounts distinct credential types that cannot mint user sessions.

## Regression tests (add to `tests/validate.mjs` style suite)

- `Subscribe{AUDIT}` without entitlement → `7`, and no `x-acl: internal`
  ever appears for non-internal callers.
- `IssueToken` for another subject as USER → `7`, even with internal headers.
- Reflection disabled externally: `list_services` through the bridge → `12`
  or empty; descriptors for `admin`/`events` unrecoverable.
- Header contract: `x-internal-call` sent by the client never reaches the
  backend as metadata (assert at the gateway layer with a metadata echo
  probe in staging).
- Existing dead ends stay dead: USER `GetFlag` → `7`, forged JWTs → `16`,
  lockout after 5 bad logins.
