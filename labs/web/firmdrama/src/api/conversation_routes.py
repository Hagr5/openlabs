"""Nested conversation and message routes for the intended BOLA chain."""

import re

from flask import Blueprint, g

from src.api.dashboard_routes import _dashboard_for_user
from src.responses import error_response
from src.auth import require_auth
from src.db import get_connection

conversation_api = Blueprint("conversation_api", __name__)


def _conversation_context(dashboard_id: int, conversation_id: int | None = None):
    dashboard = _dashboard_for_user(dashboard_id, allow_intended_bola=True)
    if not dashboard:
        return None, None
    with get_connection() as connection:
        with connection.cursor() as cursor:
            if conversation_id is None:
                cursor.execute(
                    "SELECT c.id, c.subject, c.confidentiality, c.created_at, COUNT(DISTINCT cp_all.user_id) AS participant_count, COUNT(DISTINCT m.id) AS message_count FROM conversations c JOIN conversation_participants cp_owner ON cp_owner.conversation_id = c.id JOIN conversation_participants cp_all ON cp_all.conversation_id = c.id LEFT JOIN messages m ON m.conversation_id = c.id WHERE cp_owner.user_id = %s GROUP BY c.id, c.subject, c.confidentiality, c.created_at",
                    (dashboard["user_id"],),
                )
            else:
                cursor.execute(
                    "SELECT c.id, c.subject, c.confidentiality, c.created_at FROM conversations c JOIN conversation_participants cp_owner ON cp_owner.conversation_id = c.id WHERE c.id = %s AND cp_owner.user_id = %s GROUP BY c.id, c.subject, c.confidentiality, c.created_at",
                    (conversation_id, dashboard["user_id"]),
                )
            return dashboard, cursor.fetchone()


def _iso(value):
    return value.isoformat() + "Z" if value else None


@conversation_api.get("/dashboards/<int:dashboard_id>/conversations")
@require_auth
def conversations(dashboard_id: int):
    dashboard, _ = _conversation_context(dashboard_id)
    if not dashboard:
        return error_response("dashboard_not_found", "The dashboard was not found for this account.", 404)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT c.id, c.subject, c.confidentiality, c.created_at, COUNT(DISTINCT m.id) AS message_count, MAX(m.created_at) AS last_activity, GROUP_CONCAT(DISTINCT u.display_name ORDER BY u.id SEPARATOR ', ') AS participants FROM conversations c JOIN conversation_participants cp_owner ON cp_owner.conversation_id = c.id JOIN conversation_participants cp ON cp.conversation_id = c.id JOIN users u ON u.id = cp.user_id LEFT JOIN messages m ON m.conversation_id = c.id WHERE cp_owner.user_id = %s GROUP BY c.id, c.subject, c.confidentiality, c.created_at",
                (dashboard["user_id"],),
            )
            rows = cursor.fetchall()
    return {
        "dashboard_id": dashboard_id,
        "conversations": [
            {"conversation_id": row["id"], "subject": row["subject"], "participants": row["participants"].split(", "), "message_count": row["message_count"], "last_activity": _iso(row["last_activity"]), "confidentiality": row["confidentiality"]}
            for row in rows
        ],
    }, 200


@conversation_api.get("/dashboards/<int:dashboard_id>/conversations/<int:conversation_id>")
@require_auth
def conversation_detail(dashboard_id: int, conversation_id: int):
    dashboard, conversation = _conversation_context(dashboard_id, conversation_id)
    if not dashboard or not conversation:
        return error_response("conversation_not_found", "The conversation was not found in this dashboard context.", 404)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT m.id, m.created_at, u.display_name AS sender, m.body FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = %s ORDER BY m.created_at, m.id",
                (conversation_id,),
            )
            rows = cursor.fetchall()
    summaries = []
    for row in rows:
        body = row["body"]
        if "duck{" in body:
            preview = f"{body.split('duck{', maxsplit=1)[0].rstrip()} duck{{"
        else:
            preview = re.split(r" approval ID: |INTERMEDIATE_FLAG_PLACEHOLDER", body, maxsplit=1)[0].strip()
        summaries.append({"message_id": row["id"], "sender": row["sender"], "body_preview": preview, "created_at": _iso(row["created_at"])})
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT u.id, u.display_name FROM conversation_participants cp JOIN users u ON u.id = cp.user_id WHERE cp.conversation_id = %s ORDER BY u.id",
                (conversation_id,),
            )
            participants = cursor.fetchall()
    return {"conversation_id": conversation["id"], "subject": conversation["subject"], "participants": participants, "messages": summaries}, 200


@conversation_api.get("/dashboards/<int:dashboard_id>/conversations/<int:conversation_id>/messages/<int:message_id>")
@require_auth
def message_detail(dashboard_id: int, conversation_id: int, message_id: int):
    dashboard, conversation = _conversation_context(dashboard_id, conversation_id)
    if not dashboard or not conversation:
        return error_response("message_not_found", "The message was not found in this dashboard context.", 404)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT m.id, m.conversation_id, m.body, m.created_at, m.sender_role_id, s.id AS sender_id, s.display_name AS sender, r.id AS recipient_id, r.display_name AS recipient FROM messages m JOIN users s ON s.id = m.sender_id JOIN users r ON r.id = m.recipient_id WHERE m.id = %s AND m.conversation_id = %s",
                (message_id, conversation_id),
            )
            row = cursor.fetchone()
    if not row:
        return error_response("message_not_found", "The message was not found in this conversation.", 404)
    return {"message_id": row["id"], "conversation_id": row["conversation_id"], "sender": {"id": row["sender_id"], "display_name": row["sender"]}, "recipient": {"id": row["recipient_id"], "display_name": row["recipient"]}, "body": row["body"], "created_at": _iso(row["created_at"]), "metadata": {"sender_role_id": row["sender_role_id"]}}, 200
