FROM node:24.22.1-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Compilation needs more heap than the production process.
ENV NODE_OPTIONS=--max-old-space-size=1024
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.cjs ./
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24.22.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.cjs ./
COPY --from=build --chown=node:node /app/package*.json ./
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
