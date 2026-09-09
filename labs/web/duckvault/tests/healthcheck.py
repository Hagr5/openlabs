import sys
import requests

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5000"
r = requests.get(f"{base}/health", timeout=5)
r.raise_for_status()
assert r.json().get("status") == "ok"
print("healthcheck: PASS")
