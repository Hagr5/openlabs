# DuckVault Security Report

## 1. Executive Summary

DuckVault is a local API/Web security CTF challenge.

The application simulates a small internal employee records portal. The challenge shows how a normal authenticated employee can access restricted information because the backend does not enforce authorization correctly.

The main idea is that authentication is not enough. The backend must also check if the logged-in user is allowed to access the requested object or function.

The challenge chain is:

```text
IDOR / BOLA -> Data Exposure -> Broken Function Level Authorization -> Flag
```

## 2. Challenge Overview

DuckVault allows employees to log in and view assigned records.

The player starts with a normal employee account. By investigating how the application loads records and uses internal APIs, the player can reach a restricted report and retrieve the flag.

## 3. Architecture and Trust Boundaries

The challenge has three main parts:

```text
Browser / curl / Postman / Burp
        |
        v
Flask Web Application
        |
        v
SQLite Database
```

The Flask application handles login, sessions, document loading, report metadata, and admin export requests.

The SQLite database stores users, documents, reports, and the flag.

The important trust boundary is between the authenticated user and the backend API. The backend should not trust a user just because they are logged in.

## 4. Attacker Starting Point

The attacker starts with this low-privileged employee account:

```text
Username: intern
Password: intern123
```

The attacker has:

- A valid employee login
- Access to the dashboard
- Access to one assigned document

The attacker does not have:

- Admin credentials
- Source code access while solving
- Permission to attack anything outside the local lab

## 5. Attack Surface

The important endpoints are:

```text
GET /login
POST /login
POST /logout
GET /dashboard
GET /documents/<doc_id>
GET /api/me/documents
GET /api/documents/<doc_id>
GET /api/reports/<report_id>
POST /api/admin/exports
```

The main endpoints involved in the challenge are:

```text
GET /api/documents/<doc_id>
GET /api/reports/<report_id>
POST /api/admin/exports
```

## 6. Vulnerability Description

### 6.1 IDOR / BOLA

The first vulnerability is Broken Object Level Authorization, also known as IDOR.

The application checks that the user is logged in, but it does not check that the requested document belongs to that user.

The vulnerable behavior is that the document API looks up a document by ID only:

```sql
SELECT ...
FROM documents
WHERE id = ?
```

It should also check the owner:

```sql
SELECT ...
FROM documents
WHERE id = ? AND owner_id = ?
```

Because this check is missing, the `intern` user can access a restricted document by changing the document ID.

### 6.2 Data Exposure

After accessing the restricted document, the player can see an internal report reference:

```text
report_id=7331
```

This value should not be visible to a normal employee.

It helps the player continue the chain and find the next API endpoint to test.

### 6.3 Broken Function Level Authorization

The final issue is in the admin export endpoint:

```text
POST /api/admin/exports
```

This function should require an admin user.

Instead, the endpoint only checks that the user is logged in. It does not check if:

```text
session["role"] == "admin"
```

Because of this, the `intern` user can use an admin-only function and retrieve the flag.

## 7. Intended Attack Path

The intended solution path is:

1. Start the app with Docker Compose.
2. Login as `intern`.
3. Open the assigned document.
4. Notice that the application uses numbered records.
5. Change the document ID.
6. Access the restricted document.
7. Find the leaked report ID.
8. Check the report metadata endpoint.
9. Send a POST request to the admin export endpoint.
10. Get the flag.

The exact path is:

```text
/login
/documents/1042
/documents/1044
/api/reports/7331
POST /api/admin/exports
```

With this JSON body:

```json
{
  "report_id": 7331
}
```

## 8. Impact Assessment

### Confidentiality

A low-privileged employee can read a restricted document and access a restricted security report.

### Integrity

The challenge does not intentionally allow data modification.

However, the same missing authorization pattern could be dangerous if used on update or delete endpoints.

### Availability

No availability impact is demonstrated.

### Privilege Impact

The employee can use an admin-only export function without having the admin role.

## 9. Flag Retrieval

The flag is returned only at the last step of the intended chain.

The player must send:

```text
POST /api/admin/exports
```

With:

```json
{
  "report_id": 7331
}
```

The response includes:

```json
{
  "export_status": "completed",
  "required_role": "admin",
  "current_role": "employee",
  "access_control_status": "missing admin role validation",
  "flag": "DUCK{...}"
}
```

This proves that the player reached the restricted admin export function through the intended path.

## 10. Root Cause

The root cause is missing authorization checks.

The application checks:

```text
Is the user logged in?
```

But it does not correctly check:

```text
Is this user allowed to access this object?
Is this user allowed to use this function?
```

The missing controls are:

- Document ownership check
- Report access check
- Admin role check
- Protection of internal report IDs

## 11. Remediation

To fix the issue, the backend should enforce authorization on every sensitive request.

For documents, check both the document ID and owner:

```sql
SELECT *
FROM documents
WHERE id = ? AND owner_id = ?
```

For report access, check that the user is either the owner or an admin.

For admin export jobs, check the role before processing the request:

```python
if session.get("role") != "admin":
    return jsonify({"error": "forbidden"}), 403
```

Restricted documents should also avoid exposing internal report IDs to users who are not allowed to use them.

## 12. Verification and Retest

The challenge was tested using the validation script:

```bash
python3 tests/health_check.py
```

The validation checks confirm:

- The app is running
- Login works
- The assigned document is accessible
- The restricted document is accessible through the intended BOLA issue
- The report metadata does not directly expose the flag
- The admin export endpoint returns the flag through the intended BFLA step

Expected final output:

```text
All DuckVault validation checks passed.
The intended chain is working:
BOLA / IDOR -> Excessive Data Exposure -> BFLA -> Flag
```

## 13. Unintended Attack Paths

Before submission, the following should be checked:

- The flag is not included in README.md
- The flag is not in static files
- The flag is not returned from `/api/reports/7331`
- The flag cannot be retrieved without login
- The flag is only returned through `POST /api/admin/exports`
- No real systems or third-party services are used

## 14. Conclusion

DuckVault demonstrates a realistic API authorization problem in a simple local training lab.

The main lesson is that login only proves identity. It does not prove that the user is allowed to access every object or function.

A secure application must enforce object-level authorization and function-level authorization on the backend for every sensitive request.