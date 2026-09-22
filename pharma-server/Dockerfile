# PharmDetect — Pharmaceutical Database server
FROM node:20-slim

# better-sqlite3 ships prebuilt binaries for common platforms, but we install
# build tools too so the image still works if no prebuild matches the host.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

# Data directory for the SQLite database — mount a volume here in production
# so the database survives container restarts and redeploys.
RUN mkdir -p /data
ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/api/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
