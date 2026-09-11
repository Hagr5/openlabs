# SnapConnect — CTF challenge

## Name

SnapConnect

## Scenario

SnapConnect is a small social app. Members get a profile with a handle, a bio, and an avatar, and everything runs through a GraphQL API. Registration is open; no credentials are handed out.

You are testing the app before its public launch.

## Objective

The app keeps a secret in `/var/www/flag.txt`, outside the web root. Read the file through the application.

- Flag format: `duck{...}`
- Difficulty: medium. Estimated solve time 30 to 45 minutes.

## Prerequisites

GraphQL queries, mutations, and introspection. The `graphql-multipart-request` format. A tool that sends raw HTTP, such as `curl`, Burp, or Insomnia.

## Startup

```bash
docker compose up -d --build
docker compose ps          # wait for "Up ... (healthy)"
curl http://localhost:8081/health.php
```

## Connection

- App: `http://localhost:8081`
- API: `POST http://localhost:8081/graphql`
- API reference: `http://localhost:8081/docs`
- Health: `http://localhost:8081/health.php`

## Reset

```bash
./scripts/reset.sh                                # full: rebuild, clear uploads and sessions
docker compose down -v && docker compose up -d    # equivalent manual form
```

## Rules

1. Test only this lab instance.
2. No brute force. Nothing in the app falls to guessing.
3. All data is fake.

---

Organizer: `docs/` contains spoilers. Do not distribute to players.
