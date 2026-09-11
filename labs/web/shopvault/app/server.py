"""ShopVault API."""

import logging
from flask import Flask, request, jsonify

# Import app modules
from database import init_db, get_user_by_username, get_user_by_id, list_all_users, update_user_password
from jwt_utils import generate_token, verify_token
from auth import authenticate_user, get_current_user, require_auth
from lockout import get_lockout_key

# =========================================================================
# Flask App Initialization
# =========================================================================

app = Flask(__name__)

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":"%(message)s"}',
)
log = logging.getLogger("shopvault")

# Flag returned by the manager-only reports endpoint
FLAG = "duck{kuz6wjje93tu8p5y9qeem4qk}"

# Initialize database on startup
@app.before_request
def setup_db():
    """Initialize DB once."""
    if not hasattr(app, '_db_initialized'):
        init_db()
        app._db_initialized = True
        log.info('Database initialized')

# =========================================================================
# HEALTH CHECK
# =========================================================================

@app.route("/health", methods=["GET"])
def health():
    """Liveness/readiness probe."""
    return jsonify({"status": "ok"}), 200


# =========================================================================
# DEBUG ENDPOINT
# =========================================================================
@app.route("/api/debug", methods=["GET"])
def debug_info():
    """Debug information."""
    return jsonify({
        "debug": False,
        "environment": "production",
        "internal_codename": "Project Crimson",
        "message": "Debug mode is disabled in this environment."
    }), 200

# =========================================================================
# ROOT ENDPOINT
# =========================================================================

@app.route("/", methods=["GET"])
def index():
    """Service information."""
    return jsonify({
        "service": "ShopVault API",
        "version": "1.0.0",
        "endpoints": {
            "health": "GET /health",
            "login": "POST /api/auth/login",
            "user": "GET /api/users/me",
            "admin": "GET /api/admin/users (admin only)",
            "manager": "GET /api/manager/reports (manager only)"
        }
    }), 200

# =========================================================================
# AUTHENTICATION ENDPOINTS
# =========================================================================

@app.route("/api/auth/login", methods=["POST"])
def login():
    """
    POST /api/auth/login
    
    Request body:
    {
        "username": "...",
        "password": "..."
    }
    
    Returns JWT token on success.
    
    """
    data = request.get_json()
    
    if not data or not data.get("username") or not data.get("password"):
        return jsonify({"error": "Missing username or password"}), 400
    
    username = data.get("username")
    password = data.get("password")
    
    # Determine lockout identity
    lockout_key = get_lockout_key(request)
    
    log.info(f"login_attempt username={username} lockout_key={lockout_key}")
    
    # Authenticate
    token, error = authenticate_user(username, password, lockout_key)
    
    if error:
        return jsonify({"error": error}), 401
    
    return jsonify({"token": token}), 200

@app.route("/api/auth/logout", methods=["POST"])
def logout():
    """Logout endpoint (token lifecycle management)."""
    return jsonify({"message": "Logged out"}), 200

# =========================================================================
# USER ENDPOINTS
# =========================================================================

@app.route("/api/users/me", methods=["GET"])
@require_auth()
def get_current_user_info():
    """Get current authenticated user info."""
    user = request.user
    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "is_active": user["is_active"]
    }), 200

@app.route("/api/users/me/settings", methods=["GET"])
@require_auth()
def get_user_settings():
    """Get current user settings."""
    user = request.user
    return jsonify({
        "user_id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "settings": {
            "theme": "light",
            "notifications": True
        }
    }), 200

# =========================================================================
# ADMIN ENDPOINTS
# =========================================================================

@app.route("/api/admin/dashboard", methods=["GET"])
@require_auth(required_role="admin")
def admin_dashboard():
    """Admin-only dashboard."""
    return jsonify({
        "dashboard": "ShopVault Admin Dashboard",
        "total_users": len(list_all_users()),
        "status": "operational"
    }), 200

@app.route("/api/admin/settings", methods=["GET"])
@require_auth(required_role="admin")
def admin_settings():
    """Admin-only settings."""
    return jsonify({
        "settings": {
            "max_login_attempts": 5,
            "session_timeout": 3600,
            "jwt_algorithm": "HS256"
        }
    }), 200

@app.route("/api/admin/users", methods=["GET"])
@require_auth(required_role="admin")
def admin_list_users():
    """
    Admin: List all users.
    
    """
    users = list_all_users()
    return jsonify({"users": users}), 200

@app.route("/api/admin/users/<int:user_id>/password", methods=["POST"])
@require_auth(required_role="admin")
def admin_reset_password(user_id):
    """
    Admin: Reset user password.
    
    Request body:
    {
        "new_password": "..."
    }
    
    """
    data = request.get_json()
    
    if not data or not data.get("new_password"):
        return jsonify({"error": "Missing new_password"}), 400
    
    from werkzeug.security import generate_password_hash
    
    new_password_hash = generate_password_hash(data.get("new_password"))
    update_user_password(user_id, new_password_hash)
    
    log.info(f"admin_password_reset user_id={user_id} admin_id={request.user['id']}")
    
    return jsonify({"message": f"Password reset for user {user_id}"}), 200


# =========================================================================
# BACKUP ENDPOINT
# =========================================================================
@app.route("/api/admin/backup", methods=["GET"])
@require_auth(required_role="admin")
def admin_backup():
    """Looks like a backup/export endpoint. Deliberately non-functional."""
    return jsonify({
        "status": "not_implemented",
        "message": "Backup export is not available in this environment."
    }), 501

# =========================================================================
# MANAGER ENDPOINTS (PROTECTED RESOURCE)
# =========================================================================

@app.route("/api/manager/reports", methods=["GET"])
@require_auth(required_role="manager")
def manager_reports():
    """Manager-only reports."""
    return jsonify({
        "reports": {
            "Q3_revenue": 150000,
            "Q3_expenses": 75000,
            "Q3_profit": 75000
        },
        "flag": FLAG
    }), 200

# =========================================================================
# ERROR HANDLERS
# =========================================================================

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(405)
def method_not_allowed(error):
    """Handle 405 errors (method not allowed)."""
    return jsonify({"error": "Method not allowed"}), 405

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    log.error(f"Internal error: {error}")
    return jsonify({"error": "Internal server error"}), 500

# =========================================================================
# MAIN
# =========================================================================

if __name__ == "__main__":
    # NOTE: Never run with Flask dev server in production.
    # Use gunicorn (see gunicorn.conf.py)
    raise SystemExit("Run with gunicorn: gunicorn -c gunicorn.conf.py server:app")
