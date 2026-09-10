# Challenge Design: Northstar Document Hub

## Learning Objective

The main idea is to teach API authorization testing.

The player has a valid account, but he should understand that this does not mean he can access other users documents.

The main thing to notice is the difference between authentication and authorization.

## Vulnerability

There is one intentional vulnerability in the challenge.

The vulnerability is IDOR/BOLA in the document API.

The player needs to be logged in, but the server does not properly check if the document belongs to the logged-in user.

The other parts of the application should work normally.

## Scenario

Northstar is a fictional company with an internal website for projects and documents.

The player gets the Alex Ward account.

Alex has his own project and document.

Mira has another project and a private document.

The player does not have Mira's account.

## Starting Point

The player only gets the website URL and Alex's login details.

They can use the website or an API tool like Postman.

They should not use the source code, database, Docker files, shell, or admin access to solve the challenge.

The challenge should be solved using the website and API.

## Expected Path

The player first logs in as Alex.

Then they look at the normal requests and documents.

There is a clue in the application that points to another document.

The player changes the document ID in the request and sends it with Alex's token.

The server returns Mira's document even though it does not belong to Alex.

The document contains a handoff code and a review request number.

The player uses these values to request the receipt.

The receipt then returns the flag.

## Flag

The flag is not directly returned from the IDOR.

The player needs the handoff code from the document to get the receipt.

If the code is missing or wrong, the receipt request is rejected.

## Difficulty

The challenge is easy to medium.

The player already has a valid account and there is a clue inside the application.

The player does not need to guess random secrets.

The main challenge is finding that the document ownership check is missing.

## Scope

This is a local and fictional CTF.

The only intended vulnerability is the document IDOR/BOLA.

The rest of the application should keep working normally.
