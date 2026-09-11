# =========================================================
# billing-core — Dockerfile
# Simple internal service, no native dependencies. Still hardened:
# non-root user, tini as PID 1, no build toolchain in the final image.
# =========================================================

FROM node:20-bookworm-slim AS builder

WORKDIR /build
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

FROM node:20-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r billing && useradd -r -g billing -d /app -s /usr/sbin/nologin billing

WORKDIR /app

COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/src ./src

RUN chown -R billing:billing /app

ENV NODE_ENV=production \
    PORT=5000

EXPOSE 5000

USER billing

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
