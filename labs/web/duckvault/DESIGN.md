# DuckVault Design Document

## Challenge Name

DuckVault

## Challenge Type

API / Web Security CTF

## Scenario

DuckVault is a small internal employee records portal.

Employees use the portal to view assigned documents and internal notes. Some records are connected to internal report workflows used by the security administration team.

The challenge runs locally using Docker and is made only for training.

## Learning Objective

The goal of this challenge is to show that login alone is not enough to protect API resources.

A user may be authenticated, but the backend still needs to check whether this user is allowed to access a specific object or use a specific function.

## Vulnerability Chain

The challenge is based on this chain:

```text
IDOR / BOLA -> Data Exposure -> Broken Function Level Authorization -> Flag
```

## Primary Vulnerability

The main vulnerability is Broken Object Level Authorization, also known as IDOR.

The application checks that the user is logged in, but it does not check if the requested document belongs to the current user.

Because of this, a normal employee can change a document ID and access a restricted document.

## Secondary Issues

## Data Exposure

A restricted document exposes an internal report ID.

This report ID should not be visible to a normal employee because it helps the attacker continue the chain.

## Broken Function Level Authorization

The admin export endpoint should only be used by an admin user.

However, the endpoint only checks that the user is logged in. It does not check the user role before processing the export request.

## Difficulty

Easy / Medium

## Estimated Solve Time

25–35 minutes

## Required Skills

The player should know the basics of:

- URLs and endpoints
- HTTP GET and POST requests
- Browser DevTools, curl, Postman, or Burp Suite
- Sessions and cookies
- Authentication vs authorization

## Attacker Starting Point

The attacker starts with a normal employee account:

```text
Username: intern
Password: intern123
```

This user is not an administrator.

## Roles

## intern

This is a low-privileged employee account.

The user should only be able to access their own assigned documents.

## administrator

This is a privileged account that owns restricted records and reports.

The administrator password is randomly generated and is not given to the player.

## Intended Attack Path

1. The player logs in as `intern`.
2. The player opens the assigned document from the dashboard.
3. The document mentions that older records were migrated from a legacy numeric sequence.
4. The player changes the document ID in the URL.
5. The player accesses a restricted document that belongs to another user.
6. The restricted document exposes an internal report ID.
7. The player checks the report metadata endpoint.
8. The metadata shows that a full report export requires an admin export job.
9. The player sends a POST request to the admin export endpoint.
10. The admin export endpoint returns the flag because it does not check the user role.

## Flag Condition

The flag is returned only when the player successfully uses the admin export endpoint with the leaked report ID.

## Flag Format

```text
DUCK{...}
```

## Deployment

The challenge is deployed using Docker Compose.

Run:

```bash
docker compose up --build
```

The application runs on:

```text
http://localhost:8000
```

## Reset

To reset the challenge:

```bash
docker compose down --volumes
docker compose up --build
```

## Safety

The challenge is self-contained and runs locally.

It does not require:

- Public targets
- Real accounts
- Real credentials
- Third-party services
- Destructive testing
- External internet access

## Notes

The challenge is designed to be simple, realistic, and easy to reset.

The main focus is authorization logic, not brute force, malware, persistence, or attacking real systems.