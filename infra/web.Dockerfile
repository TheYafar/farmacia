# Imagen del servidor web: compila la app y la sirve con Caddy (HTTPS automático).
#   docker build -f infra/web.Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @farmacia/shared && npm run build -w @farmacia/web

FROM caddy:2.8.4-alpine
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
