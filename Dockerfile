# Self-hosted Midnight Ink. No credentials are copied into the image.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    MIDNIGHT_INK_DATA_DIR=/app/.data
COPY --from=build /app /app
EXPOSE 3031
# Upstream container interface is internal; Podman publishes to host loopback only.
CMD ["node","node_modules/next/dist/bin/next","start","--hostname","0.0.0.0","--port","3031"]
