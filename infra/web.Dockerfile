# syntax=docker/dockerfile:1
# Imagen web: build de apps/web (Vite) servido por Caddy con HTTPS automatico.

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@processiq/web..." \
 && pnpm --filter @processiq/web build

FROM caddy:2-alpine
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
