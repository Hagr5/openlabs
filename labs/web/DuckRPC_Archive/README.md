# DuckRPC Archive

## Scenario
DuckRPC Archive is an internal document archive service used by employees to access and search company documents.
The application exposes its functionality through a gRPC interface.
You have been provided with access to a standard employee account.
Some internal information may be accessible through the available services.
Your task is to investigate the application and retrieve the challenge flag.

---

## Objective
Investigate the DuckRPC Archive service and retrieve the challenge flag.

---

## Difficulty
Medium

---

## Prerequisites
The following knowledge and tools may be useful:
* Basic understanding of gRPC
* API and service enumeration
* Authentication tokens and request metadata
* Basic database and input testing concepts
* Docker and Docker Compose
* A gRPC client such as `grpcurl`

---

## Starting Point
You have been provided with the following employee credentials:

```text
Username: alice
Password: AliceArchive2026!
```

The application exposes a gRPC service locally.

---

## Startup
Start the challenge with:

```bash
docker compose up --build
```

The gRPC service will be available at:

```text
localhost:50051
```

---

## Connection Information

Protocol:

```text
gRPC
```

Address:

```text
localhost:50051
```

The challenge service is configured without TLS for local training purposes.
Example connection test:

```bash
grpcurl -plaintext localhost:50051 list
```

---

## Reset
To reset the challenge to its initial state:

```bash
docker compose down --remove-orphans
docker compose up --build
```

The challenge database is initialized automatically when the application starts.
Any previously issued authentication tokens become invalid after the service is restarted.

---

## Flag Format
The flag follows this format:

```text
duck{...}
```

---

## Rules
* Perform testing only against the provided local challenge environment.
* Do not target external systems or services.
* Do not modify the challenge source code while solving the challenge.
* Do not inspect or extract the flag directly from configuration files, environment variables, container metadata, or source code.
* Retrieve the flag through the intended application behavior.

---

## Notes
This challenge is designed as a controlled local training environment.
The challenge should be solved through investigation and interaction with the exposed gRPC services.