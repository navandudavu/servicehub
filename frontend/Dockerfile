# --- build the React app ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Caddy serves the static files and proxies /api (config: deploy/Caddyfile, mounted by compose) ---
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
