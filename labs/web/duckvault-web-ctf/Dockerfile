# syntax=docker/dockerfile:1.7
# =============================================================================
# Dockerfile — CTF Web Challenge (Flask / Gunicorn / hardened runtime)
#
# BUILD POSTURE
#   Stage 1 (builder): installs deps into an isolated venv; build tools
#                      never reach the runtime image.
#   Stage 2 (runtime): python:3.12-slim + venv + app, owned by UID 1000.
#
# SECURITY POSTURE (enforced here; compose adds defense-in-depth)
#   * Non-root UID/GID 1000, nologin shell.
#   * tini as PID 1 — signal forwarding & zombie reaping.
#   * No pip cache, no bytecode (PYTHONDONTWRITEBYTECODE).
#   * Only curl + tini added beyond python-slim.
#   * Flag is NOT in the image (runtime injection via env or :ro mount).
# =============================================================================

############################
# STAGE 1 — BUILDER
############################
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Build deps ONLY in this stage — they never ship in the runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

# Isolated venv, copied wholesale into the runtime stage. Keeps the runtime
# free of pip/setuptools/wheel and guarantees CI/prod dependency parity.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

# requirements.txt first — maximizes layer cache reuse across app-only edits.
COPY src/requirements.txt .
RUN pip install --upgrade pip \
 && pip install -r requirements.txt

############################
# STAGE 2 — RUNTIME
############################
FROM python:3.12-slim

LABEL org.opencontainers.image.title="chal-web-duckvault" \
      org.opencontainers.image.description="CTF web challenge — duckvault" \
      org.opencontainers.image.licenses="MIT"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}" \
    APP_HOME=/app

# curl — HEALTHCHECK probe.  tini — PID 1 (signals + zombie reaping).
# Dedicated system account (-r) with nologin: even with code execution,
# there is no interactive shell.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1000 ctf \
 && useradd  --system --uid 1000 --gid ctf \
             --home-dir /home/ctf --create-home \
             --shell /usr/sbin/nologin ctf

COPY --from=builder /opt/venv /opt/venv

WORKDIR ${APP_HOME}
COPY --chown=ctf:ctf src/ .

# Root-owned & non-writable so an exploited app cannot modify its bootstrap.
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh \
 && chmod -R go-w /app

USER ctf:ctf

EXPOSE 8000

# Dedicated /health endpoint: independent of business logic so a broken
# challenge page still reports lifecycle status accurately.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# tini (PID 1) -> entrypoint -> exec gunicorn. Signal chain is clean.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
