# ThreadLine — Challenge Design Document

**Challenge Name:** ThreadLine
**Author:** Hagar Sherif
**Classification:** Internal / CTF Infrastructure Only

> **Sanitization notice.** This document is intentionally redacted. Exact
> payloads, internal hostnames, account identifiers, and the step-by-step
> reproduction have been removed so that the document can be safely
> included alongside the lab without disclosing the solution. A full
> unredacted copy is available on request from the author.

---

## 1. Vulnerability Family Selection

**Primary vulnerability:** BOLA / IDOR (Broken Object Level Authorization)
**Secondary vulnerability:** Business Logic Flaw

BOLA was selected as the main vulnerability from the beginning of the
project. The main goal was to create a challenge around object-level
authorization and show how an API can expose another user's data when
ownership is not properly checked.

The Business Logic flaw was added as a second part of the challenge. A
BOLA that only exposes an email address would not have a strong final
impact by itself. By connecting the leaked information to the coupon
system, the player has to use the information from the first
vulnerability to continue the attack.

This makes the challenge a chain rather than a single vulnerability. The
player needs to understand both the authorization issue and the incorrect
business rule before reaching the final objective.

## 2. Learning Objective

The main objective is to understand how a missing object-level
authorization check can expose information belonging to another user, and
how that information can then be used in a separate business flow.

The intended lesson is that authentication alone does not guarantee
authorization. A user can have a valid session and still be able to
access objects that belong to another account if the application does
not verify ownership correctly.

The challenge also demonstrates how two individually limited issues can
become much more serious when they are chained together.

## 3. Scenario Design

**Scenario:** ThreadLine is a REST API for an online clothing store.

The application does not have a frontend. All interaction is performed
through HTTP requests, which keeps the challenge focused on API behavior
rather than browser-side functionality.

The clothing-store scenario was chosen because coupon and discount
systems are realistic places for business-logic issues to occur. The
attacker also starts as a normal customer rather than an administrator.
This keeps the challenge focused on horizontal authorization rather than
mixing BOLA with vertical privilege escalation.

The application contains a small product catalog and a coupon system.
There is no payment or account-balance system because it is not needed
for the intended attack path. The final result is achieved through the
discount mechanism.

## 4. Attacker Starting Point, Roles & Assumptions

The player starts without an account and can register normally.

After registration, the player has the same privileges as every other
customer. There is no administrator role in the challenge.

**Starting conditions**

- The API is reachable over the network.
- The player can create an account.
- The player receives a normal authenticated session.
- No API documentation or Swagger/OpenAPI specification is provided.
- The player is expected to discover the available API endpoints during
  reconnaissance.

**Expected skills**

The player should be comfortable with:

- REST APIs
- HTTP requests and responses
- JSON
- Cookies / session handling
- Basic API testing using tools such as `curl`, Postman, or Burp Suite

Knowledge of JavaScript, browser internals, or frontend development is
not required.

## 5. Intended Attack Path — Overview

> **Note for reviewers.** The full step-by-step reproduction (with exact
> requests, responses, and payloads) is intentionally omitted from this
> document to prevent the walkthrough from leaking if the repository is
> public. A private copy is available on request from the author.

The intended chain consists of three stages:

1. **BOLA / IDOR** — the user object endpoint accepts a client-supplied
   identifier without verifying that the session owns the requested
   record. This leaks another customer's profile information, including
   their email address.

2. **Business logic flaw (prefix matching)** — the coupon-eligibility
   endpoint decides eligibility using a truncated prefix comparison of
   the email's local part rather than an exact match. Combined with the
   email leaked in stage 1, this lets the attacker request multiple
   coupons that should not have been available to them.

3. **Business logic flaw (unrestricted stacking)** — the cart logic
   applies any number of valid coupons without capping the total
   discount. Stacking the coupons obtained in stage 2 drives the cart
   total to zero, allowing the attacker to complete a checkout at $0.

Each stage supplies information or access the next stage requires. No
single stage exposes the flag on its own.

## 6. Implementation Decisions

| Decision | Rationale |
|---|---|
| SQLite database stored on `tmpfs` and reseeded on container restart | Keeps the challenge deterministic and makes it easy to return to a clean state. |
| Session tokens generated using a cryptographically secure random generator | Prevents session tokens from being predictable or related to user IDs. |
| Session token is unrelated to the user ID | Removes token guessing as an unintended way to access another user's account. |
| Passwords are hashed before storage | Prevents password storage from becoming an unnecessary attack path. |
| Coupon ownership is checked when applying coupons | Prevents users from simply using coupons belonging to another account. |
| Coupon use is protected by an atomic single-use condition | Prevents coupon replay and concurrent double-spending from becoming alternate solutions. |
| Flag requires a coupon tied to the exact target email | Forces the player to perform the BOLA step instead of solving the challenge only through coupon stacking. |
| No rate limit on coupon creation | Required for the intended coupon-generation technique using email variants. |
| Two products are included | Keeps the store scenario realistic while making sure the product catalog does not create an easier route to the flag. |

The higher-priced product is the main target for the intended checkout
scenario, while the lower-priced product acts as a filler product. The
flag logic is based on the coupon and linked-email conditions, not
simply on the product price.

## 7. Minimal Noise and Secured Non-Targets

Several areas were intentionally implemented securely so that they would
not create additional unintended solutions.

**Coupon replay**

Coupon usage is protected by an atomic database update. This was also
tested under concurrent requests to make sure the same coupon cannot be
successfully used twice.

**Cross-account coupon usage**

A coupon must belong to the current user before it can be applied. This
prevents players from simply taking a coupon ID from another account and
using it directly.

**SQL Injection**

Database queries use parameterized statements. The application was
reviewed to ensure that user-controlled values are not directly
concatenated into SQL queries.

**Endpoint discovery**

The application does not expose API documentation or unnecessary debug
endpoints. Endpoint discovery was tested using generic and API-specific
wordlists.

The intended API surface remains the only useful surface for solving the
challenge.

**Flag exposure**

The flag is not stored in the source code or static files. It is provided
through a runtime environment variable and is only returned after the
checkout conditions are satisfied. The `.dockerignore` also prevents
`.env` and documentation files from being included in the Docker build
context.

## 8. Difficulty Calibration

**Target difficulty:** Medium
**Estimated solve time:** 30–60 minutes

The BOLA part is intentionally straightforward once the relevant endpoint
is discovered. Sequential user IDs make it possible for the player to
identify another user without requiring a complicated enumeration
technique.

The harder part is understanding the behavior of the coupon endpoint.
The player needs to notice that the email comparison is not an exact
comparison and then realize that the behavior can be combined with
unrestricted coupon stacking.

The challenge does not require cryptography, multiple external services,
custom exploit tooling, or protocol-level tricks. The difficulty comes
mainly from understanding how the two vulnerabilities interact.

The difficulty level is kept consistent across the player README, design
document, and security report.

## 9. Preventing Hardcoded Flag Hunting

The flag is returned only by the checkout endpoint. It is generated at
request time based on the current database state, including:

- The cart contents
- The applied coupons
- The linked email values
- The final calculated price

The flag is not included in static files, configuration files, Docker
layers, or normal API responses. There is also no debug endpoint or error
message that exposes the flag without satisfying the intended checkout
conditions.

This was checked during testing to make sure the challenge requires
investigation rather than simple flag searching.

## 10. Validation Strategy

The challenge was tested using two different methods on a freshly reset
instance.

**Manual validation**

The complete intended attack path was performed manually using `curl`.
The steps included:

1. Creating an account.
2. Discovering the relevant API endpoints.
3. Identifying the BOLA issue.
4. Obtaining the target email.
5. Testing the coupon email validation.
6. Generating the required coupons.
7. Applying the coupons to the cart.
8. Completing checkout.
9. Confirming successful flag retrieval.

The complete walkthrough is documented in the accompanying security
report (private version, available on request).

**Automated validation**

An automated regression script was also used. The test suite contains
21 assertions covering areas such as:

- Application health
- Authentication boundaries
- BOLA behavior
- Coupon generation
- Coupon stacking
- Race-condition protection
- Coupon ownership
- Final flag conditions
- Flag format

The final validation completed successfully with:

Both manual and automated testing were performed after resetting the
application to a clean state.

## 11. Packaging for Independent Verification

The final package contains:

- Application source code
- `Dockerfile`
- `docker-compose.yml`
- Player-facing `README.md`
- Automated validation script
- Design document (this file)
- Security report

The Docker configuration also includes several hardening measures:

- Non-root container execution
- `cap_drop: ALL`
- Read-only root filesystem
- Internal Docker network
- Resource limits

No manual configuration is required beyond starting the application with:

The challenge does not depend on external network access during the
intended attack path. The Docker network is configured as `internal:
true`, and the application does not need to communicate with external
services.

The final package is therefore intended to be reproducible from a clean
environment and independently verifiable without additional setup.
