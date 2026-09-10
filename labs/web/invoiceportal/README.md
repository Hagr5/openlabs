# README

# InvoicePortal

`medium` · `web` 

## Brief

Northwind Traders uses InvoicePortal. One invoice has a hidden flag.

Find it.

## Setup

Run these from the lab directory:

```bash
docker compose up -d
```

## **API Endpoints**

| **Endpoint** | **Method** | **Auth** | **Description** |
| --- | --- | --- | --- |
| /health | GET | None | Health check |
| /api/auth/login | POST | None | Login |
| /api/users/me | GET | Bearer | Current user |
| /api/team/members | GET | Bearer | Team members |
| /api/invoices | GET | Bearer | List invoices |
| /api/invoices/{id} | GET | Bearer | Invoice details |

## **Goal**

Find the flag, and verify:

```
python3 ../../../scripts/check.py .
```
