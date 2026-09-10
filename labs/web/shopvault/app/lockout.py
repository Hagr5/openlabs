
lockout_store = {}
MAX_ATTEMPTS = 5

def get_lockout_key(request):
    """
    Determine the lockout identity for a request.
    """
    x_forwarded_for = request.headers.get("X-Forwarded-For", "")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.remote_addr

def is_locked_out(lockout_key):
    """Check if lockout_key is locked out."""
    if lockout_key in lockout_store:
        attempts = lockout_store[lockout_key]
        return attempts >= MAX_ATTEMPTS
    return False

def record_failed_attempt(lockout_key):
    """Record a failed login attempt."""
    if lockout_key not in lockout_store:
        lockout_store[lockout_key] = 0
    lockout_store[lockout_key] += 1

def reset_lockout(lockout_key):
    """Reset failed attempts for a lockout_key."""
    if lockout_key in lockout_store:
        lockout_store[lockout_key] = 0
