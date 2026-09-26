# syntax=docker/dockerfile:1
# Imagen de la API (apps/api): bundle autocontenido de esbuild + migraciones SQL.

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@processiq/api..." \
 && pnpm --filter @processiq/api build

FROM node:22-alpine
# Versión desplegada (commit): la muestra la pantalla «Sistema»
ARG VERSION=local
ENV NODE_ENV=production PORT=8080 CARPETA_MIGRACIONES=/app/dist/migraciones PROCESSIQ_VERSION=$VERSION
WORKDIR /app
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/salud >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/servidor.js"]
