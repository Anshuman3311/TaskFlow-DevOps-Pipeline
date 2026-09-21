# ============================================================
# TaskFlow API - Production Docker Image
# Multi-stage build for a smaller and more secure runtime image
# ============================================================


# -------------------------
# Stage 1: Build
# -------------------------
FROM node:20-alpine3.23 AS build

WORKDIR /app

# Apply available Alpine security updates
RUN apk upgrade --no-cache

# Copy dependency manifests first for better Docker layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source
COPY src ./src
COPY public ./public


# -------------------------
# Stage 2: Runtime
# -------------------------
FROM node:20-alpine3.23

WORKDIR /app

ENV NODE_ENV=production

# Apply available security updates, create persistent-data directory,
# and remove npm/npx from the runtime image because the application
# only requires the Node.js runtime to execute.
RUN apk upgrade --no-cache \
    && mkdir -p /app/data \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

# Copy only the files required to run the application
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY package*.json ./

# Application port
EXPOSE 3000

# Container-level health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start TaskFlow API
CMD ["node", "src/app.js"]
