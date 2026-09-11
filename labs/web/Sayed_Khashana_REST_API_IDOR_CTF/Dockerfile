FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
RUN addgroup -S app && adduser -S app -G app && mkdir /app/data && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
