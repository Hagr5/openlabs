# Challenge Name

Nexora — Integration & Developer Platform

# Scenario

You have access to Nexora, a SaaS integration and developer platform. Nexora production infrastructure is hosted on Google Cloud Platform.

# Objective

Investigate Nexora's infrastructure and identify a way to reach resources that should not be directly accessible from the public application. .

# Difficulty

Medium

# Prerequisites

Basic web application reconnaissance, HTTP fundamentals, REST API basics, GraphQL basics, DNS basics, familiarity with server-side requests, and basic Docker/networking knowledge are helpful.

# Startup Instructions

```sh
docker compose up --build
```

# Connection Information

Application: http://localhost:8080

OAST: http://localhost:8081

# OAST Service

The challenge includes a local OAST service that you may use to observe DNS and HTTP interactions generated during testing. It is a replareplacement for burp suite collaborator. Open the dashboard to observe interactions.

# Reset Instructions

```sh
docker compose down -v
docker compose up --build
```

# Flag Format

`duck{****_**_*******}`
