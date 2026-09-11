from flask import (
    Blueprint,
    current_app,
    make_response,
    redirect,
    render_template,
    request,
)

from ..sessions import get_session

bp = Blueprint("auth", __name__)


@bp.route("/Login", methods=["GET", "POST"])
def login():
    sessions = current_app.extensions["sessions"]
    if request.method == "GET":
        existing = get_session()
        if existing is not None and existing.get("account_type") == "Tenant":
            return redirect("/Dashboard")
        return render_template("login.html", error=None)

    username = request.form.get("username", "")
    password = request.form.get("password", "")
    store = current_app.extensions["datastore"]

    if store.login_attempts_locked(request.remote_addr, username):
        return render_template(
            "login.html", error="Too many failed attempts. Try again in a few minutes."
        ), 429

    user = store.get_user(username)

    if user is not None and user.get("sso_only"):
        return render_template(
            "login.html",
            error="This account is locked to enterprise SSO. Contact the IT service desk.",
        ), 403

    if user is None or not store.verify_password(user, password):
        store.record_login_failure(request.remote_addr, username)
        return render_template("login.html", error="Invalid username or password."), 401

    store.record_login_success(request.remote_addr, username)
    token = sessions.create(
        sub=user["username"],
        display_name=user["display_name"],
        tenant=user["tenant"],
        role=user["role"],
        account_type=user["account_type"],
        auth_method="password",
    )
    response = make_response(redirect("/Dashboard"))
    return sessions.attach(response, token)


@bp.route("/Logout", methods=["GET", "POST"])
def logout():
    sessions = current_app.extensions["sessions"]
    sessions.destroy()
    response = make_response(redirect("/"))
    response.delete_cookie(sessions.cookie_name, path="/")
    return response
