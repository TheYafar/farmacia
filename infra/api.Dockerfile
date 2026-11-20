# Imagen de la API. Se construye desde la raíz del repositorio:
#   docker build -f infra/api.Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @farmacia/shared && npm run build -w @farmacia/api

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
WORKDIR /app/apps/api
RUN mkdir -p /app/apps/api/uploads && chown node:node /app/apps/api/uploads
# Nunca corre como root dentro del contenedor.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3000/api/v1/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Aplica las migraciones pendientes y arranca.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
