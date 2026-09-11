# DuckMarket — Remediation Plan

## Root cause

The Functions pilot entitlement (`platform/src/lib/entitlements.js`) is enforced on **direct invocation only**. Four other paths that lead to the same capability — function creation, staged package upload/provisioning, webhook function destinations, and event-triggered execution — were shipped without it. This is a Broken Function Level Authorization (BFLA) inconsistency: the capability "execute code in the managed runtime" is guarded on exactly one of five paths.

The check that exists and works (as designed) in `invokeFunction`:

```js
// platform/src/graphql/resolvers.js (invokeFunction)
if (!entitlements.hasFunctionsEntitlement(user)) {
  return {
    invocation: null,
    userErrors: [{
      message: "FORBIDDEN: invoking account functions requires the Functions pilot entitlement",
      path: ["id"],
    }],
  };
}
```

Nothing analogous exists in `createAccountFunction`, `routes/stagedUpload.js`, `createAccountWebhookConfiguration`, or `lib/events.js`.

## Fix 1 — enforce the entitlement on every function-lifecycle path

Apply the identical check wherever a Functions-pilot capability is reached:

```js
// createAccountFunction (resolvers.js)
if (!entitlements.hasFunctionsEntitlement(user)) {
  return { accountFunction: null, userErrors: [{
    message: "FORBIDDEN: creating account functions requires the Functions pilot entitlement",
    path: ["name"],
  }]};
}

// createAccountWebhookConfiguration when destination.functionId is set
if (destination.functionId && !entitlements.hasFunctionsEntitlement(user)) {
  return { webhookConfiguration: null, userErrors: [{
    message: "FORBIDDEN: function destinations require the Functions pilot entitlement",
    path: ["destination", "functionId"],
  }]};
}

// staged upload route — resolve the function record first, then check
// the *owner account's* entitlement before accepting bytes or provisioning.
```

The staged-upload route is unauthenticated with respect to the function owner (it is token-validated), so the entitlement must be checked against the owning account at upload time, before provisioning is initiated.

## Fix 2 — enforce the entitlement in the event pipeline (defense in depth)

`lib/events.js` dispatches to any READY function destination without consulting entitlements. Even with Fix 1, an entitlement revoked *after* a webhook was configured would still execute. The dispatcher must re-check the destination function's account entitlement at dispatch time — and, if the account is no longer entitled, mark the webhook INACTIVE rather than execute.

## Fix 3 — restrict the preview endpoint to entitled roles (reduces exposure)

`/api/graphql/preview` is session-authenticated but open to every account. The Functions preview types should be behind the entitlement as well (either a separate endpoint for entitled accounts, or schema visibility rules), so that standard accounts cannot even reach the pilot mutations. This converts the flaw from "missing check in a mutation" to "whole surface is role-gated," which is easier to keep consistent.

## Fix 4 — runtime hardening (limits blast radius, not a fix for the authz bug)

The managed runtime is the intended place for customer code, but it should assume that code is hostile:

- **Egress blocked by default**: no network access from `fn-runtime` (currently the compose network allows it). Customer code does not need it; blocking it prevents the runtime being used as an SSRF pivot.
- **Metadata/credential isolation**: the runtime must hold no shared keys in the environment visible to spawned processes. The platform-runtime shared key lives only in the parent process; verify spawned children cannot read it (it is currently not passed to the child env, keep it that way and add a regression test).
- **Resource caps**: CPU/memory ulimits per invocation (currently only wall-clock 5s is enforced).
- **Filesystem scope**: the per-function directory is the only writable path; the flag-file pattern demonstrates why runtime-resident secrets must be minimized — a real deployment should hold *no* secrets in this tier.

## Fix 5 — regression tests

Add authorization-matrix tests covering **every** capability path against both a standard user and an entitled user:

| Path | Standard user (expected) | Entitled user (expected) |
|---|---|---|
| `createAccountFunction` | FORBIDDEN userError | success |
| staged upload PUT | 403 FORBIDDEN | 202 |
| provisioning result | FAILED/not started | READY |
| `invokeFunction` | FORBIDDEN (already enforced) | success |
| `createAccountWebhookConfiguration` w/ function destination | FORBIDDEN | success |
| USER_CHANGED → function execution | not executed | executed |

The key property: **no single mutation of this table should be able to regress one cell without a test failing.** The existing suite (`tests/validate.mjs`) encodes the *current* (vulnerable) matrix intentionally for the lab; a remediated build must flip the expected values for standard users and add the staged-upload 403 case.

## Fix 6 — process lessons

- The entitlement helper was treated as an *endpoint* concern rather than a *capability* concern. Centralize "can this account execute functions" and call it from every code path that leads to execution — creation, upload, binding, dispatch, direct invoke.
- Schema reviews for preview APIs should include an authorization matrix per mutation, not just per endpoint.
- Event-driven pipelines inherit authorization decisions from *when the binding was created*, not from *when the event fires*. Re-check at dispatch.

## Verification

1. Apply Fixes 1–3.
2. Flip `tests/validate.mjs` expectations for standard users (create → FORBIDDEN, upload → 403, webhook function destination → FORBIDDEN, event → no invocation).
3. Confirm the admin (entitled) path still passes end-to-end.
4. Confirm no other behavior regressed: BOLA checks, lockout, CSRF, zip-slip, catalog.
