# --- build stage: better-sqlite3 is a native module and needs a compiler ---
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- runtime stage ---
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    TZ=Europe/Belgrade \
    PORT=4000 \
    DB_PATH=/data/servicehub.db \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# /app must be writable by the node user: the entrypoint links the Firebase key into it
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data \
 && chown -R node:node /data /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
