# Multi-stage: final image is Nitro output + Prisma migrate tools only.
# Alpine keeps the registry push small enough to complete reliably.
# Used by the deploy-fallback job (full-source Liara Iran build).
# Primary deploy uses Dockerfile.runtime + prebuilt nitro-output instead.
# Do not add RUN --mount=type=cache — Liara's builder rejects BuildKit mounts.
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl ca-certificates libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma
# Skip postinstall here: it runs Nuxt preparation and Prisma generation, both
# of which are repeated by the explicit production build below.
RUN npm ci --ignore-scripts --no-audit --no-fund --prefer-offline
COPY . .
RUN npm run build
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
RUN apk add --no-cache openssl ca-certificates libc6-compat

# Nitro server (self-contained) + start script + Prisma for migrate/seed on boot
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/start-production.mjs ./scripts/start-production.mjs
COPY --from=builder /app/scripts/lib ./scripts/lib
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared

# Minimal manifest first — npm arborist crashes when --no-save targets are added
# on top of the full app package.json without a lockfile in this stage.
RUN echo '{"name":"inbox-runtime","private":true}' > package.json \
  && npm install --omit=dev --no-save --ignore-scripts --no-audit --no-fund --prefer-offline \
    prisma@6.19.3 \
    @prisma/client@6.19.3 \
    tsx@4.22.4 \
  && npx prisma generate \
  && npm cache clean --force

COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]
