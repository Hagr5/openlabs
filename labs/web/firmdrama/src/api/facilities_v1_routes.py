"""Deprecated v1 Facilities Desk and intentionally vulnerable preview."""

from flask import Blueprint, request, render_template_string

from src.responses import error_response
from src.auth import require_role
from src.db import get_connection

facilities_v1_api = Blueprint("facilities_v1_api", __name__)


@facilities_v1_api.get("/dashboard")
@require_role(499)
def dashboard_v1():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, title, status, api_generation FROM tickets WHERE id = 1001 AND api_generation = 'v1'")
            ticket = cursor.fetchone()
    if not ticket:
        return error_response("ticket_not_found", "The legacy Facilities ticket was not found.", 404)
    return {"version": "v1", "dashboard": "Legacy Facilities Desk", "ticket": ticket, "links": {"preview": "/api/v1/tickets/1001/preview"}}, 200


@facilities_v1_api.post("/tickets/<int:ticket_id>/preview")
@require_role(499)
def legacy_preview(ticket_id: int):
    if ticket_id != 1001:
        return error_response("ticket_not_found", "The legacy Facilities ticket was not found.", 404)
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response("invalid_request", "A JSON object is required.", 400)
    body = payload.get("body")
    if not isinstance(body, str) or not body:
        return error_response("invalid_request", "A ticket preview body is required.", 400)
    # This is the intentional legacy SSTI stage. The challenge is isolated in
    # a disposable container, and the official path reads only Olivia's file.
    rendered = render_template_string(body)
    return {"version": "v1", "ticket_id": ticket_id, "preview_html": rendered}, 200
