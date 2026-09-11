**Internal document — for supervisor/evaluator review only. Do not
distribute to players. This document describes the intended
vulnerabilities and attack path.**

> **Sanitization notice.** This document is intentionally redacted. Exact
> payloads, internal hostnames, account identifiers, fixture filenames,
> and the step-by-step reproduction have been removed so that the
> document can be safely included alongside the lab without disclosing
> the solution. A full unredacted copy is available on request from the
> author.

---

## 1. Challenge Metadata

| Field | Value |
| --- | --- |
| **Challenge Name** | TechVault — GraphQL API Security Challenge |
| **Learning Objective** | The main goal is to show how multiple weaknesses can be combined into one attack path. The challenge starts with an authentication bypass, followed by command injection and then a blind SSRF that can reach an internal service. |
| **Primary Vulnerability** | Blind Server-Side Request Forgery (SSRF) through a GraphQL mutation parameter (CWE-918) |
| **Secondary Vulnerability** | OS Command Injection caused by incomplete input filtering (CWE-78), combined with an authentication bypass caused by a type-confusion/trust-boundary issue in a GraphQL input type (CWE-287 / CWE-863) |
| **Difficulty** | Hard |
| **Estimated Solve Time** | 90–150 minutes for a technically competent participant who is familiar with GraphQL APIs |
| **Required Skills** | GraphQL queries and mutations, GraphQL introspection, HTTP tools such as curl, basic Linux shell syntax and command substitution, Base64/hex decoding, and general API enumeration |
| **Prerequisites** | Docker, Docker Compose, and a GraphQL-capable HTTP client |
| **Flag Format** | `duck{...}` |

---

## 2. Primary Attack Family

**Core family:** SSRF & Server-Side Requests

**Secondary family:** Input Validation & Injection (Command Injection), together with an authentication weakness that provides the initial access.

The command injection is part of the main attack chain rather than a separate vulnerability. It allows the attacker to obtain information needed for the SSRF step, especially the internal service details.

---

## 3. Application Scenario

TechVault is a fictional laptop e-commerce platform. The storefront is backed by a GraphQL API.

Besides the normal catalog and authentication functionality, the API has two additional features used by the merchandising team:

- A **preview-generation** feature — generates a small preview from a supplied source, such as a supplier page or specification sheet, and stores the generated result.
- A **competitor price-check** feature — checks a competitor listing so that staff can compare prices.

TechVault also has an internal reconciliation service, which is used for account reconciliation. This service is only available inside the Docker network and does not have a publicly exposed port.

The internal service is included to represent a typical microservice trust boundary where the public API can communicate with services that external users cannot access directly.

---

## 4. Attacker Starting Point

The attacker starts without an account or valid credentials.

- **Initial access:** Unauthenticated access to the public GraphQL endpoint.
- **Credentials:** No valid password is provided to the player.
- **Role/privileges:** The attacker starts with no privileges. The intended path first results in a `CUSTOMER` session.
- **Known information:** A registered username is discoverable in-band through ordinary API exploration — a public, unauthenticated storefront query exposes a customer review authored by an existing user. No out-of-band hint is used or required.
- **Restrictions:** The player does not have access to the source code, Docker containers, internal services, or any other host/service outside the published GraphQL API.

---

## 5. Intended Attack Path — Overview

> **Note for reviewers.** The full step-by-step reproduction (with exact
> requests, responses, and payloads) is intentionally omitted from this
> document to prevent the walkthrough from leaking if the repository is
> public. A private copy is available on request from the author.

The intended chain consists of three stages:

1. **Authentication bypass** — a type-confusion / trust-boundary flaw in
   the GraphQL password input type allows an attacker to obtain a
   valid session without knowing the real password.
2. **OS command injection** — an incompletely filtered parameter in the
   preview-generation feature allows arbitrary command execution inside
   the API container, which is used to disclose internal configuration
   and the address of an internal-only service.
3. **Blind SSRF** — a server-side fetch in the competitor-pricing
   feature accepts an attacker-supplied target with no allow-list,
   reaching an internal reconciliation service that has no published
   port. The response body is stored server-side and later retrieved
   through the same artifact mechanism used by the preview feature.

Each stage supplies information or access the next stage requires. No
single stage exposes the flag on its own.

---

## 6. Design Rationale Against Task Requirements

| Requirement | How the design addresses it |
| --- | --- |
| **Realism** | The vulnerable features are based on normal e-commerce functionality. Preview generation and competitor price checking are realistic features, while the legacy authentication behavior provides a reasonable explanation for the authentication weakness. |
| **Solvability** | The API provides useful responses at different stages of the attack. Filter errors, fixture files, and the response returned after a successful SSRF help the player understand where to look next. |
| **Non-triviality** | The vulnerable parameters do not directly reveal the intended exploit. The player has to investigate the GraphQL schema and find a way around the command filter and the blind SSRF behavior. |
| **Determinism** | The challenge uses fixed fixture files, seeded users, and product IDs. Artifact ordering also uses a monotonic secondary sort key so that results remain consistent if two artifacts have the same timestamp. |
| **Isolation** | The internal service does not expose a host port and is placed on a Docker internal network using `internal: true`. It can only be reached through the intended SSRF path. |
| **Minimal Noise** | Only the vulnerabilities required for the intended chain are included. Two decoy fixture files contain no useful sensitive information. |
| **Reproducibility** | The environment can be started using `docker compose up --build`. The API can be reset using `docker compose restart techvault-api`. The complete attack chain was also checked using a local validation script. |
| **Validation** | Both services provide `/health` endpoints, and the end-to-end validation script performs 24 automated assertions covering the intended attack path. |

---

## 7. Known Design Iteration

During manual playtesting, one transition in the attack chain was not
clear enough to be reliably solvable. An optional `note` field was added
to the competitor-price response type to give the player an in-band hint
that the SSRF result was stored server-side, without exposing the
internal response body. The SSRF remains blind; the hint only tells the
player that the result was archived.

This change is also documented in the resolution design notes and in the
Security Report under the relevant design-iteration discussion.

---

## 8. Out of Scope / Explicitly Not Vulnerable

The following areas were checked and are intentionally not part of the attack path.

- **Standard password login (plain-password path)** — uses a real bcrypt password hash and was verified not to be practically brute-forceable within the challenge scope.
- **Artifact retrieval by id** — checks artifact ownership at the data-access layer. An IDOR regression test is included in the validation script (step 15).
- **Internal-service authentication** — the internal service does not have its own authentication layer. This is intentional because the service cannot be reached directly from outside the Docker network. Access to it is expected to happen only through the intended SSRF.
