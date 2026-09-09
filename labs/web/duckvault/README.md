# DuckVault

## Overview

DuckVault is a small internal employee records portal.

Employees use it to view their assigned documents and some related internal notes. In this challenge, you are given a normal employee account and your goal is to explore the application and find the hidden flag.

## Scenario

You are logged in as a low-privileged employee. The portal gives you access to your workspace and the records assigned to your account.

Try to understand how the application works and how it loads its data.

## Objective

Find the hidden flag.

## Difficulty

Easy / Medium

## Estimated Time

25–35 minutes

## What You Need

Basic knowledge of:

- Web pages and URLs
- HTTP requests
- GET and POST requests
- Browser DevTools, curl, Postman, or Burp Suite

## How to Run

From the project folder, run:

```bash
docker compose up --build
```

Keep this terminal open while using the challenge.

## How to Open

Open this link in your browser:

```text
http://localhost:8000/login
```

Login with:

```text
Username: intern
Password: intern123
```

## Health Check

To make sure the app is running, open:

```text
http://localhost:8000/health
```

You should see:

```json
{
  "status": "ok"
}
```

## Reset

To reset the challenge, run:

```bash
docker compose down --volumes
docker compose up --build
```

## Flag Format

```text
DUCK{...}
```

## Rules

- Only test this local lab.
- Do not attack any real website or third-party service.
- Do not use real accounts or real credentials.
- Do not modify the source code while solving.
- Do not use destructive testing.

## Notes

This challenge is made for API/Web security practice and runs locally using Docker.
