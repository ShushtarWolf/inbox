# Multi-stage: final image is Nitro output + Prisma migrate tools only.
# Keeps Liara registry push under ~300MB instead of ~2.5GB (full node_modules build).

FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Nitro server (self-contained) + start script + Prisma for migrate/seed on boot
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/start-production.mjs ./scripts/start-production.mjs
COPY --from=builder /app/scripts/lib ./scripts/lib
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared

# Only packages needed by start-production (migrate / optional seed / PrismaClient)
RUN npm install --omit=dev --no-save \
    prisma@6.19.3 \
    @prisma/client@6.19.3 \
    tsx@4.22.4 \
  && npx prisma generate \
  && npm cache clean --force

EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]
