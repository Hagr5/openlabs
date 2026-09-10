# ShopVault — Challenge Design

This document records the design decisions behind the ShopVault lab.
It is intended for maintainers and reviewers, not for players.

## 1. Purpose

Document the design intent, learning objective, and trust boundaries of
the lab so that a maintainer can review the challenge against its
stated goals. Exploit mechanics are described at a high level only.

## 2. Learning Objective

Demonstrate how three individually moderate weaknesses in a REST API —
an authentication response discrepancy, a client-trusted rate-limit
identity, and a low-entropy HS256 signing secret — combine into a
vertical privilege-escalation path from unauthenticated to manager
role.

The learning objective is the composition. None of the three
component weaknesses is novel on its own; the challenge is the chain.

## 3. Scenario

An e-commerce-style REST API exposes authentication, user
self-service, administrative user management, and manager-only
reporting. The attacker starts unauthenticated, has no credentials,
and has no source access at play time. The objective is to reach a
manager-only endpoint that returns the flag.

## 4. Component Vulnerability Families

Three weakness families are introduced and chained:

| Role | Family | CWE |
|---|---|---|
| Component 1 | Observable authentication discrepancy | CWE-203 |
| Component 2 | Rate-limit identity derived from client-controlled input | CWE-345, CWE-346 |
| Component 3 | Low-entropy HMAC signing secret | CWE-327, CWE-330 |

Component 3 is the primary vulnerability: it converts a
low-privilege token into a forged privileged one and is the step that
makes full escalation possible.

## 5. Trust Boundaries

**Violated by the intended attack path:**

1. Authentication failure responses differ observably between
   "unknown account" and "known account, wrong credential,"
   permitting cheap username enumeration.
2. Login lockout identity is derived from a client-supplied header
   rather than a trusted, server-side source, making the lockout
   bypassable by header rotation.
3. The JWT signing secret is short, human-chosen, and thematically
   related to an internal codename that is exposed by an
   unauthenticated endpoint. HS256 is symmetric, so any captured
   token permits offline verification and forgery once the secret is
   recovered.

**Deliberately held (not violated):**

The server never trusts the JWT payload's role claim. Role is always
re-resolved from the database via the token subject on every
authenticated request. Payload tampering without re-signing therefore
does nothing. This boundary is held intentionally so that the
weak-secret path remains the only escalation vector.

## 6. Difficulty and Timing

- **Difficulty:** hard
- **Estimated solve time:** 60–90 minutes for a technically
  competent participant
- **Prerequisite skills:** HTTP/REST fundamentals, JWT structure,
  awareness of offline hash-cracking technique, basic endpoint
  fuzzing methodology

## 7. Non-Goals

The lab does not demonstrate: SQL injection, SSRF, file handling,
CORS, GraphQL, gRPC, business-logic manipulation. These are out of
scope; the challenge is focused on the chain described in §4.

## 8. Reset Behavior

The database is seeded fresh on every container start. Player actions
do not persist across restarts. `docker compose down && docker
compose up -d` returns the lab to a known clean state.

