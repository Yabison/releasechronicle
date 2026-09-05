# Dev / test environment

A self-contained local stack: Postgres, a test Postgres, an LDAP directory with seed
users, and Mailpit to catch outgoing email. The Next.js app runs on the host (`npm run
dev`) against these containers — the app image build needs network access to fetch the
Next SWC binary, so host dev is the reliable path.

## Bring it up

```bash
cp .env.example .env          # first time
npm run dev:up                # docker: everything but the app (make up-deps)
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
| ldap     | localhost:1389                | osixia/openldap, seeded from `tests/fixtures/ldap` |
| mailpit  | http://localhost:8025 (UI)    | SMTP on 1025; catches all outgoing mail       |

## Login (LDAP)

`.env` sets `AUTH_PROVIDER=ldap`. Users come from `tests/fixtures/ldap/fixture.ldif`, roles from
the group map in `config/ldap.yml` — one account per role, **password identical to the
username**:

| user   | password | roles                        |
|--------|----------|------------------------------|
| admin  | admin    | admin, devops, qa, viewer    |
| devops | devops   | devops, viewer               |
| qa     | qa       | qa, viewer                   |
| viewer | viewer   | viewer                       |

Everyone belongs to the `everyone` group, which grants the baseline `viewer` role; the
other groups add to it. The login page lists these accounts and fills the form on click
— `devAccounts()` returns them whenever `NODE_ENV` is not `production` and the provider
is `ldap`, so the Docker image never shows them.

After editing the ldif, recreate the container — osixia/openldap only applies it on a
first start, so an edit alone looks like it did nothing:

```bash
docker compose rm -sf ldap && docker compose up -d ldap
```

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

`db:seed:private` reads two gitignored inputs, so the repository itself carries no
production data:

| Input | Where | Override |
|-------|-------|----------|
| Company/product/service names | `private/hierarchy.yml` | `RC_PRIVATE_HIERARCHY` |
| The deployment export | the single `.csv` or `.xlsx` in `private/import/` | `RC_PRIVATE_IMPORT` |
| MEP tracking sheet *(optional)* | `private/import/Suivi des MEPs.xlsx` | `RC_PRIVATE_MEP_TRACKING` |

The export may be a raw rundeck execution CSV (translated on the way in) or a
spreadsheet already using the app's own column names. `private/import/` is expected to
hold exactly one of them — the tracking sheet does not count — since importing last
month's export by alphabetical luck is the kind of thing nobody notices until the
metrics look wrong.

A missing hierarchy or export fails with a message pointing at the demo seeder. The
tracking sheet is optional: without it the import simply carries no hotfix information
and says so.

### What the import derives

| | |
|---|---|
| **Chained runs** | A release reaching production in several runs (same service, environment and version, each within 60 min of the previous) becomes **one** deployment. Counting them separately would inflate the frequency metric fivefold. |
| **Status** | Everything that reached production is treated as tested: a successful deployment ends at `VALIDATE` with its full trail. A rolled-back one stops at `DEPLOYED` — it is the one outcome that is not a validation. Failed and aborted runs keep their own statuses. |
| **HO / HNO** | From the start time, in **Europe/Paris**: `HO` on weekdays from 09:00 to 18:00, `HNO` otherwise. The export is UTC, so the boundary moves between winter and summer. |
| **Hotfix** | From the tracking sheet's `scope`, joined by day and environment, applied to every service deployed in that window. Days carrying two MEPs are separated by their hour; when they disagree and no hour is recorded, the deployment stays `NORMAL` and the count is reported. |
| **Rollbacks** | Three sources: the export's own flag, the tracking sheet's `rollback` column, and a build-number heuristic (a lower build after a higher one means the higher was reverted). |

The sheet's `incident/Hotfix` column is deliberately ignored: it is retroactive, set on
a release that later *needed* a hotfix, so reading it as a hotfix marker would flag
exactly the wrong releases.

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
