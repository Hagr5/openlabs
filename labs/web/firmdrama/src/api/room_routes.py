"""Room, calendar, and normal booking endpoints."""

from datetime import datetime, timezone
import re

from flask import Blueprint, g, request

from src.responses import error_response
from src.auth import require_auth
from src.db import get_connection, transaction

room_api = Blueprint("room_api", __name__)


def parse_booking_time(value: str) -> datetime:
    """Accept timezone-qualified ISO timestamps within MySQL DATETIME's range."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)", value):
        raise ValueError("A timezone-qualified timestamp is required")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    normalized = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    if normalized.year < 1000:
        raise ValueError("Timestamp is outside the database range")
    return normalized


@room_api.get("/rooms")
@require_auth
def rooms():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, name, floor, capacity, confidentiality_level, status FROM rooms ORDER BY id")
            records = cursor.fetchall()
    return {"rooms": records}, 200


@room_api.get("/bookings/calendar")
@require_auth
def calendar():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT b.id AS booking_id, b.room_id, r.name AS room_name, r.confidentiality_level AS confidentiality, u.display_name AS reserved_by, b.matter_code, b.purpose, b.starts_at, b.ends_at, b.status, dbl.dashboard_id FROM bookings b JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = b.user_id LEFT JOIN dashboard_booking_links dbl ON dbl.booking_id = b.id ORDER BY b.starts_at"
            )
            records = cursor.fetchall()
    for record in records:
        record["starts_at"] = record["starts_at"].isoformat() + "Z"
        record["ends_at"] = record["ends_at"].isoformat() + "Z"
    return {"bookings": records}, 200


@room_api.get("/maintenance-requests")
@require_auth
def maintenance_requests():
    """Return only the current employee's ordinary Facilities requests."""

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, title, status, created_at FROM tickets WHERE owner_id = %s ORDER BY created_at DESC, id DESC",
                (g.current_user["id"],),
            )
            records = cursor.fetchall()
    for record in records:
        record["created_at"] = record["created_at"].isoformat() + "Z"
    return {"requests": records}, 200


@room_api.get("/notifications")
@require_auth
def notifications():
    """Provide neutral, current-user schedule notices for the normal portal."""

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT r.name AS room_name, b.starts_at FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.user_id = %s AND b.status = 'confirmed' ORDER BY b.starts_at LIMIT 1",
                (g.current_user["id"],),
            )
            next_booking = cursor.fetchone()
    notices = [{"kind": "account", "title": "Account ready", "detail": "Your RoomReserve contact details are available in Profile."}]
    if next_booking:
        notices.insert(0, {"kind": "calendar", "title": "Upcoming room reservation", "detail": f"{next_booking['room_name']} is scheduled for {next_booking['starts_at'].isoformat()}Z."})
    return {"notifications": notices}, 200


@room_api.post("/bookings")
@require_auth
def create_booking():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response("invalid_request", "A JSON object is required.", 400)
    required = ("room_id", "matter_code", "purpose", "starts_at", "ends_at")
    if any(field not in payload for field in required):
        return error_response("invalid_request", "room_id, matter_code, purpose, starts_at, and ends_at are required.", 400)
    if not isinstance(payload["matter_code"], str) or not 1 <= len(payload["matter_code"]) <= 40:
        return error_response("invalid_request", "matter_code length is invalid.", 400)
    if not isinstance(payload["purpose"], str) or not 1 <= len(payload["purpose"]) <= 255:
        return error_response("invalid_request", "purpose length is invalid.", 400)
    if not isinstance(payload["starts_at"], str) or not isinstance(payload["ends_at"], str):
        return error_response("invalid_request", "Booking dates are invalid.", 400)
    try:
        starts_at = parse_booking_time(payload["starts_at"])
        ends_at = parse_booking_time(payload["ends_at"])
        room_id = payload["room_id"]
        if type(room_id) is not int or not 1 <= room_id <= 2147483647:
            raise ValueError("A positive integer room ID is required")
    except (TypeError, ValueError, OverflowError):
        return error_response("invalid_request", "Booking dates and room_id are invalid.", 400)
    if ends_at <= starts_at:
        return error_response("invalid_request", "The booking must end after it starts.", 400)
    with transaction() as connection:
        with connection.cursor() as cursor:
            # Serialize reservations per room, including currently empty intervals.
            cursor.execute("SELECT id FROM rooms WHERE id = %s AND status = 'available' FOR UPDATE", (room_id,))
            if not cursor.fetchone():
                return error_response("room_unavailable", "The requested room is unavailable.", 409)
            cursor.execute(
                "SELECT id FROM bookings WHERE room_id = %s AND status = 'confirmed' AND starts_at < %s AND ends_at > %s FOR UPDATE",
                (room_id, ends_at, starts_at),
            )
            if cursor.fetchone():
                return error_response("room_unavailable", "The requested room is already booked.", 409)
            cursor.execute(
                "INSERT INTO bookings (room_id, user_id, matter_code, purpose, starts_at, ends_at, status) VALUES (%s, %s, %s, %s, %s, %s, 'confirmed')",
                (room_id, g.current_user["id"], payload["matter_code"], payload["purpose"], starts_at, ends_at),
            )
            booking_id = cursor.lastrowid
    return {"booking_id": booking_id, "status": "confirmed"}, 201


@room_api.delete("/bookings/<int:booking_id>")
@require_auth
def cancel_booking(booking_id: int):
    with transaction() as connection:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE bookings SET status = 'cancelled' WHERE id = %s AND user_id = %s AND status = 'confirmed'", (booking_id, g.current_user["id"]))
            if cursor.rowcount != 1:
                return error_response("booking_not_found", "The booking was not found for this account.", 404)
    return {"booking_id": booking_id, "status": "cancelled"}, 200
