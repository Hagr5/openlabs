import os
import secrets

from flask import Flask, render_template

from .datastore import DataStore
from .sessions import SessionManager


def load_flag():
    value = os.environ.get("FLAG", "").strip()
    if value:
        return value
    path = os.environ.get("FLAG_FILE", "/app/flag.txt")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            value = fh.read().strip()
    except FileNotFoundError:
        raise RuntimeError(
            "flag not configured; set the FLAG env or mount flag.txt"
        )
    if not value:
        raise RuntimeError("flag file is empty")
    return value


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = secrets.token_hex(32)
    app.config["SESSION_COOKIE_NAME"] = "FSMSID"
    app.config["SESSION_TTL"] = 7200

    store = DataStore(flag=load_flag())
    session_mgr = SessionManager(
        secret=app.config["SECRET_KEY"],
        cookie_name=app.config["SESSION_COOKIE_NAME"],
        ttl=app.config["SESSION_TTL"],
    )
    app.extensions["datastore"] = store
    app.extensions["sessions"] = session_mgr

    from .views.admin import bp as admin_bp
    from .views.auth import bp as auth_bp
    from .views.portal import bp as portal_bp
    from .views.public import bp as public_bp
    from .views.tracking import bp as tracking_bp

    app.register_blueprint(public_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(portal_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(tracking_bp)

    @app.errorhandler(404)
    def not_found(_e):
        return render_template("errors/404.html"), 404

    @app.errorhandler(500)
    def server_error(_e):
        return render_template("errors/500.html"), 500

    return app
