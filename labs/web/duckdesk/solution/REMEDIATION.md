# DuckDesk — Remediation Guide

## Root Cause

The `teamStats` query accepts the same `AgentFilter` input type used by the admin-only `agents` query. This filter includes a `passwordHash: StringFilter` field, built for directory search capabilities on the admin page. Since `teamStats` is public and returns only a count (not individual records), players can use `startsWith`, `contains`, or other string operators to extract the password hash character-by-character via a blind boolean oracle.

## Fixes

### 1. Per-Endpoint Filter Allowlists (Recommended)

Define separate input types for each endpoint that uses filtering:

```graphql
input PublicAgentFilter {
  displayName: StringFilter
  department: StringFilter
  role: RoleFilter
  isActive: Boolean
}

input AdminAgentFilter {
  displayName: StringFilter
  email: StringFilter
  department: StringFilter
  role: RoleFilter
  isActive: Boolean
  hiredAfter: DateTime
  hiredBefore: DateTime
  passwordHash: StringFilter
}
```

Then use `PublicAgentFilter` on `teamStats` and `AdminAgentFilter` on `agents`.

### 2. Require Authentication on Stats

Simply add an auth check to `teamStats`:

```javascript
teamStats: (_, { filter }, contextValue) => {
  requireAuth(contextValue); // ← Add this line
  // ... existing logic
}
```

### 3. Never Expose Hash Column in Public Filters

Audit all public queries for fields that reference sensitive columns (passwordHash, apiKey, secretToken). If a column is only needed internally, exclude it from public input types.

## Secondary Fixes

### Password Hash Migration

The admin password uses legacy unsalted MD5:
- Migrate to `argon2id` or `bcrypt` with appropriate work factors.
- Enforce minimum password length (12+ characters) for new accounts.
- Add a migration flag on the agent record to track which accounts still use MD5.

### Password Policy

```javascript
// On login, enforce:
if (password.length < 8) throw new Error('Password too short');
if (!/[A-Z]/.test(password)) throw new Error('Password must contain uppercase letter');
if (!/\d/.test(password)) throw new Error('Password must contain a number');
```

### Regression Tests

Add tests that verify:
1. `teamStats` with `passwordHash` filter returns correct count.
2. `teamPage` does NOT include password hash in response.
3. Unauthenticated access to `vault` returns authorization error.
4. Login lockout engages after 5 failed attempts.
