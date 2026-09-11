from functools import wraps

from flask import Blueprint, current_app, g, jsonify, redirect, render_template, request

from ..datastore import TENANTS
from ..sessions import get_session

bp = Blueprint("portal", __name__)


def portal_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        session = get_session()
        if session is None or session.get("account_type") != "Tenant":
            return redirect("/Login")
        g.session = session
        return view(*args, **kwargs)

    return wrapper


def wants_json():
    return request.args.get("format") == "json"


def tenant_name(tenant):
    return TENANTS.get(tenant, {}).get("name", tenant)


@bp.route("/Dashboard")
@portal_required
def dashboard():
    store = current_app.extensions["datastore"]
    tenant = g.session["tenant"]
    summary = store.tenant_summary(tenant)
    chart = store.jobs_per_day(tenant)
    recent = store.jobs_for_tenant(tenant)[:6]
    if wants_json():
        return jsonify(session=g.session, summary=summary, chart=chart, recent_jobs=recent)
    return render_template(
        "dashboard.html",
        session=g.session,
        summary=summary,
        chart=chart,
        recent=recent,
        tenant_name=tenant_name(tenant),
    )


@bp.route("/Jobs")
@portal_required
def jobs():
    store = current_app.extensions["datastore"]
    tenant = g.session["tenant"]
    query = request.args.get("q", "").strip()
    rows = store.jobs_for_tenant(tenant, query=query)
    if wants_json():
        return jsonify(tenant=tenant, query=query, jobs=rows)
    return render_template(
        "jobs.html",
        session=g.session,
        jobs=rows,
        query=query,
        tenant_name=tenant_name(tenant),
    )


@bp.route("/Customers")
@portal_required
def customers():
    store = current_app.extensions["datastore"]
    tenant = g.session["tenant"]
    rows = store.customers_for_tenant(tenant)
    if wants_json():
        return jsonify(tenant=tenant, customers=rows)
    return render_template(
        "customers.html",
        session=g.session,
        customers=rows,
        tenant_name=tenant_name(tenant),
    )


@bp.route("/Campaigns")
@portal_required
def campaigns():
    store = current_app.extensions["datastore"]
    tenant = g.session["tenant"]
    rows = store.campaigns_for_tenant(tenant)
    if wants_json():
        return jsonify(tenant=tenant, campaigns=rows)
    return render_template(
        "campaigns.html",
        session=g.session,
        campaigns=rows,
        tenant_name=tenant_name(tenant),
    )


@bp.route("/Campaigns/Preview/<campaign_id>")
@portal_required
def campaign_preview(campaign_id):
    store = current_app.extensions["datastore"]
    tenant = g.session["tenant"]
    campaign = store.campaign_get(tenant, campaign_id)
    if campaign is None:
        return render_template("errors/404.html"), 404
    return render_template(
        "campaign_preview.html",
        session=g.session,
        campaign=campaign,
        source=store.campaign_email_source(campaign),
        tenant_name=tenant_name(tenant),
    )
