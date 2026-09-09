FROM node:20.19.5-alpine3.21

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source
COPY server.js ./
COPY src ./src

# HTTP (REST + GraphQL + web UI) and gRPC ports
EXPOSE 3000 50051

# Basic container-level health check against the HTTP surface
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
