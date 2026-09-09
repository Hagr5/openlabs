FROM node:20.19.5-alpine3.21

WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

COPY app/server.js ./
COPY app/src ./src

EXPOSE 3000 50051

CMD ["node", "server.js"]