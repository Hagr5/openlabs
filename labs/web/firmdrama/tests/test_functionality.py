"""Core functionality and intentional vulnerability-stage integration tests."""

import re

from helpers import bearer_login as login
from src.db import transaction


def test_login_and_profile(client):
    headers = login(client)
    response = client.get("/api/v1/me", headers=headers)
    assert response.status_code == 200
    assert response.get_json()["role_id"] == 1
    assert response.get_json()["dashboard_id"] == 1001


def test_intended_dashboard_bola_exposes_james_dashboard(client):
    headers = login(client)
    assert client.get("/api/v1/dashboards/1001", headers=headers).status_code == 200
    response = client.get("/api/v1/dashboards/1042", headers=headers)
    assert response.status_code == 200
    assert response.get_json()["owner"]["id"] == 2


def test_intended_profile_bopla_requires_stolen_delegation_approval(client):
    headers = login(client)
    ordinary_save = client.patch(
        "/api/v1/users/1/profile",
        headers=headers,
        json={"display_name": "Mike", "role_id": 1, "delegation_approval_id": "NULL"},
    )
    assert ordinary_save.status_code == 200
    assert ordinary_save.get_json()["role_id"] == 1
    rejected = client.patch(
        "/api/v1/users/1/profile",
        headers=headers,
        json={"role_id": 3, "delegation_approval_id": "NULL"},
    )
    assert rejected.status_code == 400
    assert rejected.get_json()["error"] == "invalid_request"
    null_approval = client.patch(
        "/api/v1/users/1/profile",
        headers=headers,
        json={"role_id": 499, "delegation_approval_id": "NULL"},
    )
    assert null_approval.status_code == 403
    assert null_approval.get_json()["error"] == "delegation_approval_required"
    detail = client.get("/api/v1/dashboards/1042/conversations/5001/messages/9006", headers=headers)
    approval = re.search(r"approval ID: (dleg_[A-Za-z0-9_-]+)", detail.get_json()["body"])
    assert approval
    role_three = client.patch("/api/v1/users/1/profile", headers=headers, json={"role_id": 3, "delegation_approval_id": approval.group(1)})
    assert role_three.status_code == 400
    assert client.get("/api/v1/me", headers=headers).get_json()["role_id"] == 1
    assert client.get("/api/v3/dashboard", headers=headers).status_code == 403
    response = client.patch("/api/v1/users/1/profile", headers=headers, json={"role_id": 499, "delegation_approval_id": approval.group(1)})
    assert response.status_code == 200
    assert response.get_json()["role_id"] == 499
    assert client.get("/api/v3/dashboard", headers=headers).status_code == 200
    post_escalation_save = client.patch(
        "/api/v1/users/1/profile",
        headers=headers,
        json={"display_name": "Mike", "role_id": 499, "delegation_approval_id": "NULL"},
    )
    assert post_escalation_save.status_code == 200
    with transaction() as connection:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE users SET role_id = 1 WHERE id = 1")
    assert client.patch("/api/v1/users/1/profile", headers=headers, json={"role_id": 499, "delegation_approval_id": approval.group(1)}).status_code == 403


def test_admin_dashboard_requires_escalated_role(client):
    headers = login(client)
    response = client.get("/api/v3/dashboard", headers=headers)
    assert response.status_code == 403


def test_unauthenticated_business_requests_are_rejected(client):
    response = client.get("/api/v1/rooms")
    assert response.status_code == 401
    assert response.get_json()["error"] == "authentication_required"
