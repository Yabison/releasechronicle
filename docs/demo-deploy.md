# Publishing the demo instance on a Linux server

*English — [Version française](demo-deploy.fr.md)*

A self-contained stack — its own Postgres, the app, and a loop that moves the world
forward every few minutes and rebuilds it at 00:00 UTC — behind Traefik.

Nothing is compiled on the server: both images are pulled from GHCR. `ci.yml`
publishes them on a push to `rc` or `main`; the versioned ones come from
`release-please.yml` when the release PR is merged. See [ci-cd.md](ci-cd.md).

| Image | Contents | Role |
|-------|----------|------|
| `ghcr.io/yabison/releasechronicle:<tag>` | the standalone Next runtime | the app |
| `ghcr.io/yabison/releasechronicle:<tag>-demo-tools` | + tsx, seeders, sources | the ticker |

> The demo instance loads `config/auth-users.demo.yml`, whose passwords are published
> in this repository. **It must never hold real data.**

## Requirements

- Docker Engine + the compose v2 plugin
- a Traefik already in place, with an ACME certresolver configured
- DNS for `demo.example.org` → the server's IP

## 1. Publish the images

The demo follows the `rc` branch: every merge into it republishes the moving `:rc`
tag (and `:rc-demo-tools`), alongside the pinned `:rc-<version>`.

```bash
git push origin rc          # -> images :rc and :rc-0.2.0-rc.15
```

The released images (`:release-0.2.0`, `:0.2.0`, `:0.2`, `:latest`) come from merging
the release PR that `release-please` opens on `main` — not from a manual `git tag`.

The GHCR package is **public** (checked: `GET /v2/yabison/releasechronicle/manifests/rc`
answers 200 without credentials), so the server pulls unauthenticated. Were it to go
private again — Package settings → Change visibility — you would have to log in with a
`read:packages` PAT:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin
```

## 2. Put the stack on the server

Only two files are needed — no full clone:

```bash
mkdir -p /srv/rc-demo && cd /srv/rc-demo
curl -O https://raw.githubusercontent.com/Yabison/releasechronicle/main/docker-compose.demo.yml
curl -O https://raw.githubusercontent.com/Yabison/releasechronicle/main/.env.demo.example
mv .env.demo.example .env.demo && chmod 600 .env.demo
```

Fill in `.env.demo`:

```bash
openssl rand -hex 32      # DEMO_DB_PASSWORD  — hex is mandatory, see below
openssl rand -base64 32   # DEMO_AUTH_SECRET
openssl rand -base64 32   # DEMO_WRITE_TOKEN
```

> `DEMO_DB_PASSWORD` in **hex**, not base64: it goes into `DATABASE_URL` verbatim, and
> a `/` — which base64 produces — cuts the URL's authority in two. Prisma then stops
> on `P1013 ... invalid port number in database URL`, because it reads the fragment of
> password following the `:` as a port number.

`TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT` and `TRAEFIK_CERTRESOLVER` must match the
proxy that is running. To find them:

```bash
docker network ls | grep -i traefik
docker inspect <traefik-container> --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -i 'entrypoint\|certresolver'
```

## 3. Start it

```bash
docker compose -f docker-compose.demo.yml --env-file .env.demo pull
docker compose -f docker-compose.demo.yml --env-file .env.demo up -d
docker compose -f docker-compose.demo.yml --env-file .env.demo logs -f demo_driver
```

Migrations apply on their own: `docker-entrypoint.sh` runs `prisma migrate deploy`
when the app starts, and `scripts/demo-loop.sh` does it again before building the
world — idempotent, so there is no race between the two.

The first `demo-reset` fills the database straight away: a fresh container is never
empty. After that, a tick every `DEMO_TICK_SECONDS` (180 by default) and a full
rebuild at the first change of UTC date.

Accounts: `demo` (devops), `demo-qa` (qa), `demo-admin` (admin), password `demo`. The
login page lists them itself, and a click fills the form. `RC_DEMO_MODE=true` on
`app_demo` is what turns that on; without the flag the page stays a bare form, and a
test checks that the credentials shown actually authenticate
(`tests/lib/auth/demoAccounts.test.ts`). Anonymous visitors get the read-only public
view.

## 4. Automatic updates

A systemd timer fetches the image itself every 5 minutes — nothing to open inbound,
no SSH key in the GitHub secrets. From the repository's `deploy/`:

```bash
sudo install -m 755 rc-demo-update.sh /usr/local/bin/rc-demo-update.sh
sudo install -m 644 releasechronicle-demo-update.service /etc/systemd/system/
sudo install -m 644 releasechronicle-demo-update.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now releasechronicle-demo-update.timer
```

```bash
systemctl list-timers releasechronicle-demo-update.timer   # next run
journalctl -u releasechronicle-demo-update.service -n 50   # what it did
sudo systemctl start releasechronicle-demo-update.service  # force one now
```

The service only recreates the containers when the digest has moved. With
`RC_IMAGE_TAG=rc` the demo follows the rc branch; with `RC_IMAGE_TAG=0.2.0` it stays
put and the timer has nothing left to do.

By hand, without the timer:

```bash
docker compose -f docker-compose.demo.yml --env-file .env.demo pull
docker compose -f docker-compose.demo.yml --env-file .env.demo up -d
```

## Operating it

```bash
# state
docker compose -f docker-compose.demo.yml --env-file .env.demo ps

# rebuild the world right now, without waiting for 00:00
docker compose -f docker-compose.demo.yml --env-file .env.demo exec demo_driver npx tsx prisma/demo-reset.ts

# start over, database included
docker compose -f docker-compose.demo.yml --env-file .env.demo down -v
```

No backup to plan for: the database is rebuilt nightly from the seeder, so there is
nothing to lose.

## Guard rails

- `prisma/demo-guard.ts`: the ticker and the reset refuse to run unless `RC_DEMO_MODE`
  is `true` **and** the database name contains `demo`. A mistyped `DATABASE_URL`
  cannot wipe anything else.
- `RC_WEBHOOK_BLOCK_PRIVATE=true`: no outbound notification to a private address from
  a public instance.
- The Postgres port is not published — only the two app containers reach it.
- TLS is mandatory: in production the app sends `Strict-Transport-Security` and
  `upgrade-insecure-requests` (`src/lib/securityHeaders.ts`). Served over plain HTTP,
  the browser forces https and the demo becomes unreachable.
- `APP_BASE_URL` must be the public https URL: it is what the action links sent by
  email carry (`src/lib/actionToken.ts`).

Optional access restriction, while it is a preview: add `RC_IP_ALLOWLIST`
(comma-separated CIDRs) to `app_demo`. The filter reads `x-forwarded-for`, so it
assumes a trusted reverse proxy in front — which Traefik is here.
