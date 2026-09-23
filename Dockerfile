# syntax=docker/dockerfile:1

# ─── deps: install all dependencies (incl. devDependencies needed to build) ───
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ─── build: compile the Vite frontend and the Express/TS backend ─────────────
FROM node:20-alpine AS build
WORKDIR /app
# Vite bakes VITE_* vars into the bundle at build time (.dockerignore keeps
# .env files out of this stage on purpose) — off by default so the dev-login
# UI never ships in a normal build; opt in per-build with --build-arg for a
# short-lived demo before Google OAuth is configured.
ARG VITE_DEV_LOGIN=false
ARG VITE_AUTO_LOGIN_EMAIL=""
ENV VITE_DEV_LOGIN=$VITE_DEV_LOGIN
ENV VITE_AUTO_LOGIN_EMAIL=$VITE_AUTO_LOGIN_EMAIL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run server:build

# ─── runtime: minimal production image ────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled backend + built frontend (server/index.ts serves dist/ statically)
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Raw .sql migration files — read from disk at runtime, not compiled by tsc
COPY server/db/migrations ./server/db/migrations

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown -R app:app /app

USER app
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist-server/index.js"]
