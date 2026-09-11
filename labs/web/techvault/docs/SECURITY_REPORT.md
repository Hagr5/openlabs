# TechVault — Challenge Security Report

**Internal document — Official Solution / Security Report. For
supervisor/evaluator review. Not for player distribution.**

> **Sanitization notice.** This document is intentionally redacted. Exact
> payloads, internal hostnames, account identifiers, fixture filenames,
> and the step-by-step reproduction have been removed so that the
> document can be safely included alongside the lab without disclosing
> the solution. A full unredacted copy is available on request from the
> author.

---

## 9.1 Executive Summary

TechVault is a GraphQL-based laptop e-commerce API built as a training
lab. It demonstrates a three-stage attack chain: an authentication
bypass caused by a type-confusion flaw in a GraphQL input type, an OS
command injection reachable through an incompletely filtered preview
feature, and a blind SSRF in a competitor-pricing feature that reaches
an otherwise-unreachable internal billing service. No single stage
exposes the flag on its own; each stage supplies information or access
the next stage requires. The primary security impact demonstrated is
unauthorized access to an internal-only microservice and the sensitive
data it holds, achieved entirely through the public API surface with no
valid credentials ever provided to the attacker. The learning objective
is to show how individually "minor" weaknesses compound into a serious
breach when trust boundaries between services are not independently
enforced.

## 9.2 Challenge Overview

- **Application functionality:** A GraphQL API (`techvault-api`) serving
  a laptop storefront — authentication, product catalog, a preview
  generation utility, and a competitor price-check utility.
- **Scenario:** See Design Document §3.
- **Primary vulnerability:** Blind SSRF (CWE-918) in a competitor-pricing
  mutation.
- **Secondary vulnerability:** OS Command Injection (CWE-78) in a
  preview-generation mutation, chained with an Authentication Bypass
  (CWE-287/CWE-863) in the login mutation.
- **Difficulty / estimated solve time:** Hard / 90–150 minutes.

## 9.3 Architecture & Trust Boundaries

**Components:**

| Component | Role | Network exposure |
|---|---|---|
| Public GraphQL API | Node.js/Express/Apollo Server | Published on a single host port |
| Internal reconciliation service | Separate Node.js/GraphQL service | Docker-internal network only; no published port |
| Local data store | File-based store for the public API (users, laptops, artifacts, sessions) | Not network-accessible |

**Authentication/authorization:** Session tokens issued on login, passed
via `Authorization: Bearer` header, resolved to a `currentUser` in the
GraphQL context. The internal service has no authentication of its own
— its security model relies entirely on network-level isolation
(Docker `internal: true` network), not application-level auth.

The trust boundary that fails is the assumption that only trusted
internal callers can reach the internal service — enforced solely by
network topology, with no compensating control (e.g. request source
validation) at the public API's outbound-fetch layer.

## 9.4 Attacker Starting Point

See Design Document §4. In summary: unauthenticated, no valid password,
access limited to the public GraphQL endpoint. A valid username is
discoverable in-band through an ordinary public storefront query — no
out-of-band hint is required.

## 9.5 Attack Surface

| Operation | Type | Relevant argument(s) |
|---|---|---|
| A public storefront query | Query | *(unauthenticated)* |
| `login` | Mutation | A structured password input type with multiple optional fields |
| A preview-generation mutation | Mutation | A single URL-like string argument |
| An artifact-retrieval query | Query | An `ID` argument |
| An artifact-list query | Query | An optional `limit` argument |
| A competitor-pricing mutation | Mutation | A single URL-like string argument |
| GraphQL introspection | Query | Schema reflection (enabled; used for recon) |

## 9.6 Vulnerability Description

> **Note for reviewers.** Detailed exploitation primitives, exact
> payloads, and the reproduction sequence are intentionally omitted. The
> descriptions below identify the class of weakness, the failed control,
> and the root cause — enough to assess the lab's design and remediation
> without handing a reader the exploit.

### 9.6.1 Authentication Bypass (login mutation)

- **Type / component:** Type confusion / broken authentication in the
  login resolver.
- **Precondition:** Attacker knows a valid username; no password needed.
- **Failed security control:** A legacy/delegated-login fallback path
  trusts client-supplied fields from the same request as proof of
  identity, without contacting any real identity provider.
- **Root cause:** The fallback was added for backward compatibility and
  never independently verifies identity.

### 9.6.2 Command Injection (preview-generation mutation)

- **Type / component:** OS Command Injection in the preview service.
- **Precondition:** Valid session (any authenticated user).
- **Failed security control:** A user-supplied value is interpolated
  into a shell command string. A denylist blocks common separators and a
  few literal command names, but does not account for alternative shell
  syntaxes.
- **Root cause:** Input is filtered against a fixed set of known-bad
  patterns instead of being passed as a properly isolated argument to a
  fixed program.

### 9.6.3 Blind SSRF (competitor-pricing mutation)

- **Type / component:** Server-Side Request Forgery in the
  competitor-price service.
- **Precondition:** Knowledge of an internal hostname (obtained via the
  command-injection stage).
- **Failed security control:** The user-supplied target is fetched
  server-side with no allow-list on host, scheme, or IP range (no
  rejection of private/internal address space or internal DNS
  suffixes).
- **Root cause:** The feature assumes the target will always be an
  external competitor URL and never validates that assumption before
  issuing the request.

## 9.7 Intended Attack Path

> **Note for reviewers.** The full step-by-step reproduction is
> intentionally omitted from this document. See Design Document §5 for
> the three-stage high-level summary; a full unredacted walkthrough is
> available on request from the author.

## 9.8 Impact Assessment

- **Confidentiality:** High. An unauthenticated attacker ultimately
  reads internal billing-account data from a service never intended to
  be reachable externally.
- **Integrity:** Limited in this challenge's scope — the demonstrated
  path is read-only against the internal service. In a real deployment,
  the same SSRF primitive could be used against internal services that
  accept state-changing requests (not modeled here, to keep the chain
  focused).
- **Availability:** Not demonstrated; out of scope for this challenge.
- **Privileges/data/functionality gained:** Authenticated session
  (without valid credentials) → arbitrary command execution inside the
  public API container (as an unprivileged user) → network-level access
  to an internal-only microservice and its data.

## 9.9 Flag Retrieval

- **Required condition:** A record in the artifact store must exist
  whose content was populated via the SSRF side-effect — i.e. the
  intended chain was followed through to a successful internal request
  against the reconciliation service for the correct account. The
  player then retrieves it via the artifact-retrieval query while
  authenticated as its owning session.
- **How the vulnerability leads to the flag:** The flag is embedded in
  the internal service's seed data and is only reachable by a request
  originating from inside the Docker internal network — which only the
  public API's SSRF-vulnerable resolver can produce, using the exact
  host and account reference disclosed via the command-injection stage.
- **Evidence of successful exploitation:** The local validation script
  confirms the flag is retrievable only through the full intended path
  (validated end-to-end, 24/24 automated checks passing after
  implementation).

## 9.10 Root Cause

Although the three vulnerabilities are different, they share a similar
underlying problem: the application trusts values controlled by the
attacker when making security-sensitive decisions — a client-supplied
field standing in for real credential verification, a denylist standing
in for proper argument isolation, and network topology alone standing in
for request-destination validation. Each control looked sufficient on
its own, but none of them were checked against someone actively trying
to break them.

## 9.11 Remediation

| Vulnerability | Recommended fix |
|---|---|
| Auth bypass | Remove the delegated/SSO fallback entirely, or require a real signed assertion from an actual IdP verified via signature/JWKS — never accept client-echoed `username` as proof of identity. |
| Command injection | Never interpolate user input into a shell string. Use `execFile` with the target binary and an argument array (no shell), or better, replace the shell-based preview tool with a library call that has no OS command surface at all. |
| Blind SSRF | Enforce a strict allow-list of destination hosts/schemes. Resolve and validate the destination IP is not in private/internal ranges before connecting, and re-validate after any redirect. Network segmentation should be a defense-in-depth layer, not the only control. |

## 9.12 Verification & Retest

The full validation script (24 assertions) doubles as the regression
suite. Any fix should make the corresponding assertion fail as
described below while all unrelated assertions continue to pass.

| Vulnerability | Vulnerable behavior | Expected secure behavior post-fix |
|---|---|---|
| Auth bypass | A login request omitting the password field returns a valid token | Request is rejected with a generic auth error |
| Command injection | A crafted preview input executes a substituted command | Input is passed as an inert string; no shell evaluation occurs |
| Blind SSRF | A request targeting an internal/private host succeeds | Request to an internal/private host is rejected before any network call is made |

## 9.13 Unintended Attack Paths

Two issues were identified and corrected during implementation and
playtesting, before finalizing this document:

1. **Artifact ordering under timestamp collision.** The artifact store
   used a second-resolution timestamp for ordering; rapid sequential
   requests could produce identical timestamps, causing the most recent
   artifact to be incorrectly excluded from a limited result set — which
   could make flag retrieval appear non-deterministic. **Fixed** by
   adding a monotonic secondary sort key.
2. **Directory-structure ambiguity (non-security).** An early build had
   the application source double-nested due to a Docker `COPY` layering
   choice, alongside a same-named but unrelated directory used only for
   the local data store. While not independently exploitable, this
   created confusing exploration during manual playtesting and risked
   violating "Minimal Noise." **Fixed** by flattening the container's
   directory layout and relocating fixture files to a distinctly named
   directory.

No alternate flag-retrieval paths were identified during the documented
testing (e.g., IDOR on the artifact-retrieval query, direct
reachability of the internal service, or SQL injection) — each of these
was specifically tested for during validation.

One intentional design accommodation was added post-playtesting and is
documented and justified in the Design Document §7: an optional `note`
field on the competitor-price result type, added to preserve Solvability
without weakening the blind nature of the SSRF.

## 9.14 Conclusion

This challenge demonstrates that authentication logic, input filtering,
and server-side request handling must each independently resist
adversarial input — a weakness in any one of the three, even when the
others are individually reasonable, can combine into a full compromise
of an internal trust boundary. The exploitation outcome (unauthorized
read access to internal billing data via a fully unauthenticated
starting point) was reproduced consistently across a clean rebuild and
validated with 24 automated end-to-end assertions. The main limitation
of this challenge is scope: the SSRF primitive is demonstrated only
against a read-only internal query, and the command-injection primitive
is demonstrated only for information disclosure, not for further lateral
movement — both intentional scoping decisions to keep the chain focused
and the noise minimal, per task requirements.
