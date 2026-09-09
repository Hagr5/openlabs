# DuckVault CTF Challenge

## Scenario
DuckVault is an internal document management API used by employees to store and access company documents.
You have been provided with access to a standard user account.
Some sensitive information may be accessible through the application's API.

## Objective
Investigate the DuckVault API and retrieve the challenge flag.

## Difficulty
Easy

## Prerequisites
* Basic knowledge of HTTP and REST APIs
* Basic API enumeration
* Familiarity with authentication tokens
* A tool such as Burp Suite, curl, or a web browser

## Starting Point
Use the following credentials:

```text
Username: alice
Password: AliceVault2026!
```

The application is available at:

```text
http://localhost:8000
```

## Startup
Start the challenge with:

```bash
docker compose up --build
```

Then access:

```text
http://localhost:8000
```

## Reset
To reset the challenge to its initial state:

```bash
docker compose down --remove-orphans
docker compose up --build
```

The challenge initializes its data automatically on startup.

## Flag Format
The flag follows this format:

```text
duck{...}
```

## Rules
* Perform testing only against the provided local challenge environment.
* Do not target external systems or services.
* Do not modify the challenge source code while solving it.