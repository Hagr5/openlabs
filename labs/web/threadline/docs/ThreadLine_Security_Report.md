# ThreadLine — Challenge Security Report

**Challenge name:** ThreadLine
**Author:** Hagar Sherif
**Classification:** Internal / CTF infrastructure only — contains
vulnerability details and the intended solution. Do not distribute to
players.

> **Sanitization notice.** This document is intentionally redacted. Exact
> payloads, internal hostnames, account identifiers, coupon codes, and
> the step-by-step reproduction have been removed so that the document
> can be safely included alongside the lab without disclosing the
> solution. A full unredacted copy is available on request from the
> author.

---

## 9.1 Executive Summary

### Challenge Overview

ThreadLine is a small e-commerce REST API where a low-privilege,
authenticated customer ends up buying a premium product for free.
Getting there means chaining a Broken Object Level Authorization
(BOLA/IDOR) bug together with two business-logic mistakes in the coupon
system — nothing here needs SQL injection or anything exotic; the
challenge is really about the app trusting things it shouldn't.

### Primary Vulnerability

The user-object endpoint hands back any user's profile — including their
email — to whoever is logged in, regardless of whether they own that
account. There is no ownership check after authentication, only an
ID lookup.

### Secondary Vulnerability (Chained)

Two things compound the problem in the coupon flow:

- The coupon-creation endpoint decides eligibility by comparing only a
  short prefix of the email's local part instead of the full address.
- The apply-coupon endpoint never caps how many coupons a single order
  can absorb.

### Security Impact

On its own, the BOLA bug is a straightforward information-disclosure
issue — it leaks another customer's email. The interesting part is what
that email unlocks: once you have it, the loose prefix matching lets you
mint far more coupons than intended, and with no stacking limit in
place, those coupons combine to wipe out the price of a high-value item
entirely.

### Learning Objective

This challenge is meant to hammer home two related lessons: object
identifiers in a URL are not an access-control mechanism, and "small"
business-logic assumptions (like assuming an email match is exact, or
that nobody would apply many coupons at once) can be just as dangerous
as a textbook auth bug once they are chained together.

## 9.2 Challenge Overview

### Application Functionality

ThreadLine is a JSON-only REST API for a clothing store — no frontend at
all. It covers registration/login (cookie session), a product catalog,
per-user carts, an email-linked loyalty coupon system, and order
creation.

State lives in a local file-based database mounted on tmpfs, wiped and
reseeded on every container restart, so every test run starts from the
same known point.

### Scenario

The player registers a normal customer account — nothing special about
it. The store sells a high-priced product, and since there is no payment
or balance system at all, the only way to legitimately bring the price
down is through discounts.

Somewhere in the seed data there is a second account with a valid
loyalty offer tied to its exact email address. The player does not know
that email, that account's ID, or even that the offer exists going in —
finding it is part of the challenge.

### Primary and Secondary Vulnerabilities

- **Primary:** Broken Object Level Authorization (BOLA/IDOR)
- **Secondary:** Business logic flaw in the coupon system

The BOLA leak hands the attacker information they shouldn't have; the
coupon logic then lets that information be abused far beyond what a
single legitimate coupon should allow.

### Difficulty and Estimated Solve Time

**Difficulty:** Medium
**Estimated solve time:** 30–60 minutes for someone comfortable with raw
HTTP tooling and basic IDOR concepts.

The BOLA step is quick to spot once you start enumerating IDs. The
coupon step takes a bit more patience — you have to actually notice the
matching is loose rather than assume it's exact, then work out that
stacking isn't capped. It's a satisfying "wait, it let me do that
again?" moment without needing any specialized tooling or crypto
knowledge.

## 9.3 Architecture & Trust Boundaries

### Components

- **REST API application** — served via Gunicorn (2 workers, 4 threads
  each).
- **SQLite database** — file-based, mounted on tmpfs, deleted and
  reseeded on every container start.
- **Docker container** — hardened: non-root user, `cap_drop: ALL`,
  `no-new-privileges`, read-only root filesystem, internal-only Docker
  network, resource limits applied.

### Authentication / Authorization

Sessions are token-based: after login, the server generates a random
token, stores it in an `HttpOnly` cookie, and links it to the user via
a sessions table. Worth noting — the token has nothing to do with the
user ID, so there is no shortcut there; guessing or changing a user ID
doesn't touch authentication at all.

Passwords are hashed before storage, but that is not part of the
intended attack surface.

The real gap is authorization, not authentication: the auth middleware
only confirms *someone* is logged in — it never checks whether the
requested resource actually belongs to them. The same "trust the
client" pattern shows up again in the coupon endpoint (weak email
validation) and the cart logic (no coupon-count cap).

### Data Flow and Trust Boundaries

The trust boundary that matters here is client ↔ REST API. Anything the
client sends — user IDs, emails, coupon codes — has to be treated as
untrusted.

No external services are involved — everything is local, and the Docker
network has no outbound access. The trust boundary sits right at the API
layer: everything past that line (client input) is untrusted until
proven otherwise.

## 9.4 Attacker Starting Point

- **Testing model:** Black-box. The player has no access to source code,
  database schema, or API documentation. Only the base URL and a
  registered customer account are available — every endpoint, parameter,
  and behavior must be discovered through direct interaction with the
  running API.
- **Initial access:** Unauthenticated, base URL under `/api/v1`.
- **Credentials:** None provided. The player registers their own account
  via the registration endpoint.
- **Role / privileges:** A plain customer account — the same permissions
  as any other player. There is no admin path and no privileged
  shortcut.
- **Known information:** Just the base URL and the fact that this is a
  REST-only clothing store (per the player README). The target's exact
  email, user ID, and the existence of the discount offer are
  deliberately withheld and must be discovered by the player.
- **Restrictions:** The player never receives the target's credentials
  and never needs to authenticate as them. The entire attack chain runs
  end to end from the player's own attacker session.

## 9.5 Attack Surface

| Method | Endpoint | Auth | Purpose | Role in the attack chain |
|---|---|---|---|---|
| POST | `/auth/register` | No | Create a customer account | Attacker onboarding — not itself vulnerable |
| POST | `/auth/login` | No | Log in, create a session | Attacker onboarding — not itself vulnerable |
| POST | `/auth/logout` | Yes | End the session | Out of scope for the intended chain |
| GET | `/users/<id>` | Yes | Get user info | **Primary vulnerability (BOLA)** — §9.6.1 |
| GET | `/products` | No | List products | Recon — intentionally public, not a boundary being tested |
| GET | `/products/<id>` | No | View one product | Recon — intentionally public, not a boundary being tested |
| POST | `/coupons` | Yes | Request a coupon | **Secondary vulnerability (prefix matching)** — §9.6.2 |
| POST | `/cart/items` | Yes | Add product to cart | Setup step for checkout |
| POST | `/cart/apply-coupon` | Yes | Apply a coupon | **Chained flaw (unrestricted stacking)** — §9.6.3 |
| POST | `/orders` | Yes | Checkout | Flag condition evaluated here — §9.9 |
| GET | `/health` | No | Health check | Operational only — not part of the attack surface |

**Parameters that matter for the attack:** `id` on the user endpoint,
`email` on coupon requests, `product_id`, `coupon_code`, `cart_id`.

Standard REST, JSON in and out, no GraphQL or gRPC in play.

**Main workflows:**

- Account → register → login → session cookie
- Products → view → add to cart
- Coupons → request → apply
- Checkout → apply discounts → create order

**Security controls in scope:** session authentication, object-level
authorization, coupon eligibility validation, coupon stacking limits,
checkout validation.

*Note: the products and health endpoints are intentionally
unauthenticated — this is public-by-design storefront/ops data, not an
oversight, and none of these endpoints participate in the intended
attack chain.*

## 9.6 Vulnerability Description

> **Note for reviewers.** Detailed exploitation primitives, exact
> payloads, and the reproduction sequence are intentionally omitted. The
> descriptions below identify the class of weakness, the failed control,
> and the root cause — enough to assess the lab's design and remediation
> without handing a reader the exploit.

### 9.6.1 Primary — BOLA on the user endpoint

**Type:** Broken Object Level Authorization (CWE-639).

**Preconditions:** any logged-in session — no special privilege needed.

**Failed control:** the API never checks that the requested user ID
belongs to the caller.

The auth middleware stops at "is this person logged in?" — it never asks
"should *this* person see *that* record?"

### 9.6.2 Secondary — Business Logic Flaw in coupon creation

**Type:** business logic flaw in the coupon-creation handler.

**Preconditions:** an email that shares a short prefix of the local part
and the exact domain of a real offer.

**Failed control:** eligibility should require an exact email match —
instead it is a truncated prefix comparison against the offers table.

The offer lookup is fuzzy, but the duplicate-request check uses the
*full* email the attacker just typed in. So tweaking anything after the
matched prefix produces what the system treats as a "new" email — while
it still resolves to the same underlying offer. Net effect: one offer
can be farmed for as many coupons as you're willing to request.

### 9.6.3 Chained — Unrestricted Coupon Stacking

**Affected:** the apply-coupon and checkout endpoints.

**Type:** business logic flaw — no ceiling on coupons or total discount
per cart.

**Failed control:** the apply-coupon handler correctly checks that a
coupon is owned by the caller and hasn't been used, but it never asks
"how many have already been applied here?"

Cart total math uses `max(0, subtotal - discount)`. There's no second
limit sitting on top of that. Combine it with the coupon-farming bug
above, and a run of small coupons will walk the price down to exactly
zero — no negative numbers, no errors, just a clean zero.

## 9.7 Intended Attack Path

> **Note for reviewers.** The full step-by-step reproduction (with exact
> requests, responses, payloads, and coupon codes) is intentionally
> omitted from this document to prevent the walkthrough from leaking if
> the repository is public. A full unredacted copy is available on
> request from the author.

A high-level summary is provided in the Design Document §5. In short:

1. **Reconnaissance** — map the API surface via scenario-driven reasoning
   and status-code inspection (a wrong method returns 405, a missing
   path returns 404).
2. **Register and log in** — obtain a normal customer session.
3. **BOLA** — read another user's profile via the user endpoint; this
   leaks the target's email.
4. **Coupon request** — request a coupon using the discovered email;
   a legitimate coupon is returned.
5. **Prefix abuse** — request additional coupons using email variants
   that share the target's email prefix and domain; each variant yields
   a fresh coupon.
6. **Add product** — add the high-value product to the cart.
7. **Stack coupons** — apply every coupon; the cart total falls to zero.
8. **Checkout** — complete the order; the flag is returned because both
   checkout conditions are satisfied (final price zero, and at least one
   applied coupon is tied to the exact target email).

In total the intended path takes roughly 25 HTTP requests.

## 9.8 Impact Assessment

- **Confidentiality:** any logged-in user can pull another user's public
  profile — this isn't limited to the seeded target, it works against
  the whole user base.
- **Integrity:** an attacker can obtain coupons that were never meant
  for their account and use them to manipulate their own cart's pricing,
  completing an order at a price that shouldn't be reachable.
- **Availability:** unaffected — nothing in this path touches uptime or
  resource exhaustion.
- **What's actually gained:** read access to other customers' profile
  data, an unlimited supply of coupons tied to someone else's offer, and
  a zero-price checkout on a premium item.

## 9.9 Flag Retrieval

### Required Condition

Checked server-side in the order-creation handler. Two things have to
both be true at checkout:

1. The final price is zero — the stacked coupons cover the entire
   subtotal.
2. At least one applied coupon is linked to the *exact* target email.

That second condition is the reason the prefix-matching bug alone isn't
a full solve — a variant-email coupon reduces the price fine, but only
the coupon tied to the real target email satisfies the flag check. The
player has to go through the BOLA step to get that exact email; there's
no way around it.

### Evidence of Successful Exploitation

The complete chain was reproduced twice — once manually, once via the
automated validation suite — both after a full container restart to
confirm the reset actually puts things back to a clean state.

## 9.10 Root Cause

Three separate missing checks, none of which is complicated on its own,
but they line up into a full attack chain:

1. The user endpoint trusts the client-supplied ID outright. It confirms
   *a* session exists but never checks that the session owns the
   requested record.
2. The coupon-creation endpoint trusts the client-supplied email as
   proof of eligibility, and does so with a loose comparison (truncated
   prefix + domain) instead of an exact match.
3. Coupon application has ownership and single-use checks, but nothing
   stops the *same* account from applying many different valid coupons
   to one cart.

Steps 1 and 2 get the attacker the coupons they need; step 3 is what
lets those coupons be stacked all the way to zero.

## 9.11 Remediation

| Vulnerability | Recommended Fix |
|---|---|
| BOLA on the user endpoint | Verify the requested user ID matches the authenticated session before returning data. If cross-user access is ever intentional, gate it behind an explicit authorization rule, not an implicit "logged in = allowed." |
| Prefix matching in coupon creation | Replace the prefix-based query with an exact match, using one consistent normalization rule for emails. Client-supplied email should never be treated as proof of identity or eligibility on its own. |
| Unrestricted coupon stacking | Cap the number of coupons and/or total discount per cart server-side, regardless of how many valid coupons the account holds. |
| Defense in depth | Log and rate-limit repeated coupon-creation attempts from a single account — won't fix the root cause, but it would have made this specific abuse pattern much easier to catch early. |

## 9.12 Verification & Retest

**Current (vulnerable) behavior:**

- The user endpoint returns any profile regardless of ownership.
- Coupon creation accepts any email sharing a short prefix and the
  domain of the seeded offer.
- Coupon application never rejects a coupon for exceeding a discount
  cap.

**Expected behavior after fixes:**

- The user endpoint returns `403`/`404` for IDs that don't belong to the
  caller.
- Coupon creation rejects anything short of an exact email match.
- Coupon application rejects further coupons once a configured limit is
  hit.

**Retest procedure:** run the automated validation script against the
patched build. The BOLA and coupon-related checks should flip from
"pass on vulnerable, fail on patched" to the opposite — that flip is
what proves the tests are actually exercising the control and not just
rubber-stamping both states.

**Current validation status:** the automated checks all pass against
the intentionally vulnerable build. Post-remediation, the security-
specific checks need to be rewritten to expect rejection instead of
success.

## 9.13 Unintended Attack Paths

A few shortcuts that were specifically looked for and ruled out:

**Endpoint discovery via automated fuzzing:** both a generic wordlist
and a dedicated API-endpoint wordlist were run against the full API
surface. Neither revealed any endpoint beyond the public health and
product endpoints — no hidden admin routes, debug endpoints, or
accidentally-exposed documentation were found. The real attack surface
only surfaces through scenario-driven reasoning and status-code
inspection, confirming no unintended shortcut exists via blind automated
recon.

- **Coupon replay:** the apply-coupon handler uses an atomic
  check-and-update. Two simultaneous requests at the same fresh coupon
  were fired to check for a race — one succeeded, the other came back
  `409`. No race condition here.
- **Cross-account coupon use:** the apply-coupon handler checks the
  coupon's owner against the caller and returns `403` on mismatch. A
  coupon minted by one account can't be applied by another.
- **Session token guessing:** tokens come from a cryptographically
  secure random generator and have no relationship to user ID — 192 bits
  of entropy, not something worth attacking directly.
- **SQL injection:** every query uses parameterized placeholders; no
  string-concatenated queries were found in the application code.
- **Flag exposure via source/config:** the flag comes in through a
  runtime environment variable, never baked into the image or source.
  It's only ever returned by the checkout endpoint, and only once the
  real condition is met.

Nothing else turned up during this round of testing. If a shortcut is
found later, it should get documented here and either patched out or
explicitly folded into the accepted solution space.

## 9.14 Conclusion

ThreadLine is a Medium-difficulty chain: a BOLA bug hands the player
information they shouldn't have, and a couple of loose business-logic
checks in the coupon system let that information turn into a free
premium item. Neither half is exotic on its own — that's sort of the
point. The interesting part is how ordinary each individual mistake
looks, and how much damage they do once they're strung together.

The environment resets cleanly via container restart, and the intended
path was verified twice — manually and via the automated suite — with no
unintended shortcut found in this round of testing.

One limitation worth flagging: the challenge assumes the player is
comfortable with raw REST tooling. There are no in-app hints beyond
normal API responses and status codes, which is intentional for a
Medium-difficulty challenge but worth keeping in mind if the target
audience skews more junior.
