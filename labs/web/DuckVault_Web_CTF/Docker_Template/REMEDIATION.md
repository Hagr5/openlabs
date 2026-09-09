# DuckVault — Remediation

## Vulnerability
Broken Object Level Authorization (BOLA) / IDOR

## Affected Endpoint

```http
GET /api/documents/<document_id>
```

## Root Cause
The endpoint verifies that the requester is authenticated but does not verify that the requested document belongs to the authenticated user.
The vulnerable logic retrieves the document using only its identifier:

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

This allows an authenticated user to request an object owned by another user.

---

## Recommended Fix
Authorization must be performed at the object level.
A secure query should associate the requested object with the authenticated user:

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

The values should be supplied using parameterized SQL.
For example:

```python
document = conn.execute(
    """
    SELECT
        id,
        owner_id,
        title,
        content,
        vault_reference
    FROM documents
    WHERE id = ?
      AND owner_id = ?
    """,
    (document_id, user["id"]),
).fetchone()
```

If the document does not belong to the authenticated user, it should not be returned.

---

## Authorization Requirements
The application should enforce the following security rule:

```text
Authenticated user
        |
        v
Requested document
        |
        v
Does the user have permission to access this object?
        |
      /   \
    Yes    No
     |      |
   Allow   Deny
```

Authorization should be performed server-side for every object access.
Client-side filtering, hidden fields, unpredictable identifiers, and UI restrictions must not be treated as authorization controls.

---

## Recommended Security Controls

### 1. Object-Level Authorization
Every object access should verify ownership or an explicit permission relationship.

### 2. Centralized Authorization
Where practical, authorization checks should be centralized or implemented consistently so that individual endpoints cannot accidentally omit them.

### 3. Least Privilege
Users should only receive access to resources required for their role and business function.

### 4. Secure Error Handling
Authorization failures should not expose sensitive object information.

### 5. Logging
Authorization failures should be logged with sufficient information for security monitoring without exposing sensitive data.

### 6. Automated Tests
Authorization tests should cover:
* Owner accessing own object.
* User accessing another user's object.
* Administrator accessing permitted objects.
* Unauthenticated access.
* Non-existent objects.

---

## Verification

Before remediation:

```http
GET /api/documents/2001
Authorization: Bearer <ALICE_TOKEN>
```

Expected vulnerable challenge behavior:

```text
200 OK
```

After remediation:

```text
GET /api/documents/2001
Authorization: Bearer <ALICE_TOKEN>
```

Expected secure behavior:

```text
403 Forbidden
```

Alice must still be able to access:

```text
/api/documents/1001
/api/documents/1002
```

---

## Regression Test
The following authorization matrix should remain valid:

| Requester       | Object         | Expected |
| --------------- | -------------- | -------- |
| Alice           | Alice document | Allow    |
| Alice           | Bob document   | Deny     |
| Bob             | Bob document   | Allow    |
| Bob             | Alice document | Deny     |
| Unauthenticated | Any document   | Deny     |

---

## Challenge-Specific Note
The vulnerable implementation is intentional and exists only in the challenge build.
The remediation described here represents the secure production behavior and should not be applied to the intentionally vulnerable challenge before validation of the intended attack path.
