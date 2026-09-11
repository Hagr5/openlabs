"""Health, authentication, and HTTP error contract tests."""

from src.app import create_app


def test_health_contract():
    client = create_app().test_client()

    response = client.get("/health")

    assert response.status_code == 200
    assert response.content_type == "application/json"
    assert response.get_json() == {"status": "ok", "service": "firmdrama"}


def test_business_routes_require_authentication():
    client = create_app().test_client()

    response = client.get("/api/v1/me")

    assert response.status_code == 401
    assert response.get_json() == {
        "error": "authentication_required",
        "message": "A valid bearer token is required.",
    }


def test_unsupported_methods_use_contract_error_shape():
    client = create_app().test_client()

    response = client.post("/health")

    assert response.status_code == 405
    assert response.get_json()["error"] == "method_not_allowed"
    assert {"GET", "HEAD", "OPTIONS"} <= set(response.headers["Allow"].split(", "))
