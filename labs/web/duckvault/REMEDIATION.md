# DuckVault Remediation Guide

## Overview

DuckVault intentionally demonstrates a chained API authorization weakness:

```text
BOLA / IDOR → Excessive Data Exposure → BFLA → Flag
```

The application currently checks whether the user is authenticated, but it does not consistently verify whether the user is authorized to access a specific object or privileged function.

This guide explains how to remediate the vulnerabilities while preserving the intended application behavior.

---

## 1. Root Cause

The root cause is missing and inconsistent authorization enforcement.

The vulnerable implementation answers:

```text
Is the user logged in?
```

But it does not consistently answer:

```text
Is this user allowed to access this specific object or function?
```

The affected areas are:

- Document access
- Report metadata access
- Admin export functionality
- Exposure of internal report identifiers

---

## 2. Vulnerability 1: Broken Object Level Authorization / IDOR

### Vulnerable Behavior

The document API retrieves documents by document ID only:

```sql
SELECT
    d.id,
    d.owner_id,
    d.title,
    d.classification,
    d.content,
    u.username AS owner
FROM documents d
JOIN users u ON u.id = d.owner_id
WHERE d.id = ?
```

This allows any authenticated user to request another user's document by changing the document ID.

Example:

```text
/documents/1042
/documents/1044
```

### Secure Behavior

The API must verify that the requested document belongs to the authenticated user.

Secure query:

```sql
SELECT
    d.id,
    d.owner_id,
    d.title,
    d.classification,
    d.content,
    u.username AS owner
FROM documents d
JOIN users u ON u.id = d.owner_id
WHERE d.id = ? AND d.owner_id = ?
```

The second parameter should be:

```python
session["user_id"]
```

### Secure Flask Example

```python
@app.get("/api/documents/<int:doc_id>")
@login_required
def get_document(doc_id):
    conn = db()

    row = conn.execute(
        """
        SELECT
            d.id,
            d.owner_id,
            d.title,
            d.classification,
            d.content,
            u.username AS owner
        FROM documents d
        JOIN users u ON u.id = d.owner_id
        WHERE d.id = ? AND d.owner_id = ?
        """,
        (doc_id, session["user_id"]),
    ).fetchone()

    conn.close()

    if not row:
        return jsonify({"error": "forbidden"}), 403

    return jsonify(dict(row))
```

---

## 3. Vulnerability 2: Excessive Data Exposure

### Vulnerable Behavior

A restricted document exposes an internal export target:

```text
report_id=7331
```

This value should not be visible to a low-privileged employee because it references a restricted security administration report.

### Secure Behavior

Sensitive internal identifiers should only be returned to authorized users.

The application should avoid exposing:

- Internal report IDs
- Admin export paths
- Restricted object references
- Backend-only identifiers
- Privileged workflow hints

### Secure Design Options

Option 1: Remove the sensitive identifier from employee-facing content.

```text
Quarterly privileged-access review notes were moved after the legacy archive migration.
This record is intended for security administration review only.
```

Option 2: Show the reference only to admins.

```python
if session.get("role") == "admin":
    content += " Internal reference: report_id=7331"
```

Option 3: Use indirect public-safe references that cannot be used to access restricted backend objects.

---

## 4. Vulnerability 3: Broken Function Level Authorization

### Vulnerable Behavior

The admin export endpoint processes requests from any authenticated user:

```text
POST /api/admin/exports
```

The endpoint only checks login, not role.

As a result, a low-privileged employee can use an administrator-only function.

### Secure Behavior

The endpoint must enforce role-based authorization.

Only users with the admin role should be allowed to create admin export jobs.

### Secure Flask Example

```python
@app.post("/api/admin/exports")
@login_required
def create_admin_export():
    if session.get("role") != "admin":
        return jsonify({"error": "forbidden"}), 403

    data = request.get_json(silent=True) or {}
    report_id = data.get("report_id")

    if not report_id:
        return jsonify({"error": "report_id is required"}), 400

    conn = db()

    row = conn.execute(
        """
        SELECT
            r.id,
            r.owner_id,
            r.title,
            r.body,
            r.flag,
            u.username AS owner
        FROM reports r
        JOIN users u ON u.id = r.owner_id
        WHERE r.id = ?
        """,
        (report_id,),
    ).fetchone()

    conn.close()

    if not row:
        return jsonify({"error": "report not found"}), 404

    return jsonify(
        {
            "export_status": "completed",
            "export_type": "administrator_report_export",
            "report": {
                "id": row["id"],
                "title": row["title"],
                "owner": row["owner"],
                "classification": "ADMIN_RESTRICTED",
                "body": row["body"],
            },
        }
    )
```

---

## 5. Report Metadata Authorization

### Vulnerable Behavior

The metadata endpoint exposes information about a restricted report:

```text
GET /api/reports/7331
```

Even if the flag is not returned there, the endpoint confirms that the report exists and provides useful workflow information.

### Secure Behavior

The report metadata endpoint should verify that the user is allowed to access the report.

Secure logic:

```python
if session["role"] != "admin" and row["owner_id"] != session["user_id"]:
    return jsonify({"error": "forbidden"}), 403
```

### Secure Query Option

```sql
SELECT
    r.id,
    r.owner_id,
    r.title,
    r.body,
    u.username AS owner
FROM reports r
JOIN users u ON u.id = r.owner_id
WHERE r.id = ?
```

Then apply authorization before returning the response.

---

## 6. Recommended Authorization Pattern

A reusable helper function can reduce mistakes.

```python
def can_access_owned_object(owner_id):
    return session.get("role") == "admin" or owner_id == session.get("user_id")


def require_admin():
    return session.get("role") == "admin"
```

Example use:

```python
if not can_access_owned_object(row["owner_id"]):
    return jsonify({"error": "forbidden"}), 403
```

For admin-only endpoints:

```python
if not require_admin():
    return jsonify({"error": "forbidden"}), 403
```

---

## 7. Expected Secure Behavior After Fix

After remediation:

- The `intern` user can access only their own assigned documents.
- The `intern` user cannot access `/documents/1044`.
- The restricted document does not expose `report_id=7331` to unauthorized users.
- The report metadata endpoint does not reveal restricted report information to unauthorized users.
- `POST /api/admin/exports` returns `403 Forbidden` for non-admin users.
- The flag cannot be retrieved by a low-privileged employee.
- Admin-only functionality requires the admin role.

---

## 8. Retest Procedure

### Test 1: Health Check

```bash
curl -i http://localhost:8000/health
```

Expected result:

```text
HTTP/1.1 200 OK
```

Response:

```json
{
  "status": "ok"
}
```

### Test 2: Login Works

```bash
curl -c cookies.txt -X POST http://localhost:8000/login \
  -d "username=intern" \
  -d "password=intern123"
```

Expected result:

```text
HTTP redirect to dashboard
```

### Test 3: Assigned Document Works

```bash
curl -b cookies.txt http://localhost:8000/api/documents/1042
```

Expected result:

```text
Document is returned.
```

### Test 4: Unowned Document Is Blocked

```bash
curl -b cookies.txt http://localhost:8000/api/documents/1044
```

Expected secure result:

```text
403 Forbidden
```

### Test 5: Report Metadata Is Blocked

```bash
curl -b cookies.txt http://localhost:8000/api/reports/7331
```

Expected secure result:

```text
403 Forbidden
```

### Test 6: Admin Export Is Blocked for Employee

```bash
curl -b cookies.txt -X POST http://localhost:8000/api/admin/exports \
  -H "Content-Type: application/json" \
  -d '{"report_id":7331}'
```

Expected secure result:

```text
403 Forbidden
```

---

## 9. Security Controls to Apply

The following controls should be applied in a production-style implementation:

- Enforce object-level authorization on every object lookup.
- Enforce role-based authorization on privileged functions.
- Avoid exposing internal identifiers to unauthorized users.
- Return generic `403 Forbidden` responses for unauthorized access.
- Keep authentication and authorization checks separate.
- Add regression tests for authorization boundaries.
- Review every endpoint for direct object references.
- Do not rely on client-side hiding of links or buttons as a security control.

---

## 10. Conclusion

The secure fix is not only to hide the leaked report ID or remove the admin export route.

The correct remediation is to enforce authorization consistently on every sensitive backend request.

Authentication proves the user's identity.

Authorization decides whether that identity is allowed to access a specific object or function.