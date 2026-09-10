# DuckDesk

Duckurity's internal IT helpdesk API — used by the Support team to manage tickets, track incidents, and maintain the knowledge base.

## Objective

Gain access to the Head of Support's account and retrieve the secret from Duckurity's internal vault.

## Difficulty

Medium — requires GraphQL introspection, scripting, and offline password cracking.

## Prerequisites

- `rockyou.txt` wordlist (or equivalent) for offline cracking
- A HTTP client (curl, browser dev tools, or any GraphQL client)

## Getting Started

1. Create your local environment file:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to set a JWT secret and the vault's incident response code.

2. Start the lab:
   ```bash
   docker compose up -d
   ```

3. The API is available at **http://localhost:4000** — open it in a browser for the API landing page, or use curl/your preferred client against the `/graphql` endpoint.

4. Demo account (low-privilege Support Agent):
   - Email: `quackers@duckurity.example`
   - Password: `QuackP@ss2026!`

## Flag Format

```
DUCK{...}
```

## Rules

- Attack only the lab environment.
- Offline cracking is expected — the extracted hash should be crackable with a standard wordlist.
- No other credentials are needed beyond what you discover in the API.

## Resetting

To reset to initial state:
```bash
docker compose down -v && docker compose up -d
```

This re-seeds the database and restores all original data.
