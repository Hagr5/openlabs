# vault-api

**MEDIUM · web**

## Brief

`vault-api` is a fictional internal employee management API. A protected employee archive is stored in the system. You receive a low-privileged analyst account and must find a way to recover the archive and its flag.

## Setup

Copy the environment template, then build and start the challenge:

```bash
cp .env.example .env
docker compose up --build -d
```

Wait for the container to become healthy, then confirm the API responds:

```bash
curl -s http://localhost:8080/health
```

The API is available at `http://localhost:8080`.

You start with the following account:

| Username | Password |
| -------- | -------- |
| `analyst` | `analyst123` |

## Goal

Recover the flag from the protected employee archive. The flag matches the format `duck{...}`.

## Rules

- Only interact with the provided challenge instance.
- Do not attempt to escape the container or attack the host system.
- Do not perform denial-of-service attacks.

## Reset

To reset the challenge to its initial state:

```bash
docker compose down -v
docker compose up --build -d
```

This restores the database and seeded data.