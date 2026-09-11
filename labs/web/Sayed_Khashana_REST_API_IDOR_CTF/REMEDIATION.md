# How to Fix This Problem

## Main Fix

We should not only depend on the user being logged in to give them any object. Every time someone requests a document, the server should check that the document actually belongs to them, not only that their token is valid.

So instead of the old query that searches by the ID only, it should also check that the `owner_id` of the document is equal to the `id` of the logged-in user.

## The Right Way

Separate these two things:

* **Authentication**: Is this user really who they say they are? (This is handled by the middleware.)
* **Authorization**: Is this user allowed to see this specific document? (This must be checked in every query that gets an object.)

So instead of getting the document first and then checking if the user can see it, do the check inside the same query:

`WHERE id = ? AND owner_id = ?`

If the document does not exist or does not belong to the user, return the same response (404) in both cases, so we do not leak information that the document exists but belongs to someone else.

Codes like the "handoff code" should be very random, have a short expiration time, and be logged (audited). They should not be treated as a replacement for the real authorization check.

## Tests That Should Be Done

For every endpoint that returns an object, test:

* The owner himself → succeeds
* Another logged-in user who is not the owner → rejected
* Without login → rejected
* If there are multiple tenants → a user from another tenant → rejected

## Monitoring

Log every rejected attempt, and monitor if someone is trying many IDs one after another (this is a pattern of an exploitation attempt).

If you find a vulnerability like this, invalidate any leaked handoff codes and review the logs.
