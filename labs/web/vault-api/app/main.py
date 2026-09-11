"""VaultAPI — CTF Challenge Main Application.

This is an internal employee management API with intentional security
vulnerabilities designed for CTF training.

Vulnerabilities:
  1. Token creation endpoint trusts client-controlled username (privilege escalation)
  2. Admin API requires internal service header (trust boundary)
  3. User profile exposes legacy MD5 password hash (credential exposure)
"""

import hashlib
from fastapi import FastAPI, HTTPException, Request, Header, Depends
from fastapi.responses import JSONResponse
from typing import Optional

from config import (
    FLAG, INTERNAL_HEADER, INTERNAL_HEADER_VALUE,
    ANALYST_USERNAME, ANALYST_PASSWORD, ADMIN_USERNAME, ADMIN_PASSWORD,
)
from database import (
    init_db, seed_data, get_user_by_username, get_user_by_id,
    get_all_users, reset_db,
)
from auth import create_token, decode_token, verify_password
from models import (
    LoginRequest, CreateTokenRequest, TokenResponse,
    UserResponse, ErrorResponse, HealthResponse, ProfileResponse,
)

app = FastAPI(
    title="VaultAPI",
    description="Internal Employee Management API",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
)


@app.on_event("startup")
def startup():
    init_db()
    seed_data()


# ---------------------------------------------------------------------------
# Dependency: extract and validate Bearer token
# ---------------------------------------------------------------------------
async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = auth[7:]
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = get_user_by_username(payload["sub"])
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_internal(request: Request, user: dict = Depends(require_admin)) -> dict:
    header_val = request.headers.get(INTERNAL_HEADER, "")
    if header_val.lower() != INTERNAL_HEADER_VALUE.lower():
        raise HTTPException(
            status_code=403,
            detail="Access denied. Internal service verification required.",
        )
    return user


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "service": "VaultAPI", "version": "1.0.0"}


@app.post("/api/v1/auth/login")
def login(req: LoginRequest):
    user = get_user_by_username(req.username)
    if user is None or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["username"], user["role"], user["id"])
    return {
        "token": token,
        "token_type": "bearer",
        "expires_in": 3600,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
        },
    }


@app.post("/api/v1/auth/logout")
def logout():
    return {"message": "Logged out successfully"}


# ---------------------------------------------------------------------------
# VULNERABLE ENDPOINT: create-token
#
# This endpoint is a legacy "admin service account" utility meant to mint
# tokens for privileged (admin) accounts. It is intentionally missing the
# authorization check that the *caller* is allowed to mint admin tokens —
# it only requires that the caller is authenticated and that the target
# account is an admin.
#
# A normal authenticated user can therefore request a token for `admin` and
# receive a real, valid admin token. This is an Improper Authentication /
# Privilege Escalation vulnerability.
# ---------------------------------------------------------------------------
@app.post("/api/v1/auth/create-token")
def create_token_endpoint(
    req: CreateTokenRequest,
    user: dict = Depends(get_current_user),
):
    target = get_user_by_username(req.username)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    # INTENTIONAL VULNERABILITY: missing caller authorization check.
    # The endpoint only enforces that the *target* is an admin service
    # account; it never verifies that the authenticated caller is permitted
    # to mint admin tokens.
    if target["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Token creation is restricted to admin service accounts",
        )

    token = create_token(target["username"], target["role"], target["id"])
    return {
        "token": token,
        "token_type": "bearer",
        "expires_in": 3600,
        "user": {
            "id": target["id"],
            "username": target["username"],
            "role": target["role"],
        },
    }


# ---------------------------------------------------------------------------
# Authenticated user endpoints
# ---------------------------------------------------------------------------
@app.get("/api/v1/profile")
def get_profile(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
        "bio": user["bio"],
    }


@app.get("/api/v1/users/me/archive")
def get_my_archive(user: dict = Depends(get_current_user)):
    if user["username"] != "mohamed":
        raise HTTPException(
            status_code=403,
            detail="Access denied. Archive available only to designated users.",
        )
    return {
        "archive": True,
        "filename": "mohamed_archive.enc",
        "flag": FLAG,
        "message": "Access granted. Legacy archive recovered.",
    }


# ---------------------------------------------------------------------------
# Admin endpoints — require admin token + internal header
# ---------------------------------------------------------------------------
@app.get("/api/v1/admin")
def admin_dashboard(user: dict = Depends(require_internal)):
    return {
        "message": "Welcome to VaultAPI Admin Dashboard",
        "admin": user["username"],
        "stats": {
            "total_users": len(get_all_users()),
            "active_sessions": 3,
            "system_status": "operational",
        },
    }


@app.get("/api/v1/admin/users")
def admin_list_users(user: dict = Depends(require_internal)):
    users = get_all_users()
    return {
        "users": [
            {
                "id": u["id"],
                "username": u["username"],
                "email": u["email"],
                "role": u["role"],
                "bio": u["bio"],
                "created_at": u["created_at"],
                "legacy_password_hash": u["legacy_password_hash"],
            }
            for u in users
        ],
        "total": len(users),
    }


@app.get("/api/v1/admin/users/{user_id}")
def admin_get_user(user_id: int, user: dict = Depends(require_internal)):
    target = get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": target["id"],
        "username": target["username"],
        "email": target["email"],
        "role": target["role"],
        "bio": target["bio"],
        "created_at": target["created_at"],
        "legacy_password_hash": target["legacy_password_hash"],
    }


# ---------------------------------------------------------------------------
# Internal-only endpoint
# ---------------------------------------------------------------------------
@app.get("/api/v1/internal")
def internal_endpoint(user: dict = Depends(require_internal)):
    return {
        "message": "Internal service API access verified",
        "service": "vault-internal",
        "status": "active",
    }


# ---------------------------------------------------------------------------
# Honey / decoy endpoints — return harmless data, no secrets
# ---------------------------------------------------------------------------
@app.get("/api/v1/debug")
def debug_decoy():
    return {"debug": "no debug information available", "status": "disabled"}


@app.get("/api/v1/admin/debug")
def admin_debug_decoy():
    return {"error": "forbidden", "message": "Admin authentication required"}


@app.get("/api/v1/internal/config")
def internal_config_decoy():
    return {"error": "forbidden", "message": "Internal access required"}


@app.get("/api/v1/backup")
def backup_decoy():
    return {"error": "not_found", "message": "No backup data available"}


@app.get("/api/v1/admin/export")
def admin_export_decoy():
    return {"error": "forbidden", "message": "Admin access required"}


@app.get("/api/v1/.env")
def env_decoy():
    return {"error": "not_found", "message": "Resource not available"}


# ---------------------------------------------------------------------------
# 401 demo endpoint
# ---------------------------------------------------------------------------
@app.get("/api/v1/protected")
def protected_resource(user: dict = Depends(get_current_user)):
    return {"message": "You have accessed a protected resource", "user": user["username"]}


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "http_error", "message": str(exc.detail), "status_code": exc.status_code},
    )


# ---------------------------------------------------------------------------
# Reset endpoint (for validation)
# ---------------------------------------------------------------------------
@app.post("/api/v1/_internal/reset")
def reset_endpoint():
    reset_db()
    return {"message": "Database reset to initial state"}
