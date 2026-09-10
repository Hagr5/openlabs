FROM node:20-bookworm-slim

WORKDIR /app

COPY gateway/package.json gateway/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY protos ./protos
COPY gateway/scripts ./scripts
COPY gateway/src ./src
COPY gateway/public ./public

RUN node scripts/gen-descriptors.js protos public/descriptors.js \
  && mkdir -p public/vendor \
  && cp node_modules/protobufjs/dist/protobuf.min.js public/vendor/protobuf.min.js

ENV NODE_ENV=production \
  PORT=4000 \
  BACKEND_ADDR=backend:50051

EXPOSE 4000

CMD ["node", "src/server.js"]
