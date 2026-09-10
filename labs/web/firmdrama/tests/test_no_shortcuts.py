"""Checks that common alternate paths do not bypass the intended chain."""

import re

from helpers import bearer_login as login
from src.db import transaction


def test_unauthorized_and_direct_object_shortcuts_fail(client):
    headers = login(client)
    assert client.get("/api/v1/dashboards/1499", headers=headers).status_code == 404
    assert client.get("/api/v1/dashboards/1001/conversations/5001", headers=headers).status_code == 404
    assert client.get("/api/v1/dashboards/1042/conversations/5001/messages/9999", headers=headers).status_code == 404
    assert client.patch("/api/v1/users/2/profile", headers=headers, json={"role_id": 499}).status_code == 404
    assert client.patch("/api/v1/users/3/profile", headers=headers, json={"role_id": 499}).status_code == 404
    assert client.patch("/api/v1/users/1/profile", headers=headers, json={"role_id": 499}).status_code == 403
    assert client.patch("/api/v1/users/1/profile", headers=headers, json={"role_id": 3, "delegation_approval_id": "invalid"}).status_code == 400
    assert client.get("/api/v3/dashboard", headers=headers).status_code == 403
    assert client.get("/api/v1/dashboard", headers=headers).status_code == 403
    assert client.post("/api/v1/tickets/1001/preview", headers=headers, json={"body": "{{7*7}}"}).status_code == 403
    assert client.get("/home/olivia/DoNotOpenThisFolder/olivia.txt", headers=headers).status_code == 404


def test_authentication_bypass_and_token_forgery_fail(client):
    assert client.get("/api/v1/me").status_code == 401
    assert client.get("/api/v1/rooms", headers={"Authorization": "Bearer forged-token"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"username": "thisismike", "password": "wrong"}).status_code == 401


def test_delegation_is_james_scoped_and_expiry_is_enforced(client):
    headers = login(client)
    message = client.get(
        "/api/v1/dashboards/1042/conversations/5001/messages/9006",
        headers=headers,
    )
    assert message.status_code == 200
    approval_match = re.search(r"approval ID: (dleg_[A-Za-z0-9_-]+)", message.get_json()["body"])
    assert approval_match

    with transaction() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT intended_user_id, delegated_role_id, consumed_at FROM delegation_approvals"
            )
            approval_record = cursor.fetchone()
            assert approval_record == {
                "intended_user_id": 2,
                "delegated_role_id": 499,
                "consumed_at": None,
            }
            cursor.execute(
                "UPDATE delegation_approvals SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)"
            )

    response = client.patch(
        "/api/v1/users/1/profile",
        headers=headers,
        json={"role_id": 499, "delegation_approval_id": approval_match.group(1)},
    )
    assert response.status_code == 403
    assert client.get("/api/v1/me", headers=headers).get_json()["role_id"] == 1
