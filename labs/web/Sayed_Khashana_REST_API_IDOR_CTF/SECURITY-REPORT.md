# Security Report: Northstar Document Hub

## 1. Quick Summary

The challenge has one intentional vulnerability: a normal employee (analyst) has limited permissions, but if they change the ID in the request, they can view a document that does not belong to them.

This document contains a secret piece of information (a code) that allows them to reach the last step and get the flag.

## 2. The Application

It is a single Node.js server with a simple page. It uses a bearer token for login and a local SQLite database.

Docker only opens port 3000.

## 3. What the Player Has

The player only gets an Alex Ward account. This means they do not have direct access to the server, files, or database. They can only use the website and the API.

## 4. What Is Available in the Website

There are endpoints for:

* Login
* User information
* Projects
* Documents
* Announcements
* Receipts

They all need a token, and the ownership check works correctly for projects.

## 5. The Vulnerability and Its Cause

**Location:** `GET /api/documents/:id`

**What should happen:** If you request a document that does not belong to you, the request should be rejected.

**What actually happens:** The server checks that you are logged in and that the document exists, but it does not check that the document actually belongs to you.

So the reason is: there is a check for "Who are you?" (authentication), but there is no check for "Are you allowed to access this?" (authorization).

## 6. Exploitation Steps (Actually Tested)

1. We requested all documents - only one document belonging to us was returned.
2. We requested our document using its ID - it worked normally.
3. We changed the ID to Mira's document - it opened too, and it contained a secret code.
4. We tried to request the receipt without the code - it was rejected.
5. We used the stolen code - it worked and returned the flag.

## 7. Impact

In a real system, this vulnerability could leak private documents between different users.

Here, we used it to reach the last step (the receipt) and get the flag.

## 8. Fix

Every endpoint that returns an object should check that the user actually owns it, not only that they are logged in.

The details are in `REMEDIATION.md`.

## 9. Tests

We ran `npm test` and all cases passed (normal access, rejection, exploitation, and the flag).

We also ran `npm run audit` to make sure the flag was not leaked somewhere else, such as the code or website files.

## 10. Things We Checked to Make Sure There Were No Other Vulnerabilities

We reviewed the website files, Docker settings, and the other routes.

There is no other way to get the flag except through the path described above.

## 11. Conclusion

The challenge has one main IDOR/BOLA vulnerability, and the exploitation path is clear and specific.
