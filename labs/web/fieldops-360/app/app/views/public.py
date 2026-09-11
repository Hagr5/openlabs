import hmac
import os
import time

from flask import Blueprint, Response, current_app, jsonify, render_template, request

bp = Blueprint("public", __name__)

ROBOTS = "User-agent: *\nDisallow: /Admin/\nDisallow: /reset\n"


@bp.route("/")
def index():
    return render_template("index.html")


@bp.route("/health")
def health():
    store = current_app.extensions["datastore"]
    sessions = current_app.extensions["sessions"]
    return jsonify(
        status="ok",
        service="fieldops-360",
        version="4.2.1",
        checks={
            "datastore": "ok",
            "session_store": "ok",
            "flag": "loaded",
        },
        metrics={
            "sessions_active": sessions.active_count(),
            "tracking_events_recorded": store.tracking_event_count(),
        },
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )


@bp.route("/robots.txt")
def robots():
    return Response(ROBOTS, mimetype="text/plain")


@bp.route("/reset", methods=["POST"])
def reset():
    provided = request.headers.get("X-Reset-Token", "")
    expected = os.environ.get("RESET_TOKEN", "")
    if not expected or not hmac.compare_digest(provided.encode(), expected.encode()):
        return jsonify(error="forbidden"), 403
    store = current_app.extensions["datastore"]
    sessions = current_app.extensions["sessions"]
    sessions.clear()
    cleared = store.reset_runtime_state()
    return jsonify(
        status="reset",
        detail={
            "sessions_cleared": True,
            "tracking_events_cleared": True,
            "login_lockouts_cleared": True,
            "seed_data": "restored",
            "note": "flag and tenant data are immutable seed state",
        },
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )
