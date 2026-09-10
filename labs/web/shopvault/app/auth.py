from werkzeug.security import check_password_hash, generate_password_hash
from database import get_user_by_username, get_user_by_id
from jwt_utils import generate_token, verify_token
from lockout import is_locked_out, record_failed_attempt, reset_lockout

# Precomputed dummy hash so the "unknown username" path takes the same
# amount of time as the "wrong password" path (mitigates username
# enumeration via response timing).
_DUMMY_HASH = generate_password_hash("dummy_password_for_timing_parity")

def authenticate_user(username, password, lockout_key):
    """
    Authenticate user and return JWT token or error.
    """
    # Check lockout
    if is_locked_out(lockout_key):
        return None, "Account locked due to too many failed attempts"
    
    # Get user
    user = get_user_by_username(username)
    if not user:
        check_password_hash(_DUMMY_HASH, password)  # constant-time-ish decoy
        record_failed_attempt(lockout_key)
        return None, "Invalid username or password"
    
    # Check password
    if not check_password_hash(user["password_hash"], password):
        record_failed_attempt(lockout_key)
        return None, "Invalid password"
    
    # Success: reset lockout and generate token
    reset_lockout(lockout_key)
    token = generate_token(user["id"], user["username"], user["role"])
    return token, None

def get_current_user(token):
    """Extract user from JWT token."""
    payload = verify_token(token)
    if not payload:
        return None
    
    user = get_user_by_id(payload["sub"])
    return user

def require_auth(required_role=None):
    """
    Decorator to check authentication and optionally authorization.
    """
    from functools import wraps
    from flask import request, jsonify
    
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Extract token from Authorization header
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return jsonify({"error": "Missing or invalid Authorization header"}), 401
            
            token = auth_header[7:]  # Remove "Bearer "
            user = get_current_user(token)
            if not user:
                return jsonify({"error": "Invalid or expired token"}), 401
            
            # Check role if required
            if required_role and user["role"] != required_role:
                return jsonify({"error": "Forbidden: insufficient privileges"}), 403
            
            # Attach user to request
            request.user = user
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator
