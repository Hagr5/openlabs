import time

from flask import Blueprint, Response, current_app, g, jsonify, request

from ..sessions import admin_required

bp = Blueprint("admin", __name__)


@bp.route("/Admin")
@admin_required
def admin_index():
    return jsonify(
        console="FieldOps 360 Administration API",
        authenticated_as=g.session.get("sub"),
        account_type=g.session.get("account_type"),
        endpoints=[
            {
                "path": "/Admin/Export/ExportJobs",
                "method": "GET",
                "description": "Export all tenant job records (supports format=json|csv)",
            },
            {
                "path": "/Admin/GetTechnicians",
                "method": "GET",
                "description": "List all technician records across tenants",
            },
        ],
    )


@bp.route("/Admin/Export/ExportJobs")
@admin_required
def export_jobs():
    store = current_app.extensions["datastore"]
    fmt = request.args.get("format", "json").lower()
    if fmt == "csv":
        csv_data = store.export_jobs_csv()
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=export_jobs.csv"},
        )
    rows = store.export_jobs()
    return jsonify(
        export="jobs",
        total_records=len(rows),
        generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        jobs=rows,
    )


@bp.route("/Admin/GetTechnicians")
@admin_required
def get_technicians():
    store = current_app.extensions["datastore"]
    rows = store.technicians_all()
    return jsonify(
        export="technicians",
        total_records=len(rows),
        generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        technicians=rows,
    )
