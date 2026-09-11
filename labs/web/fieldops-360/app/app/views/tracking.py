import base64

from flask import Blueprint, current_app, make_response, request
bp = Blueprint("tracking", __name__)

PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


@bp.route("/OpenEmail/<company>/<email>/<ref>", methods=["GET", "HEAD"])
def open_email(company, email, ref):
    store = current_app.extensions["datastore"]
    sessions = current_app.extensions["sessions"]

    store.record_tracking_event(company, email, ref, request.remote_addr)

    token = sessions.create(
        sub="FIELDOPS\\svc-email-tracker",
        display_name="Email Tracking Service",
        tenant=company,
        role="EmailTracker",
        account_type="Service",
        auth_method="internal-service",
    )

    response = make_response(PIXEL_PNG)
    response.headers["Content-Type"] = "image/png"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    response.headers["X-Tracking-Event"] = "recorded"
    return sessions.attach(response, token)
