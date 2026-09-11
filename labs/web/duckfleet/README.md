# DuckFleet

**Duckurity Fleet Operations — internal telemetry console (preview deployment)**

DuckFleet is the live operations console for Duckurity's delivery fleet: dispatchers
sign in and watch vehicle telemetry update in real time. The console is a
single-page app backed by a gRPC service mesh fronted by a gRPC-Web gateway.

## Scenario

You are an external security reviewer. Duckurity has given you a standard
dispatcher account and a copy of this preview deployment so you can assess it
before it goes to production. Somewhere behind the gateway, an admin-only
backend operation holds the fleet platform's secret token. Your objective: **find
a way to reach it**.

The secret token looks like this: `DUCK{...}`

## Difficulty

Hard — estimated 3–5 hours for an experienced tester.

## Prerequisites

- HTTP traffic inspection (browser DevTools or an intercepting proxy)
- Protobuf wire-format basics (varints, tags, length-delimited fields)
- gRPC and gRPC-Web protocol basics (frames, trailers, status codes)
- gRPC server reflection
- Scripting HTTP clients (Python, Node, or similar)
- JWT basics (structure, claims, signature verification)

## Running the lab

This lab is fully self-contained and runs offline once the images are built.
All traffic stays on your machine.

```bash
cp .env.example .env
# edit .env and set FLAG to the secret token for your session
docker compose up -d --build
```

Open the console at **http://localhost:4000**.

If port 4000 is already in use on your machine, publish the gateway elsewhere:

```bash
GATEWAY_PORT=4001 docker compose up -d --build
```

Sign in with the standard dispatcher account:

- Email: `dispatch@duckurity.example`
- Password: `fleetflow-2024`

## Resetting

The backend database is seeded deterministically. To restore the exact initial
state at any time:

```bash
docker compose down -v
docker compose up -d
```

## Rules

- This is an offline lab. Do not point any tooling at systems outside your own machine.
- No denial-of-service testing — the event stream is rate-generous by design.
- The secret token is only counted when returned by the backend operation itself.

## Layout

- `gateway/` — edge gateway (serves this console, bridges gRPC-Web to gRPC)
- `backend/` — internal gRPC services and telemetry emitter
- `protos/` — service contracts
- `docs/` — deployment notes
