# cloudvault design

## Concept

CloudVault is a document-ingestion platform. A low-privileged user can ask the platform to import a document from a URL. A separate internal worker fetches that URL. The public GraphQL API is the only service a player reaches directly. Everything else is reached through the vulnerability chain.

## Metadata

- Track: web
- Difficulty: hard
- Flag format: duck{...}

## Learning objective

Understand how trust-boundary confusion across a multi-service architecture allows a low-privileged API user to pivot into a privileged internal service.

## Vulnerabilities

| ID | Name | Component |
|----|------|-----------|
| V1 | TOCTOU in validation state | cloudvault-api |
| V2 | SSRF through the fetch feature | import-worker |
| V3 | Redirect bypass of initial-URL validation | import-worker |
| V4 | Trust-by-network-location | metadata-service |
| V5 | Valid Bearer authentication | internal-vault-api |
| V6 | Client-controlled role escalation | internal-vault-api |

V1 and V2/V3 are independently exploitable. V1 is not a prerequisite for reaching the SSRF chain.

## Architecture

Five containers on two Docker networks.

| Service | Network | Host port |
|---|---|---|
| cloudvault-api | public-net, internal-net | 8080 |
| import-worker | internal-net | none |
| metadata-service | internal-net | none |
| sample-library | internal-net | none |
| internal-vault-api | internal-net | none |

Only cloudvault-api is reachable from the host.

## Trust boundaries

1. Player to cloudvault-api. The only boundary the player crosses directly.
2. cloudvault-api to import-worker. Shared-secret authenticated.
3. import-worker to metadata-service, sample-library, internal-vault-api. Worker-only network segment.
4. internal-vault-api to vault data. Bearer-token authentication and role check.

## Attacker starting point

- Account: player / changeme123
- Role: low-privileged player
- Network access: localhost:8080 only
- No knowledge of internal services

## Discovery

The seeded account holds one import job pointing at a sample URL. The player finds it through the ordinary jobs query, executes it, and reads a credential from the result. That credential unlocks the next stage.

## Flag condition

The flag is the value field of a protected vault entry. Reaching it requires exploiting V5 and V6.

## Reset

docker compose down -v removes the database volume. docker compose up -d recreates a clean state.

## Safety

All credentials and tokens are synthetic. No outbound network calls are made by the challenge.
