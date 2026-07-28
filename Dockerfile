# =============================================================================
# YuiHime - Docker Multi-Stage Build
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build tools required for native modules (better-sqlite3, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build web frontend (outputs to dist/web/)
RUN npm run build:web

# Build server bundle (outputs to dist/server.cjs)
RUN npm run build:server

# ---------------------------------------------------------------------------
# Stage 2: Production
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS production

WORKDIR /app

# Install only runtime dependencies (no build tools needed — pre-built native binaries)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built artifacts and static assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/share ./src/share

# Create data directory for persistent storage
RUN mkdir -p /home/user/.yuihime/data \
             /home/user/.yuihime/addons \
             /home/user/.yuihime/agent \
             /home/user/.yuihime/models \
             /home/user/.yuihime/user_data

# Create non-root user
RUN useradd --create-home --shell /bin/bash yuihime \
  && chown -R yuihime:yuihime /home/user/.yuihime \
  && chown -R yuihime:yuihime /app

USER yuihime

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV YUIHIME_SYSTEM_ROOT=/home/user/.yuihime

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://127.0.0.1:3000/api/health > /dev/null || exit 1

# Start the production server
CMD ["npm", "start"]