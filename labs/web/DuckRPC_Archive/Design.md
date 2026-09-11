# DuckRPC Archive — Challenge Design Document

## 1. Challenge Identity
### Challenge Name
DuckRPC Archive

### Category
API Security / gRPC Security / Input Validation and Injection

### Difficulty
Medium

### Primary Vulnerability Family
Core Input Validation & Injection

### Primary Vulnerability
SQL Injection

### Secondary Vulnerability
None intentionally included.

---

## 2. Learning Objective
The primary learning objective is to teach participants that modern API protocols such as gRPC are not inherently protected against traditional application vulnerabilities.

Participants should learn to:
* Enumerate gRPC services.
* Identify RPC methods.
* Inspect gRPC message definitions.
* Authenticate to a gRPC application.
* Use metadata for authenticated requests.
* Test user-controlled gRPC fields.
* Identify SQL injection through behavioral testing.
* Enumerate an SQLite database.
* Extract sensitive data through an intended vulnerability.

---

## 3. Application Scenario
DuckRPC Archive is presented as an internal company document archive service.
Employees can authenticate using their company credentials and search internal documents.
The application uses a gRPC interface rather than a traditional REST API.
The scenario is intended to be believable because internal services may use gRPC for service communication and application functionality.

---

## 4. Attacker Starting Point
The participant begins with:
* Access to the local challenge environment.
* Valid standard employee credentials.
* No privileged role.
* No direct database access.
* No access to the internal sensitive records.

Provided credentials:

```text
Username: alice
Password: AliceArchive2026!
```

The attacker must investigate the available functionality rather than being given the vulnerable method directly.

---

## 5. Intended Attack Path

```text
Start
  |
  v
Identify gRPC service
  |
  v
Enumerate available services
  |
  v
Discover AuthService
  |
  v
Enumerate Login method
  |
  v
Inspect Login request structure
  |
  v
Authenticate with provided credentials
  |
  v
Receive authentication token
  |
  v
Discover ArchiveService
  |
  v
Enumerate SearchDocuments method
  |
  v
Inspect SearchRequest message
  |
  v
Send authenticated search requests
  |
  v
Test query input
  |
  v
Identify SQL injection
  |
  v
Determine query structure
  |
  v
Enumerate database tables
  |
  v
Identify internal_records table
  |
  v
Extract internal record
  |
  v
Retrieve Flag
```

---

## 6. Difficulty Justification
The challenge is classified as Medium.
The challenge does not expose the vulnerable endpoint and attack path directly.
A participant must perform chained investigation steps including:
* Service enumeration.
* Method enumeration.
* Message discovery.
* Authentication.
* Metadata handling.
* Input testing.
* SQL injection exploitation.
* Database enumeration.

The challenge requires reasoning and investigation rather than a single request directly retrieving the flag.

---

## 7. Flag Condition
The challenge flag is stored in a database record that is not returned by normal document search functionality.
The participant must cross the intended database access boundary through the SQL injection vulnerability.
The flag condition proves successful exploitation of the intended vulnerability.

---

## 8. Security Boundaries
The relevant boundaries are:
1. Participant to gRPC service.
2. Unauthenticated access to authenticated functionality.
3. Authenticated employee access to normal document records.
4. Application search functionality to SQLite database.
5. Normal document data to sensitive internal records.

The intended vulnerability crosses the final boundary by allowing the attacker to influence the SQL query.

---

## 9. Controlled Scope
The challenge operates only inside the provided Docker environment.
The application:
* Does not require external targets.
* Does not contact external services.
* Does not perform destructive actions.
* Does not require real accounts.
* Uses a local SQLite database.
* Uses controlled challenge credentials.
* Uses a controlled flag.

---

## 10. Minimal Noise
The challenge intentionally avoids adding unrelated vulnerabilities.
The implementation does not intentionally include:
* BOLA.
* IDOR.
* Authentication bypass.
* Privilege escalation.
* GraphQL.
* REST endpoints.
* SSRF.
* Command injection.
* File upload vulnerabilities.

The intended learning objective remains focused on SQL injection in a gRPC application.

---

# FILE: REMEDIATION.md

# DuckRPC Archive — Remediation Documentation

## Vulnerability

SQL Injection in:

```text
duckrpc.ArchiveService.SearchDocuments
```

---

## Root Cause
The vulnerable implementation directly incorporates the user-controlled search value into a SQL statement.
Unsafe construction allows SQL syntax supplied by the attacker to alter the intended query.

---

## Vulnerable Pattern

```python
sql = f"""
    SELECT id, title, owner, content
    FROM documents
    WHERE title LIKE '%{query}%'
"""

cursor.execute(sql)
```

The value of `query` must never be inserted directly into SQL syntax.

---

## Recommended Fix
Use a parameterized SQL statement.

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

---

## Required Security Controls
The following controls should be applied:

### 1. Parameterized Queries
All user-controlled values must be passed as SQL parameters.
Do not construct SQL statements through:
* String concatenation.
* f-strings.
* String formatting.
* Template interpolation.

---

### 2. Input Validation
Input validation may be used as an additional defense, but validation alone must not be relied upon to prevent SQL injection.
The primary control must be parameterized queries.

---

### 3. Least Privilege
Where supported by the database architecture, application database access should be restricted to the minimum privileges required.
The application should not have unnecessary access to unrelated sensitive records.

---

### 4. Data Separation
Sensitive application data should be logically separated from data accessed by standard application functionality where appropriate.
This reduces the potential impact of a database query compromise.

---

### 5. Security Testing
Regression testing should include common SQL injection payloads.
Examples include:

```text
' AND 1=1 -- 
```

```text
' UNION SELECT 1, name, 'x', 'x' FROM sqlite_master -- 
```

The secure application must treat these values as ordinary search input.

---

## Secure Behavior
After remediation:
* Normal document searches must continue to work.
* SQL injection payloads must not modify query structure.
* Database metadata must not be returned.
* Sensitive internal records must remain inaccessible through the search method.