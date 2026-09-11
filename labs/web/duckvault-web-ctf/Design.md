# DuckVault — Challenge Design

## Learning Objective
Understand how improper object-level authorization can allow an authenticated user to access another user's resources.

## Primary Vulnerability
BOLA / IDOR

## Secondary Vulnerability
None.

## Difficulty
Easy

## Estimated Solve Time
10–20 minutes

## Attacker Starting Point
The attacker has valid credentials for the Alice account.

Role:
user

The attacker does not have Bob's credentials or administrator privileges.

## Application Scenario
DuckVault is an internal document management API.
Users can authenticate and retrieve documents associated with their accounts.
The application intentionally contains an object-level authorization failure in the document retrieval functionality.

## Intended Attack Path
1. Authenticate as Alice.
2. Enumerate Alice's documents.
3. Identify document identifiers.
4. Request a document belonging to another user.
5. Observe that the API returns the unauthorized document.
6. Extract the vault reference from the returned document.
7. Request the corresponding vault resource.
8. Retrieve the flag.

## Flag Condition
The flag is returned only after accessing the vault resource through the
intended application flow.

## Trust Boundary
Authenticated user
    |
    v
REST API
    |
    +--> Document objects
    |
    +--> Vault resources

The document endpoint fails to enforce object ownership.

## Intended Security Boundary
Alice should only be able to access documents where:
owner_id == authenticated_user.id