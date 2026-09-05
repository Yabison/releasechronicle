#!/bin/sh
set -e

# The image runs NODE_ENV=production, where src/lib/auth/secret.ts refuses a
# missing or public AUTH_SECRET — a public signing key lets any visitor forge an
# admin session. Without this check the container starts, reports itself up, and
# fails the first time somebody tries to log in, as a 500 with no clue in the
# browser. Saying it here costs one startup and names the fix.
#
# Not `${VAR:?}` in docker-compose.yml: interpolation applies to the whole file,
# so requiring it there aborts `docker compose up -d db_test ldap`, and `logs`,
# and `down` — including in the CI, which starts two services and has no .env.
DEV_SECRET="dev-insecure-secret-change-me"

if [ -z "$AUTH_SECRET" ] || [ "$AUTH_SECRET" = "$DEV_SECRET" ]; then
  echo "AUTH_SECRET is missing, or is still the public development value." >&2
  echo "Sessions and one-click links are signed with it: a public key lets anyone forge an admin login." >&2
  echo "Set it in .env, then recreate this container:  openssl rand -base64 32" >&2
  exit 1
fi

if [ -z "$RC_WRITE_TOKEN" ] || [ "$RC_WRITE_TOKEN" = "change-me" ]; then
  echo "RC_WRITE_TOKEN is missing, or is still 'change-me'." >&2
  echo "It is the bearer token of the ingestion API, which CI uses to write deployments." >&2
  echo "Set it in .env, then recreate this container:  openssl rand -base64 32" >&2
  exit 1
fi

echo "Running prisma migrate deploy..."
node node_modules/prisma/build/index.js migrate deploy

echo "Starting Next.js server..."
exec node server.js
