"""firmdrama application factory, browser routes, and HTTP response policies."""

from __future__ import annotations

from functools import wraps
from typing import Any

from flask import Flask, g, jsonify, redirect, render_template, url_for

from src.auth import current_user, require_role
from src.config import load_config
from src.db import database_ready
from src.responses import error_response


def require_page_auth(view):
    """Require the browser session before rendering an application page."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user:
            return redirect(url_for("login_page"))
        g.current_user = user
        return view(*args, **kwargs)

    return wrapped


def require_page_role(role_id: int):
    """Keep role-restricted page shells out of lower-privilege responses."""

    def decorator(view):
        @wraps(view)
        @require_page_auth
        def wrapped(*args, **kwargs):
            if g.current_user["role_id"] != role_id:
                return redirect(url_for("dashboard_page"))
            return view(*args, **kwargs)

        return wrapped

    return decorator


def create_app(config_object: type[Any] | None = None) -> Flask:
    """Create an application with its API blueprints and browser routes."""

    app = Flask(__name__)
    app.config.from_object(config_object or load_config())

    from src.api.auth_routes import auth_api
    from src.api.conversation_routes import conversation_api
    from src.api.dashboard_routes import dashboard_api
    from src.api.facilities_v1_routes import facilities_v1_api
    from src.api.facilities_v3_routes import facilities_v3_api
    from src.api.profile_routes import profile_api
    from src.api.room_routes import room_api

    app.register_blueprint(auth_api, url_prefix="/api/v1/auth")
    app.register_blueprint(profile_api, url_prefix="/api/v1")
    app.register_blueprint(room_api, url_prefix="/api/v1")
    app.register_blueprint(dashboard_api, url_prefix="/api/v1")
    app.register_blueprint(conversation_api, url_prefix="/api/v1")
    app.register_blueprint(facilities_v3_api, url_prefix="/api/v3")
    app.register_blueprint(facilities_v1_api, url_prefix="/api/v1")

    @app.after_request
    def add_security_headers(response):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; connect-src 'self'; object-src 'none'; "
            "base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        if response.mimetype == "application/json":
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/v2/dashboard")
    @require_role(499)
    def retired_dashboard_v2():
        return error_response("not_found", "The requested resource was not found.", 404)

    @app.get("/")
    def login_page():
        if current_user():
            return redirect(url_for("dashboard_page"))
        return render_template("login.html")

    @app.get("/favicon.ico")
    def favicon():
        return app.send_static_file("favicon.svg")

    @app.get("/dashboard")
    @require_page_auth
    def dashboard_page():
        return render_template("dashboard.html", active_page="dashboard")

    @app.get("/calendar")
    @require_page_auth
    def calendar_page():
        return render_template("calendar.html", active_page="calendar")

    @app.get("/rooms")
    @require_page_auth
    def rooms_page():
        return render_template("rooms.html", active_page="rooms")

    @app.get("/profile")
    @require_page_auth
    def profile_page():
        return render_template("profile.html", active_page="profile")

    @app.get("/conversations")
    @require_page_auth
    def conversations_page():
        return render_template("conversations.html", active_page="conversations")

    @app.get("/conversations/<int:conversation_id>")
    @require_page_auth
    def conversation_detail_page(conversation_id: int):
        return render_template("conversation_detail.html", active_page="conversations")

    @app.get("/facilities")
    @require_page_role(499)
    def facilities_page():
        return render_template("facilities.html", active_page="facilities")

    @app.get("/requests")
    @require_page_auth
    def requests_page():
        return render_template("requests.html", active_page="requests")

    @app.get("/notifications")
    @require_page_auth
    def notifications_page():
        return render_template("notifications.html", active_page="notifications")

    @app.get("/health")
    def health():
        """Report application and, when configured, database readiness."""

        if app.config.get("DATABASE_REQUIRED") and not database_ready():
            return jsonify({"status": "unavailable", "service": "firmdrama"}), 503
        return jsonify({"status": "ok", "service": "firmdrama"}), 200

    @app.errorhandler(404)
    def not_found(_error):
        return error_response("not_found", "The requested resource was not found.", 404)

    @app.errorhandler(405)
    def method_not_allowed(error):
        response, status = error_response("method_not_allowed", "The requested method is not allowed.", 405)
        response.headers["Allow"] = ", ".join(error.valid_methods or [])
        return response, status

    @app.errorhandler(413)
    def request_too_large(_error):
        return error_response("request_too_large", "The request body exceeds the allowed size.", 413)

    @app.errorhandler(500)
    def internal_error(_error):
        return error_response("internal_error", "An internal error occurred.", 500)

    return app
