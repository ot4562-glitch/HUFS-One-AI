# Build only after separate approval for network/package/image retrieval.
# Explicit copies avoid shipping the checkout, operator files or private originals.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY packages ./packages
COPY apps ./apps
COPY tools/strip_build_sourcemaps.mjs ./tools/strip_build_sourcemaps.mjs
RUN npm run build:api && npm run build:web

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production APP_ENV=production AI_PROVIDER_ENABLED=false LAYA_ENABLED=false
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/contracts ./packages/contracts
COPY --from=build --chown=node:node /app/dist/apps ./dist/apps
COPY --from=build --chown=node:node /app/dist/packages ./dist/packages
USER node
# Actual existing entrypoint deliberately refuses production until auth/DB integration.
CMD ["node", "dist/apps/api/src/main.js"]

FROM nginx:1.28-alpine AS edge
COPY --from=build /app/dist/web /srv/web
USER nginx
# Config/TLS must be explicitly mounted. No envsubst or generated default vhost.
ENTRYPOINT []
CMD ["nginx", "-c", "/etc/nginx/private.conf", "-g", "daemon off;"]
