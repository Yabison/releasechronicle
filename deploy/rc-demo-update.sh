#!/bin/sh
# Pull-based CD for the demo instance: fetch the current `rc` image from GHCR and
# recreate the containers if it moved. Driven by the systemd timer next to this file.
#
# Pull-based on purpose: nothing needs inbound access to the server, and no SSH key
# has to live in GitHub secrets.
#
# `up -d` is a no-op when the image digest has not changed, so this is safe to run
# every few minutes.
set -eu

DIR="${RC_DEMO_DIR:-/srv/rc-demo}"
COMPOSE="docker compose -f ${DIR}/docker-compose.demo.yml --env-file ${DIR}/.env.demo"

cd "$DIR"

before="$($COMPOSE images --quiet | sort | tr '\n' ' ')"
$COMPOSE pull --quiet
after="$($COMPOSE images --quiet | sort | tr '\n' ' ')"

if [ "$before" = "$after" ]; then
  echo "up to date"
  exit 0
fi

echo "new image, recreating"
$COMPOSE up -d

# Untagged layers left behind by the previous tag. Scoped to dangling images so
# nothing else on the host is touched.
docker image prune -f >/dev/null
echo "done"
