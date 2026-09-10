# switf01-hit3

`hard` · `web`

## Brief

You have read-only access to a task-management platform used by a small development team. Your account is the lowest-privilege tier, you can view projects you belong to and interact with tasks assigned to you.

The platform exposes three protocols: a REST API, a GraphQL endpoint, and a gRPC service. Each protocol reveals something the others hide. Work through the layers in order. The flag is held behind a limit that the visible interface enforces but the hidden service ignores.

Starting credentials: `swilam` / `swift123`

## Setup

Run these from the lab directory:

```bash
docker compose up --build -d
```

Wait until all services report ready (about 20–30 seconds on first run).

| Service | Address |
|---|---|
| Web application | `http://localhost:3000` |
| GraphQL endpoint | `http://localhost:4000/graphql` |
| gRPC service | `localhost:50051` |

To reset the environment to its original state:

```bash
docker compose down -v && docker compose up --build -d
```

## Goal

Obtain the flag that appears in the gRPC admin list when the admin count reaches six. Verify the solve from the lab directory:

```bash
python3 ../../../scripts/check.py .
```
