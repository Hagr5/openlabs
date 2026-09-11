FROM node:20-alpine

WORKDIR /app

RUN addgroup -g 1001 -S platform && adduser -u 1001 -S platform -G platform

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src
COPY public ./public

RUN mkdir -p /data && chown platform:platform /data

USER platform

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "src/server.js"]
