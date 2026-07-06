# NestJS API image. Build from the REPO ROOT (needs the monorepo + Prisma schema):
#   docker build -f apps/api/Dockerfile -t pdash-api .
# syntax=docker/dockerfile:1

FROM node:20-slim AS base
# openssl is required by Prisma's query engine.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
RUN npm ci
COPY . .
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma \
 && npm run build --workspace=packages/db \
 && npm run build:seed --workspace=packages/db \
 && npm run build --workspace=apps/api

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
# Bring the installed deps (incl. the generated Prisma client) + the built artifacts.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# packages/db carries the generated Prisma client AND the precompiled seed (prisma/dist/seed.js).
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
EXPOSE 4000
# Apply migrations then start. (DATABASE_URL must be reachable at runtime.)
CMD ["sh", "-c", "npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma && node apps/api/dist/main.js"]
