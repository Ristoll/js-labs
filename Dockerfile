
# syntax=docker/dockerfile:1

########## Stage 1: builder ##########
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace package manifests.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

# Install dependencies.
RUN npm ci

# Copy source files.
COPY . .

# Build client.
RUN npm run build


########## Stage 2: runtime ##########
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy runtime dependencies.
COPY --from=builder /app/node_modules ./node_modules

# Copy built client.
COPY --from=builder /app/client/dist ./client/dist

# Copy shared package.
COPY --from=builder /app/shared ./shared

# Copy server source.
COPY --from=builder /app/server/src ./server/src

# Copy package manifests.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server/package.json ./server/package.json

# Create non-root user and writable replay directory.
RUN addgroup -S appuser \
    && adduser -S appuser -G appuser \
    && mkdir -p /app/server/replays \
    && chown -R appuser:appuser /app/server/replays

# Run application as non-root user.
USER appuser

EXPOSE 3000

# Container healthcheck.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-3000}/health || exit 1

# Start Node.js server.
CMD ["node", "--experimental-strip-types", "server/src/index.ts"]
