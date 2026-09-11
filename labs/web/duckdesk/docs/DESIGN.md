# DuckDesk — Design Document

## Metadata

- **Learning Objective:** Understand how input-type reuse across endpoints can expose hidden fields on public queries, enabling blind data extraction via count oracles.
- **Primary Vulnerability:** GraphQL field-level authorization failure — `passwordHash` filter exposed on a public unauthenticated query (`teamStats`).
- **Secondary Weakness:** Legacy unsalted MD5 password hashing + weak admin password (crackable with standard wordlist).
- **Difficulty:** Medium
- **Estimated Time:** 60–120 minutes
- **Prerequisites:** GraphQL/introspection familiarity, scripting ability, `john` + `rockyou.txt` for offline cracking.

## Architecture

```
┌─────────────┐     POST /graphql      ┌──────────────┐
│   Player    │ ──────────────────────> │  Apollo Server │
│  (Browser)  │ <────────────────────── │  + Resolvers   │
└─────────────┘                        └──────┬───────┘
                                               │
                                          ┌────▼─────┐
                                          │ SQLite   │
                                          │ (seeded) │
                                          └──────────┘
```

- Single Node.js service with Apollo Server.
- SQLite database seeded on first boot from environment variables.
- JWT HS256 authentication for protected endpoints.
- CORS enabled (`*`) — Bearer-token auth only, no cookies.

## Trust Boundaries

| Boundary | Protection | Notes |
|----------|-----------|-------|
| Public queries (serviceStatus, articles, teamPage, teamStats) | None | No auth required |
| Viewer, tickets, ticket, agents | JWT verification | HS256 with env secret |
| Vault | JWT + role check | ADMIN only |
| Login | Rate limiting (5 attempts / 10 min lockout) | Per email |

## Attack Surface

- **POST /graphql** — Main GraphQL endpoint with GraphiQL playground at `/`.
- **GET /healthz** — Health check, no auth.
- Introspection enabled — full schema visible to all players.
- No debug endpoints, no stack traces in errors, no file upload, no SSRF.

## Intended Attack Path

1. Open the GraphQL Playground at `/` and run introspection.
2. Query `teamPage` to discover the target: "Head of Support" = Drake Mallard.
3. Note that public `teamStats(filter: AgentFilter)` accepts an input type with `passwordHash: StringFilter`.
4. Use `{displayName:{eq:"Drake Mallard"}, passwordHash:{startsWith:"<prefix>"}}` as a blind boolean oracle — headcount returns 1 or 0.
5. Extract the 32-character lowercase hex MD5 hash character-by-character (≤16 requests per character, optimizable with aliases).
6. Crack offline: `john --format=raw-md5 --wordlist=rockyou.txt hash.txt`.
7. Login as Drake Mallard with the cracked password to obtain a JWT.
8. Query `vault` with admin token → find the DUCK{...} value = flag.

## Reset & Determinism

- Database is seeded from deterministic code on first boot (UUIDs generated at startup).
- `docker compose down -v && docker compose up -d` destroys and recreates the volume, re-seeding fresh data.
- All timestamps are fixed ISO strings — no runtime-dependent values in seed data.
- The admin password is "donald" (verified present in rockyou.txt).
