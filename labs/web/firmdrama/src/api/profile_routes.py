"""Profile endpoints, including intentionally flawed delegation activation."""

import hashlib

from flask import Blueprint, g, request

from src.responses import error_response
from src.auth import require_auth, user_summary
from src.db import get_connection, transaction

profile_api = Blueprint("profile_api", __name__)
EDITABLE_FIELDS = {"display_name", "department", "phone_extension"}
EDITABLE_FIELD_LENGTHS = {"display_name": 120, "department": 120, "phone_extension": 20}


def profile_payload(user: dict) -> dict:
    result = user_summary(user)
    standard_permissions = ["bookings:read", "bookings:write", "profile:read", "profile:write"]
    facilities_permissions = ["facilities:read", "facilities:write"]
    result.update({"department": user["department"], "phone_extension": user["phone_extension"], "dashboard_id": 1001 if user["id"] == 1 else None, "permissions": facilities_permissions if user["role_id"] == 499 else standard_permissions})
    return result


@profile_api.get("/me")
@require_auth
def me():
    return profile_payload(g.current_user), 200


@profile_api.patch("/users/<int:user_id>/profile")
@require_auth
def update_profile(user_id: int):
    if user_id != g.current_user["id"]:
        return error_response("profile_not_found", "The profile was not found for this account.", 404)
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response("invalid_request", "A JSON object is required.", 400)
    unknown = set(payload) - EDITABLE_FIELDS - {"role_id", "delegation_approval_id"}
    if unknown:
        return error_response("immutable_property", "One or more profile properties cannot be changed through this endpoint.", 400)
    if "role_id" in payload and (user_id != g.current_user["id"] or not isinstance(payload["role_id"], int)):
        return error_response("invalid_request", "The requested role value is invalid.", 400)
    if "delegation_approval_id" in payload and not isinstance(payload["delegation_approval_id"], str):
        return error_response("invalid_request", "The delegation approval ID is invalid.", 400)
    if not payload:
        return error_response("invalid_request", "At least one editable profile property is required.", 400)
    assignments = []
    values = []
    for field in EDITABLE_FIELDS:
        if field in payload and isinstance(payload[field], str) and len(payload[field]) <= EDITABLE_FIELD_LENGTHS[field]:
            assignments.append(f"{field} = %s")
            values.append(payload[field])
        elif field in payload:
            return error_response("invalid_request", f"{field} must be a string within its allowed length.", 400)
    role_change_requested = "role_id" in payload and payload["role_id"] != g.current_user["role_id"]
    approval_hash = None
    if role_change_requested:
        if payload["role_id"] != 499:
            return error_response("invalid_request", "The requested role value is not eligible for executive delegation.", 400)
        approval_hash = hashlib.sha256(payload.get("delegation_approval_id", "").encode()).hexdigest()
        # Intentional BOPLA remains: the approval is checked for its target
        # role but not for its intended recipient or source role.
        assignments.append("role_id = %s")
        values.append(payload["role_id"])
    if not assignments:
        return error_response("invalid_request", "At least one editable profile property is required.", 400)
    values.append(user_id)
    with transaction() as connection:
        with connection.cursor() as cursor:
            if approval_hash is not None:
                cursor.execute(
                    "SELECT id FROM delegation_approvals WHERE approval_hash = %s AND delegated_role_id = %s AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP() FOR UPDATE",
                    (approval_hash, payload["role_id"]),
                )
                approval = cursor.fetchone()
                if not approval:
                    return error_response("delegation_approval_required", "The delegation approval ID is invalid, expired, or has already been used.", 403)
                cursor.execute("UPDATE delegation_approvals SET consumed_at = UTC_TIMESTAMP() WHERE id = %s", (approval["id"],))
            cursor.execute(f"UPDATE users SET {', '.join(assignments)} WHERE id = %s", values)
            cursor.execute("SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = %s", (user_id,))
            updated = cursor.fetchone()
    return profile_payload(updated), 200
