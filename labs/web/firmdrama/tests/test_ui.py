"""Browser-session, page-rendering, and static-asset contract tests."""

import re

from src.app import create_app


def test_ui_pages_require_a_browser_session():
    client = create_app().test_client()
    for path in ("/dashboard", "/calendar", "/rooms", "/profile", "/conversations", "/conversations/1", "/facilities", "/requests", "/notifications"):
        response = client.get(path)
        assert response.status_code == 302
        assert response.headers["Location"].endswith("/")


def test_authenticated_ui_pages_render(browser_client):
    client = browser_client
    for path in (
        "/dashboard",
        "/calendar",
        "/rooms",
        "/profile",
        "/conversations",
        "/conversations/1",
        "/requests",
        "/notifications",
    ):
        response = client.get(path)
        assert response.status_code == 200
        assert response.content_type.startswith("text/html")


def test_favicon_is_served_as_svg():
    response = create_app().test_client().get("/favicon.ico")
    assert response.status_code == 200
    assert response.content_type.startswith("image/svg+xml")
    assert b"Alder &amp; Vale RoomReserve" in response.data


def test_facilities_navigation_is_hidden_until_a_role_499_session_is_loaded(browser_client):
    client = browser_client
    response = client.get("/dashboard")
    assert b'data-facilities-nav' in response.data
    assert b'data-facilities-nav class="" href="/facilities" hidden' in response.data
    assert client.get("/facilities").status_code == 302


def test_challenge_critical_steps_remain_api_only(browser_client):
    client = browser_client
    for path in ("/dashboards/1", "/dashboards/1/conversations", "/facilities/legacy"):
        assert client.get(path).status_code == 404

    javascript = client.get("/static/js/app.js").get_data(as_text=True)
    assert "booking.dashboard_id" not in javascript
    assert "View linked workspace" not in javascript
    assert "Open legacy ticket preview" not in javascript

    profile = client.get("/profile").get_data(as_text=True)
    assert "delegation_approval_id" not in profile
    assert "Activate Facilities access" not in profile


def test_static_assets_do_not_contain_runtime_flags_or_solution_ids():
    client = create_app().test_client()
    for path in ("/static/js/app.js", "/static/css/app.css"):
        body = client.get(path).get_data(as_text=True)
        assert not re.search(r"duck\{[a-z]{24}\}", body)
        assert "1042" not in body
        assert "5001" not in body
        assert "9006" not in body
