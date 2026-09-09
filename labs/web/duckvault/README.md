# DuckVault

Difficulty: `medium`  
Track: `web`

## Brief

DuckVault is an employee records portal.

You have a normal employee account. The portal shows assigned records and loads data from internal API endpoints.

Some records were moved from a legacy archive.

## Setup

Start the lab.

```bash
docker compose up -d
```

The lab runs on port `8378`.

Open `http://localhost:8378/login`.

Use this account.

```text
Username: intern
Password: intern123
```

## Goal

Find the flag.

Check your solve from the repository root.

```bash
python3 scripts/check.py labs/web/duckvault
```

The flag format is `duck{...}`.
