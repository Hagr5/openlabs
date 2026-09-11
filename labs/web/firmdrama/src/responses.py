"""Shared JSON response helpers for API routes and authentication guards."""

from flask import jsonify


def error_response(error: str, message: str, status_code: int):
    """Return the application's stable JSON error representation."""

    return jsonify({"error": error, "message": message}), status_code
