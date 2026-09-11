"""Pydantic models for VaultAPI."""

from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateTokenRequest(BaseModel):
    username: str


class TokenResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    bio: str
    created_at: str
    legacy_password_hash: Optional[str] = None


class ErrorResponse(BaseModel):
    error: str
    message: str
    status_code: int


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class ProfileResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    bio: str
