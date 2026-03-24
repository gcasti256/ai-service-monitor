FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/server/package.json packages/server/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm install

# Copy source
COPY . .

# Build all packages
RUN npm run build

# --- Server image ---
FROM node:20-alpine AS server
WORKDIR /app

COPY --from=base /app/packages/sdk/dist packages/sdk/dist
COPY --from=base /app/packages/sdk/package.json packages/sdk/
COPY --from=base /app/packages/server/dist packages/server/dist
COPY --from=base /app/packages/server/package.json packages/server/
COPY --from=base /app/package.json .
COPY --from=base /app/node_modules node_modules

EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3100/health || exit 1

CMD ["node", "packages/server/dist/index.js"]

# --- Dashboard image ---
FROM nginx:alpine AS dashboard
COPY --from=base /app/packages/dashboard/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
