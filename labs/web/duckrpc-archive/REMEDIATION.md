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