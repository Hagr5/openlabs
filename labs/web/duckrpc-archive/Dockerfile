# syntax=docker/dockerfile:1.7

# =============================================================================
# Dockerfile — DuckRPC Archive CTF Challenge
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

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

# Create isolated Python environment
RUN python -m venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}"

# Install dependencies
COPY src/requirements.txt .

RUN pip install --upgrade pip \
 && pip install -r requirements.txt


############################
# STAGE 2 — RUNTIME
############################
FROM python:3.12-slim

LABEL org.opencontainers.image.title="DuckRPC Archive" \
      org.opencontainers.image.description="gRPC SQL Injection CTF Challenge" \
      org.opencontainers.image.licenses="MIT"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}" \
    APP_HOME=/app \
    PORT=50051

# Install tini only
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1000 ctf \
 && useradd --system \
            --uid 1000 \
            --gid ctf \
            --home-dir /home/ctf \
            --create-home \
            --shell /usr/sbin/nologin \
            ctf

# Copy Python virtual environment
COPY --from=builder /opt/venv /opt/venv

WORKDIR ${APP_HOME}

# Copy application source
COPY --chown=ctf:ctf src/ .

# Copy proto definition
COPY --chown=ctf:ctf proto/ /app/proto/

# Generate Python gRPC files
RUN python -m grpc_tools.protoc \
    -I /app/proto \
    --python_out=/app/generated \
    --grpc_python_out=/app/generated \
    /app/proto/duckrpc.proto

# Fix ownership
RUN chown -R ctf:ctf /app \
 && chmod -R go-w /app

USER ctf:ctf

EXPOSE 50051

ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["python", "server.py"]