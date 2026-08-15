# Dev / test environment

A self-contained local stack: Postgres, a test Postgres, an LDAP directory with seed
users, and Mailpit to catch outgoing email. The Next.js app runs on the host (`npm run
dev`) against these containers — the app image build needs network access to fetch the
Next SWC binary, so host dev is the reliable path.

## Bring it up

```bash
cp .env.example .env          # first time
npm run dev:up                # docker: db, db_test, mailpit, ldap
npm run dev:reset             # prisma migrate deploy + seed (import dataset)
npm run dev                   # app on http://localhost:3000
```

Stop the containers with `npm run dev:down`.

## Services

| Service  | URL / port                    | Notes                                         |
|----------|-------------------------------|-----------------------------------------------|
| app      | http://localhost:3000         | `npm run dev` (host)                           |
| db       | localhost:5432                | `releasechronicle` (dev data)                 |
| db_test  | localhost:5433                | `releasechronicle_test` (vitest)              |
| ldap     | localhost:1389                | osixia/openldap, seeded from `test/ldap`      |
| mailpit  | http://localhost:8025 (UI)    | SMTP on 1025; catches all outgoing mail       |

## Login (LDAP)

`.env` sets `AUTH_PROVIDER=ldap`. Users come from `test/ldap/fixture.ldif`, roles from
the group map in `config/ldap.yml`:

| user  | password | roles          |
|-------|----------|----------------|
| bob   | bobpw    | admin          |
| carol | carolpw  | devops, qa     |
| alice | alicepw  | qa             |

To use the local user store instead (admin from `config/auth-users.yml`), remove
`AUTH_PROVIDER=ldap` from `.env`.

## Email

The app sends via SMTP to Mailpit (`SMTP_HOST=localhost`, `SMTP_PORT=1025`). Nothing
leaves the machine — open http://localhost:8025 to read what the email hooks sent.

## Seeders

| Command                    | What                                                        |
|----------------------------|------------------------------------------------------------|
| `npm run db:seed:demo`     | Yabison demo: 90 days of activity, relative to now (default) |
| `npm run db:seed:private`     | Real hierarchy + rundeck history — needs `private/`, below |
| `npm run db:seed:private:config` | Real hierarchy only, no events                          |
| `npm run db:wipe`          | Empty every table                                          |

Two datasets, deliberately separate: the demo one is committed and publishable, the
real one loads customer data that is **not** in the repository.

`npm run dev:reset` = migrate + `db:seed:demo`.

### The `private/` directory

`db:seed:private` reads two gitignored files, so the repository itself carries no
production data: `private/hierarchy.yml` (company/product/service names) and
`private/deployments.xlsx` (the rundeck export). Override the paths with
`RC_PRIVATE_HIERARCHY` and `RC_PRIVATE_IMPORT`. A missing file fails with a message
pointing at the demo seeder.

## Live demo instance

A self-contained stack on its own database and port, driven by a loop that advances
the world every few minutes and rebuilds it at 00:00 UTC:

```bash
docker compose --profile demo up -d   # app on http://localhost:3001
docker compose logs -f demo_driver    # watch deployments advance
```

Logins are `demo` (devops), `demo-qa` (qa) and `demo-admin` (admin), password
`demo` for all three — see `config/auth-users.demo.yml`. Anonymous visitors get the
public read-only view: Yabison is public, Kaleido and the SANDBOX environment are
not, so the difference is visible without logging in.

Both demo jobs refuse to run unless `RC_DEMO_MODE=true` **and** the database name
contains `demo`, so a mistyped `DATABASE_URL` cannot wipe anything else. Run them
by hand with `npm run demo:tick` / `npm run demo:reset`.
