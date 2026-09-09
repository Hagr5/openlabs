FROM node:20-alpine

WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

COPY app/server.js ./
COPY app/src ./src

EXPOSE 3000 50051

CMD ["node", "server.js"]