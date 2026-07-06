# Next.js web image (standalone output). Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile -t pdash-web .
# syntax=docker/dockerfile:1

FROM node:20-slim AS base
WORKDIR /app

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
RUN npm ci
COPY . .
# @pdash/db is transpiled into the web bundle, so its Prisma client must be generated/built.
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma \
 && npm run build --workspace=packages/db \
 && npm run build --workspace=apps/web

# ── Runtime (Next standalone) ─────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
