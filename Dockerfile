# syntax=docker/dockerfile:1

# --- deps: install all dependencies (incl. dev for build) ---
# Node 22: ldapts@9 requires node >=22.
# trixie (Debian 13): bookworm's zlib1g ships a will-not-fix critical CVE.
FROM node:22-trixie-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Retry: npm ci (and the Prisma engine postinstall download) is flaky on slow/VPN networks.
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && for i in 1 2 3; do npm ci && break || (echo "npm ci attempt $i failed, retrying" && sleep 5); done

# --- builder: generate prisma client + build next ---
FROM node:22-trixie-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Version the UI displays. Left empty outside the CI, where src/lib/appMeta.ts
# falls back to package.json. Next inlines NEXT_PUBLIC_* at build time, so this
# has to be set before `npm run build`, not at runtime.
ARG RC_VERSION=""
ENV NEXT_PUBLIC_RC_VERSION=$RC_VERSION
RUN npm run build

# --- demo-tools: seeders + ticker for the public demo instance ---
# Built from `builder`, which already carries the sources and full node_modules
# (tsx, the Prisma client, the domain layer). Keeping it apart means the runtime
# image below stays free of dev dependencies and demo data.
FROM builder AS demo-tools
WORKDIR /app
COPY scripts/demo-loop.sh ./scripts/demo-loop.sh
RUN chmod +x ./scripts/demo-loop.sh
CMD ["./scripts/demo-loop.sh"]

# --- runner: minimal standalone runtime ---
FROM node:22-trixie-slim AS runner
# The runtime only needs node + sh + openssl: the entrypoint runs prisma via
# `node`, never npm/npx, and nothing calls perl. Dropping the bundled npm and
# perl-base removes their CVE surface (npm's vendored tar, perl-base CVEs).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && dpkg --purge --force-remove-essential --force-depends perl-base
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone server + traced node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Standalone output deliberately excludes public/ — copy it or /logo.png 404s.
COPY --from=builder /app/public ./public

# Prisma schema + migrations + CLI for `migrate deploy` at startup
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=builder /app/config ./config
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
