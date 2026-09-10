FROM python:3.12-slim
WORKDIR /srv

# No compiler toolchain baked in beyond what bcrypt needs; keep image lean.
RUN apt-get update && apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*

# Build context is now the repo root (see docker-compose.yml), so paths
# below are relative to ~/cloudvault, not ~/cloudvault/api.
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared ./shared
COPY api/app ./app
RUN mkdir -p /srv/data

# Seed then serve. Idempotent seed (see app/seed.py) means `docker compose
# restart` doesn't duplicate the player account, and `down -v` + `up` gives
# a clean deterministic reset per DESIGN.md section 21.
CMD ["sh", "-c", "python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port 8080"]

EXPOSE 8080
