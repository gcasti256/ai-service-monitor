FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/server/package.json packages/server/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm ci

# Copy source
COPY . .

# Build SDK and server (dashboard is built separately with Vite)
RUN npm run build -w packages/sdk -w packages/server

# Build dashboard with Vite
FROM base AS dashboard-build
RUN npm run build -w packages/dashboard

# --- Server image ---
FROM node:20-alpine AS server
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=base /app/packages/sdk/dist packages/sdk/dist
COPY --from=base /app/packages/sdk/package.json packages/sdk/
COPY --from=base /app/packages/server/dist packages/server/dist
COPY --from=base /app/packages/server/package.json packages/server/
COPY --from=base /app/package.json .

# Production dependencies only
COPY --from=base /app/node_modules node_modules
RUN npm prune --omit=dev 2>/dev/null || true

RUN mkdir -p /app/data && chown -R app:app /app

USER app
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3100/health || exit 1

CMD ["node", "packages/server/dist/index.js"]

# --- Dashboard image ---
FROM nginx:alpine AS dashboard
COPY --from=dashboard-build /app/packages/dashboard/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# nginx:alpine runs as uid 101 (nginx) by default
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

USER nginx
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
