# Dockerfile for the FieldOps 360 lab.
# Two stages. The builder holds the toolchain. The runtime ships only the
# venv, the app, and tini.

############################
# STAGE 1: BUILDER
############################
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

COPY app/requirements.txt .
RUN pip install --upgrade pip \
 && pip install -r requirements.txt

############################
# STAGE 2: RUNTIME
############################
FROM python:3.12-slim

LABEL org.opencontainers.image.title="fieldops-360" \
      org.opencontainers.image.description="Web lab. Tenant portal with email open tracking."

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}" \
    APP_HOME=/app

# curl runs the health probe. tini runs as PID 1. The ctf account has no
# login shell.
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

# The bootstrap stays root owned and read only.
COPY app/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh \
 && chmod -R go-w /app

USER ctf:ctf

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
