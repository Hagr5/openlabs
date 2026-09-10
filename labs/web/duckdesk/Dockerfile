FROM node:20-alpine AS deps
WORKDIR /build
COPY package.json ./
RUN apk add --no-cache python3 make g++ && \
    npm install --production

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /build/node_modules ./node_modules
COPY . .
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 4000
CMD ["node", "app/index.mjs"]
