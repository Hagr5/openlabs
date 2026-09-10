# syntax=docker/dockerfile:1.7
# =============================================================================
# Dockerfile — VaultAPI CTF Challenge (FastAPI / uvicorn / hardened runtime)
# =============================================================================

############################
# STAGE 1 — BUILDER
############################
FROM python:3.12.14-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

COPY app/requirements.txt .
RUN pip install --upgrade pip \
 && pip install -r requirements.txt

############################
# STAGE 2 — RUNTIME
############################
FROM python:3.12.14-slim

LABEL org.opencontainers.image.title="api-vault-ctf" \
      org.opencontainers.image.description="CTF challenge — VaultAPI privilege escalation"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}" \
    APP_HOME=/app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1000 ctf \
 && useradd  --system --uid 1000 --gid ctf \
             --home-dir /home/ctf --create-home \
             --shell /usr/sbin/nologin ctf

COPY --from=builder /opt/venv /opt/venv

WORKDIR ${APP_HOME}
COPY --chown=ctf:ctf app/ .

RUN chmod -R go-w /app

USER ctf:ctf

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
