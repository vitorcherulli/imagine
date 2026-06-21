# ============================================================
# Imagine V2 — builder/migrator image (runs Drizzle migrations)
# Build: docker build -f Dockerfile.builder -t taticweb/imagine-web-builder:latest .
# ============================================================

FROM node:20-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates netcat-openbsd \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/app.db

RUN mkdir -p /app/data

CMD ["npx", "tsx", "src/lib/db/migrate.ts"]
