"""Dashboard endpoints, including the intentional James BOLA stage."""

from flask import Blueprint, g

from src.responses import error_response
from src.auth import require_auth
from src.db import get_connection

dashboard_api = Blueprint("dashboard_api", __name__)


def _dashboard_for_user(dashboard_id: int, allow_intended_bola: bool = False):
    ownership_clause = "d.user_id = %s"
    params = [dashboard_id, g.current_user["id"]]
    if allow_intended_bola:
        # Intentional BOLA: a booking-to-dashboard reference is incorrectly
        # treated as an authorization grant rather than discovery metadata.
        ownership_clause = "(d.user_id = %s OR EXISTS (SELECT 1 FROM dashboard_booking_links dbl WHERE dbl.dashboard_id = d.id))"
        params = [dashboard_id, g.current_user["id"]]
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT d.id, d.user_id, d.dashboard_type, u.display_name, u.role_id, r.name AS role_name FROM dashboards d JOIN users u ON u.id = d.user_id JOIN roles r ON r.id = u.role_id WHERE d.id = %s AND {ownership_clause}",
                params,
            )
            return cursor.fetchone()


@dashboard_api.get("/dashboards/<int:dashboard_id>")
@require_auth
def dashboard(dashboard_id: int):
    record = _dashboard_for_user(dashboard_id, allow_intended_bola=True)
    if not record:
        return error_response("dashboard_not_found", "The dashboard was not found for this account.", 404)
    return {
        "dashboard_id": record["id"],
        "owner": {"id": record["user_id"], "display_name": record["display_name"], "role_id": record["role_id"], "role_name": record["role_name"]},
        "widgets": ["calendar", "messages", "notifications"],
        "links": {"summary": f"/api/v1/dashboards/{dashboard_id}/summary"},
    }, 200


@dashboard_api.get("/dashboards/<int:dashboard_id>/summary")
@require_auth
def dashboard_summary(dashboard_id: int):
    record = _dashboard_for_user(dashboard_id, allow_intended_bola=True)
    if not record:
        return error_response("dashboard_not_found", "The dashboard was not found for this account.", 404)
    return {
        "dashboard_id": record["id"],
        "owner": {"id": record["user_id"], "display_name": record["display_name"], "role_id": record["role_id"], "role_name": record["role_name"]},
        "widgets": ["calendar", "messages", "notifications"],
        "links": {"conversations": f"/api/v1/dashboards/{dashboard_id}/conversations"},
    }, 200
