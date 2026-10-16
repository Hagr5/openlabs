FROM node:20.17.0-bookworm-slim

WORKDIR /ci

COPY run-pipeline.js ./run-pipeline.js
COPY smoke-test.js ./smoke-test.js
COPY project ./project

CMD ["node", "/ci/run-pipeline.js"]
