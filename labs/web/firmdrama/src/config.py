"""Environment-backed configuration for the disposable firmdrama lab."""

from __future__ import annotations

import os


class Config:
    """Configuration with safe local-development defaults.

    Compose supplies the runtime database and browser settings. Direct factory
    callers can leave database readiness optional for isolated checks.
    """

    APP_NAME = os.getenv("FIRMDRAMA_APP_NAME", "firmdrama")
    ENVIRONMENT = os.getenv("FIRMDRAMA_ENVIRONMENT", "development")
    HOST = os.getenv("FIRMDRAMA_HOST", "0.0.0.0")
    PORT = int(os.getenv("FIRMDRAMA_PORT", "8000"))
    LOG_LEVEL = os.getenv("FIRMDRAMA_LOG_LEVEL", "info")
    DATABASE_REQUIRED = os.getenv("FIRMDRAMA_DATABASE_REQUIRED", "false").lower() == "true"
    DB_HOST = os.getenv("FIRMDRAMA_DB_HOST", "127.0.0.1")
    DB_PORT = int(os.getenv("FIRMDRAMA_DB_PORT", "3306"))
    DB_NAME = os.getenv("FIRMDRAMA_DB_NAME", "firmdrama")
    DB_USER = os.getenv("FIRMDRAMA_DB_USER", "firmdrama")
    DB_PASSWORD = os.getenv("FIRMDRAMA_DB_PASSWORD", "firmdrama-local-only")
    MAX_CONTENT_LENGTH = int(os.getenv("FIRMDRAMA_MAX_CONTENT_LENGTH", "65536"))
    MAX_FORM_MEMORY_SIZE = int(os.getenv("FIRMDRAMA_MAX_FORM_MEMORY_SIZE", "16384"))
    MAX_FORM_PARTS = int(os.getenv("FIRMDRAMA_MAX_FORM_PARTS", "50"))
    TRUSTED_HOSTS = [
        host.strip()
        for host in os.getenv(
            "FIRMDRAMA_TRUSTED_HOSTS", "localhost,127.0.0.1,firmdrama"
        ).split(",")
        if host.strip()
    ]
    BROWSER_COOKIE_NAME = "firmdrama_session"
    BROWSER_COOKIE_SECURE = os.getenv("FIRMDRAMA_COOKIE_SECURE", "false").lower() == "true"


def load_config() -> type[Config]:
    """Return the configuration class used by the application factory."""

    return Config
