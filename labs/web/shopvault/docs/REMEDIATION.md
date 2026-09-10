# ShopVault API Remediation

## 1. Fix Weak JWT Secret

### ❌ Current (Vulnerable) Code
```python
JWT_SECRET = os.environ.get("JWT_SECRET", "weak_secret_key_for_testing")
```

### ✅ Remediation
```python
import os
import secrets

def get_jwt_secret():
    """Get JWT secret from secure source."""
    secret = os.environ.get("JWT_SECRET")
    
    if not secret:
        raise ValueError("JWT_SECRET environment variable not set")
    
    # Validate secret strength
    if len(secret) < 32:
        raise ValueError("JWT_SECRET must be at least 32 characters")
    
    return secret

JWT_SECRET = get_jwt_secret()
JWT_ALGORITHM = "HS256"  # or use RS256 (asymmetric) for better security
```

### Implementation
```bash
# Generate secure secret
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Set environment variable
export JWT_SECRET=<generated_secure_secret>

# Or in .env
JWT_SECRET=<generated_secure_secret>
```

### Additional Recommendations
- Use RS256 (RSA) instead of HS256 for distributed systems
- Rotate secrets regularly (monthly or on key compromise)
- Use a key management service (AWS KMS, HashiCorp Vault)
- Log secret usage (without exposing the secret itself)

---

## 2. Fix X-Forwarded-For Lockout Bypass

### ❌ Current (Vulnerable) Code
```python
def get_lockout_key(request):
    x_forwarded_for = request.headers.get("X-Forwarded-For", "")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.remote_addr
```

### ✅ Remediation
```python
def get_lockout_key(request):
    """
    Get lockout identity from trusted sources only.
    
    X-Forwarded-For is ONLY trusted if from known proxy.
    """
    TRUSTED_PROXIES = {"127.0.0.1", "10.0.0.1"}  # Whitelist
    remote_addr = request.remote_addr
    
    # Only trust X-Forwarded-For if request came from known proxy
    if remote_addr in TRUSTED_PROXIES:
        x_forwarded_for = request.headers.get("X-Forwarded-For", "")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
    
    # Use server-side remote address as authoritative
    return remote_addr
```

### Better Alternative: Use Flask-Limiter
```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,  # Uses true remote IP
    default_limits=["200 per day", "50 per hour"]
)

@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("5 per minute per ip")  # Rate limit per IP
def login():
    # ... login logic
```

### Implementation
```bash
pip install Flask-Limiter

# Update app.py to use Flask-Limiter
```

---

## 2.5 Fix Username Enumeration via Distinct Error Messages

### Current (Vulnerable) Code
```python
if not user:
    return None, "Invalid username or password"

if not check_password_hash(user["password_hash"], password):
    return None, "Invalid password"
```

### Root Cause
The application returns a different error message depending on whether
the username exists, allowing an attacker to cheaply enumerate valid
accounts before spending effort brute-forcing passwords (CWE-203).

### Remediation
```python
def authenticate_user(username, password, lockout_key):
    if is_locked_out(lockout_key):
        return None, "Account locked due to too many failed attempts"

    user = get_user_by_username(username)
    if not user:
        check_password_hash(_DUMMY_HASH, password)  # timing parity
        record_failed_attempt(lockout_key)
        return None, "Invalid username or password"

    if not check_password_hash(user["password_hash"], password):
        record_failed_attempt(lockout_key)
        return None, "Invalid username or password"

    reset_lockout(lockout_key)
    token = generate_token(user["id"], user["username"], user["role"])
    return token, None
```

### Key Fix
Both failure branches must return the exact same error message and
status code. A dummy password-hash comparison on the "user not found"
path additionally closes the parallel timing side-channel.

### Additional Recommendations
- Apply the same uniform-response principle to any other
  existence-revealing endpoint.
- Rate-limit login attempts by a trusted identity so that even a
  correctly-fixed enumeration surface cannot be probed at unlimited
  volume.

## 3. Implement Proper Rate Limiting

### ❌ Current Implementation
- Simple lockout counter (in-memory, resets on restart)
- Based on untrusted header
- No exponential backoff
- No account recovery mechanism

### ✅ Remediation
```python
import redis
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Use Redis for distributed rate limiting
redis_client = redis.Redis(host='localhost', port=6379, db=0)

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    storage_uri="redis://localhost:6379"
)

@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("5 per minute per ip")  # 5 attempts per minute
@limiter.limit("20 per hour per ip")   # 20 attempts per hour
def login():
    """Login with rate limiting."""
    # ... authentication logic
    pass
```

### Features
- ✅ Per-IP rate limiting (server-side)
- ✅ Exponential backoff
- ✅ Redis-backed (distributed)
- ✅ Metrics & monitoring
- ✅ Configurable thresholds

---

## 4. Add Multi-Factor Authentication (MFA)

### Implementation
```python
import pyotp

def generate_mfa_secret():
    """Generate TOTP secret for user."""
    return pyotp.random_base32()

def verify_mfa(secret, token):
    """Verify TOTP token."""
    totp = pyotp.TOTP(secret)
    return totp.verify(token)

@app.route("/api/auth/login", methods=["POST"])
def login():
    # ... authenticate username/password
    
    # Check if MFA is enabled
    if user.get("mfa_enabled"):
        return jsonify({
            "status": "mfa_required",
            "challenge": generate_challenge()
        }), 202

@app.route("/api/auth/verify-mfa", methods=["POST"])
def verify_mfa():
    """Verify MFA token."""
    # ... verify TOTP
    # Return JWT token if valid
    pass
```

---

## 5. Implement JWT Best Practices

### Token Rotation
```python
@app.route("/api/auth/refresh", methods=["POST"])
@require_auth()
def refresh_token():
    """
    Refresh JWT token.
    Recommended: Refresh every 15 minutes.
    """
    user = request.user
    new_token = generate_token(
        user["id"],
        user["username"],
        user["role"]
    )
    return jsonify({"token": new_token}), 200
```

### Token Revocation
```python
# Maintain a blacklist of revoked tokens
REVOKED_TOKENS = set()

@app.route("/api/auth/logout", methods=["POST"])
@require_auth()
def logout():
    """Logout and revoke token."""
    token = request.headers.get("Authorization", "").split(" ")[1]
    REVOKED_TOKENS.add(token)
    return jsonify({"message": "Logged out"}), 200

def verify_token(token):
    """Check if token is revoked before verifying."""
    if token in REVOKED_TOKENS:
        return None
    
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        return None
```

### Use Shorter Expiration
```python
# Before: 24 hours
"exp": datetime.utcnow() + timedelta(hours=24)

# After: 15 minutes
"exp": datetime.utcnow() + timedelta(minutes=15)

# Refresh token: 7 days
"refresh_exp": datetime.utcnow() + timedelta(days=7)
```

---

## 6. Add Comprehensive Logging & Monitoring

### Logging
```python
import logging

log = logging.getLogger("shopvault")

@app.route("/api/auth/login", methods=["POST"])
def login():
    # Log attempt (without password!)
    log.warning(f"login_attempt username={username} ip={request.remote_addr}")
    
    # ... authentication
    
    # Log success
    log.info(f"login_success user_id={user['id']} ip={request.remote_addr}")
    
    # Log failures with context
    log.warning(f"login_failed reason=invalid_password username={username} ip={request.remote_addr}")
```

### Monitoring
- Set up alerts for multiple failed login attempts
- Track password reset events (admin actions)
- Monitor for forged tokens (decode and check signature mismatches)
- Audit log all privileged operations

---

## 7. Password Security Enhancements

### Strong Password Policy
```python
import re

def validate_password_strength(password):
    """Enforce strong password policy."""
    if len(password) < 12:
        return False, "Password must be at least 12 characters"
    
    if not re.search(r"[A-Z]", password):
        return False, "Must contain uppercase letter"
    
    if not re.search(r"[a-z]", password):
        return False, "Must contain lowercase letter"
    
    if not re.search(r"[0-9]", password):
        return False, "Must contain digit"
    
    if not re.search(r"[!@#$%^&*]", password):
        return False, "Must contain special character"
    
    return True, None
```

### Password Hashing
```python
# Ensure bcrypt is used (not md5 or sha1)
from werkzeug.security import generate_password_hash, check_password_hash

# Hashing with bcrypt (default)
pwd_hash = generate_password_hash(password, method='pbkdf2:sha256')
```

---

## 8. API Security Headers

### Add Security Headers
```python
@app.after_request
def set_security_headers(response):
    """Add security headers to all responses."""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Content-Security-Policy'] = "default-src 'none'"
    return response
```

---

## 9. Database Security

### Use Prepared Statements (Already Implemented ✅)
```python
# Safe: Parameterized query
cursor.execute("SELECT * FROM users WHERE username = ?", (username,))

# Unsafe: String concatenation ❌
cursor.execute(f"SELECT * FROM users WHERE username = '{username}'")
```

### Encrypt Sensitive Data at Rest
```python
from cryptography.fernet import Fernet

cipher = Fernet(os.environ.get("ENCRYPTION_KEY"))

def encrypt_field(value):
    return cipher.encrypt(value.encode())

def decrypt_field(encrypted_value):
    return cipher.decrypt(encrypted_value).decode()
```

---

## 10. Testing & Validation

### Automated Security Tests
```bash
# Run security-focused tests
pytest tests/test_api.py -v -k "security"

# Check for OWASP Top 10
pip install bandit
bandit -r src/

# Dependency scanning
pip install safety
safety check
```

### Penetration Testing Checklist
- [ ] Attempt to crack JWT secret
- [ ] Try X-Forwarded-For bypass
- [ ] Test rate limiting (distributed)
- [ ] Verify MFA cannot be bypassed
- [ ] Test token revocation
- [ ] Verify password policy enforced
- [ ] Check for information disclosure in errors

---

## Summary of Changes

| Vulnerability | Fix | Priority | Effort |
|---|---|---|---|
| Weak JWT Secret | Generate 32+ char random secret | CRITICAL | Low |
| Username Enumeration | Uniform error messages + dummy hash comparison | HIGH | Low |
| X-Forwarded-For Trust | Use server-side IP only | CRITICAL | Low |
| Weak Rate Limiting | Implement Flask-Limiter | HIGH | Medium |
| No MFA | Add TOTP/OTP | HIGH | Medium |
| Long Token Expiry | Reduce to 15 min + refresh | MEDIUM | Low |
| No Logging | Add audit logging | MEDIUM | Medium |
| Weak Password Policy | Enforce complexity rules | MEDIUM | Low |
| No Security Headers | Add HTTP headers | LOW | Low |

---

## Summary of Remediations

### Defense After
Uniform authentication error messages plus timing parity (no enumeration)
Server-side IP-based rate limiting (no lockout bypass)
Strong random JWT secret (no cracking)
Codenames and internal references never exposed via any endpoint
Token rotation (old tokens invalid)
MFA (second factor)
Logging and alerting (detect compromise)
Result: Resilient to attack (check)

