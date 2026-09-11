# DuckRPC Archive
DuckRPC Archive is an internal document archive service exposed through gRPC.
Employees can authenticate and search archived documents using the available gRPC services.
Some internal records are stored separately from the normal document archive.

## Brief
DuckRPC Archive is used internally to search company documents.
You have been provided with valid employee credentials and access to the gRPC service.
Investigate the available gRPC services and determine whether the document search functionality can expose sensitive internal records.
The challenge service is available locally at:

```text
localhost:50051
```

The service uses gRPC and is not exposed through REST or GraphQL.

### Credentials

```text
Username: alice
Password: AliceArchive2026!
```

## Goal
Retrieve the challenge flag by exploiting the intended vulnerability in the DuckRPC Archive service.
The flag follows this format:

```text
duck{...}
```

## Difficulty
Medium
This challenge requires multiple steps, including service enumeration, authentication, vulnerability identification, database enumeration, and exploitation.

## Prerequisites
* Basic knowledge of gRPC
* Basic knowledge of API authentication
* Familiarity with SQL injection
* Familiarity with a gRPC client such as `grpcurl`

## Setup
Start the challenge from the lab directory:

```bash
docker compose up --build
```

The gRPC service will be available at:

```text
localhost:50051
```

## Reset
To reset the challenge environment:

```bash
docker compose down --remove-orphans
docker compose up --build
```

## Rules
* Perform testing only against the provided local challenge environment.
* Do not target external systems or services.
* Do not modify the challenge source code while solving it.

## Flag Format

```text
duck{...}
```
