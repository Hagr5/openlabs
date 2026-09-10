# =========================================================
# techvault-api — Dockerfile
# Multi-stage build: compile native deps (better-sqlite3) in a full
# build image, then ship a slim runtime image with no build toolchain,
# a non-root user, and tini as PID 1.
# =========================================================

# ---- Stage 1: builder ----
FROM node:20-bookworm-slim AS builder

WORKDIR /build

# better-sqlite3 needs a C++ toolchain + python to compile its native
# binding — kept entirely in this stage, never shipped to runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY app ./app
COPY schema.graphql ./schema.graphql

# ---- Stage 2: runtime ----
FROM node:20-bookworm-slim AS runtime

# tini: correct signal handling / zombie reaping as PID 1 — matters
# because previewService spawns short-lived `sh -c` child processes.
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# Non-root runtime user.
RUN groupadd -r techvault && useradd -r -g techvault -d /app -s /usr/sbin/nologin techvault

WORKDIR /app

COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/app/. ./
COPY --from=builder /build/schema.graphql ./schema.graphql
COPY entrypoint.sh /app/entrypoint.sh

RUN mkdir -p /app/data && chmod +x /app/tools/preview-render.sh /app/entrypoint.sh && chown -R techvault:techvault /app

ENV NODE_ENV=production \
    DB_PATH=/app/data/techvault.db \
    PORT=4000

EXPOSE 4000

USER techvault

ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
CMD ["node", "server.js"]
