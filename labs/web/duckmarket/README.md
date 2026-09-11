# DuckMarket

**A Duckurity platform security lab — achieve remote code execution in the platform's managed Node.js function runtime and retrieve the secret stored there.**

- **Difficulty:** Medium-Hard
- **Estimated solve time:** 2–3 hours
- **Prerequisites:** GraphQL mutations & introspection, HTTP sessions & CSRF tokens, basic Node.js, light scripting (curl or Python)

---

## Scenario

DuckMarket is the flagship marketplace of **Duckurity, Inc.** — premium rubber ducks and developer merchandise for serious engineering teams. The platform ships a storefront, an account/profile REST API and an internal catalog service.

Somewhere in the platform there is a way to make the server run code of your choosing. Find it, execute it in the managed runtime, and read the secret that only exists inside that environment.

## Objective

Achieve remote code execution in the platform's managed Node.js function runtime and retrieve the secret stored there.

The secret has the format `DUCK{...}` and is only readable from inside the function runtime environment. Nothing in the platform's database, source or configuration contains it.

## Getting started

```bash
docker compose up -d
```

Then open: **http://localhost:4000**

Allow ~30 seconds for both services to pass their health checks (verify with `curl http://localhost:4000/api/healthz`).

## Test account

| Field | Value |
|---|---|
| Email | `daffy@duckurity.example` |
| Password | `DuckSeason2024!` |

This is a standard customer account. There is also an internal operations account, but its credentials are not published.

## The rules

- Attack **only** this lab instance. It runs offline in Docker; nothing should ever leave your machine.
- No brute-forcing of credentials, no denial-of-service, no attacks against the Docker host.
- The intended solution is entirely application-level. If you find yourself attacking the infrastructure, you're off track.

## Resetting the environment

```bash
docker compose down -v && docker compose up -d
```

This wipes all state you created and restores the exact initial deployment.

## Flag format

`DUCK{...}` — e.g. `DUCK{example_value_here}`.

## Hints (progressive, read only if stuck)

<details><summary>Hint 1</summary>

The storefront is only part of the platform. What other services does a modern SaaS expose to its users — and where would a leftover reference to one live?

</details>

<details><summary>Hint 2</summary>

Read the storefront's client-side JavaScript carefully. Frontend bundles often contain endpoint references for features that are not linked in the UI yet.

</details>

<details><summary>Hint 3</summary>

Once you find an undocumented API, interrogate its schema thoroughly. Enumerate every type and every mutation, and ask of each one: *who* is allowed to call this, and *what* does it actually do underneath?

</details>

---

*Good luck. Ship calmer. Ship with a duck.* 🦆
