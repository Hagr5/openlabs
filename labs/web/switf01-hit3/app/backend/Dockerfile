FROM node:20.18.0-alpine3.20

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 4000
EXPOSE 50051

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
