# syntax=docker/dockerfile:1
# Imagen del intermediario de IA (apps/intermediario).

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@processiq/intermediario..." \
 && pnpm --filter @processiq/intermediario build \
 && pnpm --filter @processiq/intermediario deploy --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/intermediario/dist ./dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/health >/dev/null || exit 1
CMD ["node", "dist/index.js"]
