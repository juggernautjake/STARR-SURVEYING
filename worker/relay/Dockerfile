# worker/relay/Dockerfile — the phone receptionist's relay. One file, one dependency.
FROM node:22-bookworm-slim

ENV NODE_ENV=production PORT=3200
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

ARG BUILD_SHA=unknown
ENV BUILD_SHA=${BUILD_SHA}

USER node
EXPOSE 3200
CMD ["node", "server.mjs"]
