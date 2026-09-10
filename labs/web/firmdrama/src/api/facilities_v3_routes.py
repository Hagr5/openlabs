"""Secure modern Facilities Desk route."""

from flask import Blueprint, g, render_template

from src.responses import error_response
from src.auth import require_role
from src.db import get_connection

facilities_v3_api = Blueprint("facilities_v3_api", __name__)


@facilities_v3_api.get("/dashboard")
@require_role(499)
def dashboard_v3():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, title, body, status, api_generation FROM tickets WHERE id = 3001 AND api_generation = 'v3'")
            ticket = cursor.fetchone()
    if not ticket:
        return error_response("ticket_not_found", "The Facilities ticket was not found.", 404)
    rendered = render_template("facilities.html", ticket=ticket)
    return {"version": "v3", "dashboard": "Facilities Desk", "ticket": {"id": ticket["id"], "title": ticket["title"], "status": ticket["status"]}, "secure_preview_html": rendered}, 200
