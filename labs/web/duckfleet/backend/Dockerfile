FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends protobuf-compiler python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY protos ./protos
RUN protoc -I protos --include_imports --descriptor_set_out=/app/proto-descriptors.bin \
  protos/auth.proto \
  protos/fleet.proto \
  protos/events.proto \
  protos/admin.proto \
  protos/grpc/health/v1/health.proto \
  protos/grpc/reflection/v1alpha/reflection.proto

COPY backend/src ./src

ENV NODE_ENV=production \
  DB_PATH=/data/duckfleet.db \
  PROTO_DIR=/app/protos \
  PROTO_DESCRIPTOR_SET=/app/proto-descriptors.bin

VOLUME ["/data"]

CMD ["node", "src/server.js"]
