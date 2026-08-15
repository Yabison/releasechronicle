#!/bin/sh
# Drives the public demo instance: a tick every RC_DEMO_TICK_SECONDS, and a full
# rebuild the first time the UTC date changes (i.e. at 00:00).
#
# Deliberately a loop rather than cron: one process, one log stream, and no second
# scheduler to configure. Both jobs refuse to touch a non-demo database on their
# own (prisma/demo-guard.ts), so this script needs no safety logic of its own.
set -e

TICK="${RC_DEMO_TICK_SECONDS:-180}"
day="$(date -u +%Y-%m-%d)"

echo "[demo-loop] starting: tick every ${TICK}s, reset at 00:00 UTC"

# The app container migrates too, but it only has to be *started* for us to run —
# applying them here as well removes the race and is idempotent.
npx prisma migrate deploy

# Build the world once at startup so a fresh container is never empty.
npx tsx prisma/demo-reset.ts

while true; do
  sleep "$TICK"

  today="$(date -u +%Y-%m-%d)"
  if [ "$today" != "$day" ]; then
    day="$today"
    echo "[demo-loop] new day ${day}, rebuilding"
    npx tsx prisma/demo-reset.ts || echo "[demo-loop] reset failed, continuing"
    continue
  fi

  npx tsx prisma/demo-tick.ts || echo "[demo-loop] tick failed, continuing"
done
