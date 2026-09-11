# techvault

`hard` · `web`

## Brief

TechVault is an online laptop retailer. The storefront runs entirely on a GraphQL API behind a single `/graphql` endpoint — accounts, catalog, and a few internal tools all live there. You start with outside-customer access only. Find your way to a real account, then work the API toward the hidden internal data.

## Setup

Run these from the lab directory:

```bash
cp .env.example .env
docker compose up --build -d
```

Open `http://localhost:4000/graphql`.

## Goal

Find your way into a real account. Chain what the API gives you from there. Extract the flag. Verify the solve from the lab directory:

```bash
python3 ../../../scripts/check.py .
```
