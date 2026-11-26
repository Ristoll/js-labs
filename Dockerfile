# syntax=docker/dockerfile:1
# Lab 08 M3 — Multi-stage Dockerfile for the js-labs monorepo.
#
# Stage 1 (builder): install all deps (incl. dev for vite), build the client.
# Stage 2 (runtime): minimal alpine image, production deps only, non-root user,
# exec-form CMD so SIGTERM reaches Node directly, HEALTHCHECK on /health.

########## Stage 1: builder ##########
FROM node:22-alpine AS builder

WORKDIR /app

# Install workspace roots first for better layer caching.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci

# Copy source and build the client (vite build -> client/dist).
COPY . .
RUN npm run build

########## Stage 2: runtime ##########
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Production-only install from the builder stage.
COPY --from=builder /app/node_modules ./node_modules
# Built client static assets served by the server.
COPY --from=builder /app/client/dist ./client/dist
# Shared package (server imports bare `shared/*` via the node_modules symlink
# created by npm workspaces; the symlink target is /app/shared).
COPY --from=builder /app/shared ./shared
# Server source (run via Node native type stripping, no tsc step).
COPY --from=builder /app/server/src ./server/src
# Package manifests (needed by workspace resolution at runtime).
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server/package.json ./server/package.json

# Non-root user for defense in depth.
RUN addgroup -S appuser && adduser -S appuser -G appuser
USER appuser

EXPOSE 3000

# Liveness/readiness probe: platform restarts on failure, load balancer waits
# for /ready (which flips to 503 during graceful shutdown).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Exec form: SIGTERM reaches Node directly (not a shell), enabling graceful
# shutdown within the supervisor's grace period.
CMD ["node", "--experimental-strip-types", "server/src/index.ts"]
