FROM node:20-alpine

# Dedicated non-root execution identity for customer function packages.
# All provisioned packages and spawned processes run under this account.
RUN apk add --no-cache su-exec

RUN addgroup -g 1051 -S sbx_duck1051 && \
    adduser -u 1051 -S sbx_duck1051 -G sbx_duck1051 -h /packages -s /sbin/nologin

WORKDIR /app

COPY package.json ./
# The runtime is dependency-free by design; no install step.

COPY src ./src
COPY healthcheck.mjs ./healthcheck.mjs
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh && \
    mkdir -p /packages && \
    chown -R sbx_duck1051:sbx_duck1051 /packages /app

ENV NODE_ENV=production
ENV PORT=8081
ENV PACKAGES_DIR=/packages
ENV SBX_UID=1051
ENV SBX_GID=1051

# The entrypoint materializes the runtime workspace and drops to the sandbox
# identity before starting the server.
ENTRYPOINT ["/entrypoint.sh"]

EXPOSE 8081

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=12 \
  CMD ["node", "/app/healthcheck.mjs"]

CMD ["node", "src/server.js"]
