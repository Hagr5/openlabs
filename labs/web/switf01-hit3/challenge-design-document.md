# Challenge Design Document — SwiTF01-hit3

**Author:** Mohamed Swilam  
**Date:** September 2026  
**Version:** 1.0

---

## Challenge Metadata

| Field | Details |
|-------|---------|
| Challenge Name | SwiTF01-hit3 |
| Primary Vulnerability | Excessive Data Exposure (PII Leak) → Broken Authentication → GraphQL Introspection + NoSQLi → gRPC Hidden Service Discovery |
| Secondary Vulnerability | GraphQL Introspection abuse leading to Unrestricted Querying |
| Difficulty | Hard |
| Estimated Solve Time | ~2 hours |
| Flag Format | `duck{...}` |

---

## Learning Objective

The participant is expected to understand how a chain of realistic API vulnerabilities across multiple protocol layers (REST, GraphQL, gRPC) can be combined into a full attack path that leads to complete privilege escalation. Specifically, the challenge demonstrates how excessive data exposure in a REST response, combined with broken authentication on a social login endpoint, GraphQL introspection abuse enabling NoSQL injection, and a hidden gRPC service with missing authorization controls, can together allow an unauthenticated attacker to reach superadmin-level access and retrieve a sensitive flag.

---

## Primary Vulnerability

**Broken Authentication: PKCE Parameter Tampering (Account Takeover)**

The standard login flow utilizes a multi-step process involving `/api/v1/auth/login` and `/api/v1/auth/token` which mimics OAuth PKCE. The login endpoint verifies credentials and issues an authorization code linked to the authenticated user. However, the token exchange endpoint suffers from a Parameter Tampering (IDOR) vulnerability. The backend trusts the attacker-supplied `email` in the token exchange request rather than using the user identity associated with the authorization code. This allows an attacker to log in with their own credentials, but obtain a valid JWT session for any other user by specifying their email during the token exchange.

---

## Secondary Vulnerabilities

**1. Excessive Data Exposure / PII Leak (REST)**  
Task API responses include the full creator object with name and email, while the UI only renders the name. The raw API response exposes PII that is not intended to be visible to other users.

**2. GraphQL Introspection + Unrestricted Querying**  
The `searchAdmins` GraphQL query exposes a hidden `rawFilter` argument discoverable only through introspection. This argument is passed directly to MongoDB without sanitization, allowing the player to query any field in the admin collection without restriction to extract hidden superadmin email addresses.

**3. gRPC Hidden Service: Missing Authorization**  
The gRPC server exposes a `SuperAdminService` that is not reflected in the UI and has no authorization check or rate limiting on its `AddUnlimitedAdmin` method, unlike the `AdminService.AddAdmin` method which enforces a 5-admin limit.

---

## Required Skills

- REST API testing and Burp Suite interception
- HTTP request/response analysis
- GraphQL introspection queries
- Basic MongoDB query structures
- gRPC basics and `grpcurl` usage
- JWT session handling

---

## Prerequisites

- Familiarity with Burp Suite or any HTTP proxy
- Understanding of JSON-based API authentication flows
- Basic knowledge of GraphQL schema structure
- Ability to craft JSON queries for MongoDB
- Ability to use `grpcurl` for gRPC interaction

---

## Attack Family Coverage

| Priority | Family | Role in Challenge |
|----------|--------|------------------|
| Core | Authentication | PKCE Parameter Tampering (steps 2 and 4) |
| Core | Object & Property Authorization | PII leak in REST response (step 1) |
| Core | GraphQL Security | Introspection abuse + Unrestricted Querying (step 3) |
| Core | gRPC Security | Hidden service discovery + missing authorization (step 5) |

---

## Application Overview

SwiTF01-hit3 is a task management web application built with NestJS and Next.js. It supports three user roles, each interacting with the backend through a different API protocol:

- **User**: interacts via REST API (port 4000)
- **Admin**: interacts via GraphQL API (port 4000, `/graphql`)
- **SuperAdmin**: interacts via gRPC (port 50051)

The application manages projects and tasks. Each project is owned by a user who can invite members, and members can create tasks within the project. The admin panel provides visibility over all projects, tasks, and users. The superadmin panel extends this with full control over admin accounts.

---

## Intended Attack Path Summary

```
[Step 1] REST: PII Leak
Observe raw API response for a task, extract admin email from creator object.

[Step 2] REST: Authentication Bypass (PKCE Parameter Tampering)
Observe standard login flow in Network tab to discover the 2-step PKCE exchange.
POST /api/v1/auth/login with swilam:switf123 credentials and a codeChallenge → authorizationCode
POST /api/v1/auth/token with authorizationCode, codeVerifier, and email set to admin@switf.local → admin JWT session

[Step 3] GraphQL: Introspection + Unrestricted Querying
Run __schema introspection → discover hidden rawFilter argument on searchAdmins
Inject arbitrary JSON filter via rawFilter → extract superadmin email

[Step 4] REST: Authentication Bypass (repeated)
Same flow: login as swilam to get a new code, then exchange it with the superadmin email → superadmin JWT session

[Step 5] gRPC: Hidden Service Discovery
grpcurl reflection → discover SuperAdminService.AddUnlimitedAdmin
Call AddUnlimitedAdmin → add 6th admin
grpcurl ListAdmins → 6th admin name = flag
```

---

## Flag Condition

The flag is revealed when the participant successfully calls `SuperAdminService.AddUnlimitedAdmin` via gRPC and then lists admins via `AdminService.ListAdmins`. The sixth admin in the list carries the flag as their name:

```
duck{h1t_r3st_gr2ph_7pc_to_h1t_m3}
```

The flag is stored server-side and is only revealed dynamically in the admin list after a successful addition. It is not present in source code, static files, configuration, or any API response reachable without completing the full chain.

---

## Difficulty Justification

The challenge is rated **Hard** for the following reasons:

- Requires working knowledge of three distinct API protocols
- Each step depends on the output of the previous one, no step can be skipped
- The GraphQL NoSQLi requires introspection to discover the vulnerable argument first
- The gRPC step requires familiarity with reflection and `grpcurl` tooling
- The PKCE parameter tampering requires understanding of OAuth-like code exchange flows

---

## Isolation and Safety

- The application runs entirely within Docker containers
- No external internet connectivity is required or used
- All credentials, emails, and data are simulated and scoped to the lab environment
- The challenge can be fully reset by running `docker compose down -v && docker compose up`
- No destructive behavior, persistence mechanisms, or functionality affecting systems outside the lab is present

---

## Reset Behavior

On reset, the database is wiped and re-seeded with:

- 4 user accounts (including `swilam` / `switf123`)
- 1 default admin account (email: `admin@switf.local`)
- 1 default superadmin account (email: `superswilam@switf.local`, hidden in UI)
- 5 pre-existing admin entries (enforcing the limit visible from the UI)
- 3 projects and 8 tasks
- The task "Document gRPC schema" created by the admin account (which contains the PII leak in its raw API response)

---

## Validation Summary

A health check script (`healthcheck.sh`) verifies:

- [x] Application starts and all services respond
- [x] REST endpoints return expected responses
- [x] GraphQL endpoint accepts introspection queries
- [x] gRPC reflection is available on port 50051
- [x] PKCE parameter tampering works end-to-end
- [x] Unrestricted querying via `rawFilter` returns superadmin email
- [x] `AddUnlimitedAdmin` adds a 6th admin successfully
- [x] Flag appears in `ListAdmins` response after successful addition
