# releasechronicle

*English — [Version française](README.fr.md)*

> **The version under development will be complete and tested within 15 days — by 1 September 2026.**
> **Live demo: https://releasechronicle.yabison.com**

Track releases, deployments, incidents and maintenance windows — with a status
workflow, dynamic environments, DORA metrics, notification hooks (webhook / Teams /
email), LDAP/AD authentication, and a subscribable iCalendar feed.

> Internal Next.js 15 + PostgreSQL application. **Reads** are public; **configuration
> writes** require an admin session; the **REST ingestion API** (CI/scripts) uses a
> write token.

---

## Contents

- [Features](#features)
- [Quick start (Docker)](#quick-start-docker)
- [Datasets](#datasets)
- [Live demo instance](#live-demo-instance)
- [Local development](#local-development)
- [Configuration (environment variables)](#configuration-environment-variables)
- [Configuration files](#configuration-files-config)
- [Authentication & roles](#authentication--roles)
- [Security](#security)
- [Deployment workflow](#deployment-workflow)
- [Environments](#environments)
- [Ingesting from CI](#ingesting-from-ci)
- [Notification hooks](#notification-hooks)
- [One-click action link](#one-click-action-link)
- [iCalendar feed](#icalendar-feed)
- [DORA metrics](#dora-metrics)
- [REST API](#rest-api)
- [Admin interface](#admin-interface)
- [Tests](#tests)
- [Architecture](#architecture)
- [License](#license)

---

## Features

- **Per-service timeline**: deployments (release / hotfix / rollback), incidents,
  maintenance — filterable by environment, version, requester, tag, date. Deployment
  duration shown (IN_PROGRESS → live, or until the rollback).
- **Status workflow**: `SCHEDULED → PENDING → IN_PROGRESS → DEPLOYED → TESTING →
  VALIDATE`, with a transition history, rollback and QA validation.
- **Scheduled deployments**: `SCHEDULED` status + a planned date; automatic promotion
  to `PENDING` a configurable lead time before it is due (cron-triggered endpoint).
- **Multi-product batches**: create N deployments sharing one batch number in a single
  step (Company → Product → Service per row).
- **Dynamic environments**: add / rename / colour / order / soft-delete from the admin
  interface — no frozen enum.
- **DORA metrics**: deployment frequency, lead time, change failure rate, MTTR —
  filterable, with Elite/High/Medium/Low bands.
- **Hooks** for webhook / Microsoft Teams / email, targeted by event kind and by a
  precise transition, with per-severity templates (red / orange / green) and
  **reusable targets** (mail groups, URLs).
- **One-click action link** in messages: move the status forward without signing in.
- **Subscribable iCalendar feed** (Outlook / Google / Apple) of scheduled releases and
  maintenance windows.
- **Excel import / export** of events.
- **Authentication**: local provider (file) or **LDAP/AD** (search-then-bind, group →
  role mapping).

---

## Quick start (Docker)

```bash
docker compose up -d --build       # Postgres + test Postgres + OpenLDAP + the app
```

- The app listens on **http://localhost:3000**
- The database is migrated on startup (`docker-entrypoint.sh`).

Seed the demo data:

```bash
npm install
npm run db:seed:demo
```

Demo admin login: **`admin` / `admin`** (change it — see
[Authentication](#authentication--roles)).

---

## Datasets

Two datasets, deliberately kept apart.

| Command | Contents |
|---|---|
| `npm run db:seed:demo` | **Yabison**, 90 days of activity generated relative to *now*. Committed, publishable, and the default. |
| `npm run db:seed:private` | Your real data. Reads `private/`, which is **gitignored** — the repository holds no customer data. |

The demo dataset deliberately covers every UI feature: multi-service batches, a
rollback detected by build number, a hotfix with its PRE and POST phases, in-hours /
out-of-hours, open and resolved incidents, an upcoming maintenance, build drift, and
deployments in flight at seeding time. The **Yabison** company is public and
**Kaleido** is not, which makes the public mode visible without signing in. The
*Release Chronicle* product replays this project's real git history.

The private seeder expects `private/hierarchy.yml` (company/product/service names)
and `private/deployments.xlsx` (a deployment export in the app's own Excel format).
Both paths can be overridden with `RC_PRIVATE_HIERARCHY` and `RC_PRIVATE_IMPORT`.

---

## Live demo instance

Running at **https://releasechronicle.yabison.com** — no sign-in needed for the public
view. To run the same stack locally: a self-contained stack, with its own database and
port, driven by a loop that moves the world forward every few minutes and rebuilds it
at **00:00 UTC**:

```bash
docker compose --profile demo up -d    # app on http://localhost:3001
docker compose logs -f demo_driver     # watch the deployments progress
```

Accounts: `demo` (devops), `demo-qa` (qa), `demo-admin` (admin) — password `demo` for
all three, defined in `config/auth-users.demo.yml`. Two distinct roles so the
validation workflow is actually worth trying: a QA moves TESTING → VALIDATE, a devops
does the rest. The login page lists them, password included, and a click fills the
form — only where `RC_DEMO_MODE=true`, never on an ordinary instance. Anonymous
visitors get the read-only public view.

The ticker and the reset **refuse to run** unless `RC_DEMO_MODE` is `true` *and* the
database name contains `demo`: a mistyped `DATABASE_URL` cannot wipe anything else.
Run them by hand with `npm run demo:tick` / `npm run demo:reset`.

To publish this instance on a server (GHCR images + Traefik), see
[docs/demo-deploy.md](docs/demo-deploy.md). For the branch flow and the release
pipeline, see [docs/ci-cd.md](docs/ci-cd.md).

---

## Local development

Requirements: Node 20+, a PostgreSQL database.

```bash
npm install
# set DATABASE_URL in .env (e.g. postgresql://rc:rc@localhost:5432/releasechronicle)
npm run db:deploy            # apply the migrations
npm run db:seed:demo         # (optional) the Yabison demo dataset
npm run dev                  # http://localhost:3000
```

The `db` (5432) and `db_test` (5433) containers in `docker-compose.yml` provide the
development and test databases. Full walkthrough: [docs/dev-environment.md](docs/dev-environment.md).

---

## Configuration (environment variables)

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | — (required) |
| `RC_WRITE_TOKEN` | `Bearer` token of the REST ingestion API (CI/scripts) | `change-me` *(refused in production)* |
| `AUTH_SECRET` | Signing key for JWT sessions and action tokens | *(dev fallback, refused in production)* |
| `AUTH_PROVIDER` | `local` (default) or `ldap` | `local` |
| `AUTH_USERS_FILE` | Path to the local users file | `config/auth-users.yml` |
| `LDAP_URL` / `LDAP_BASE_DN` / `LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` | LDAP/AD connection (`ldap` mode) | — |
| `LDAP_CONFIG_FILE` | Filters + group→role mapping | `config/ldap.yml` |
| `DEPLOY_CONFIG_FILE` | Scheduled-promotion lead time | `config/deploy.yml` |
| `APP_BASE_URL` | Origin of the one-click links in messages | `http://localhost:3000` |
| `RC_WEBHOOK_BLOCK_PRIVATE` | Also refuse webhooks to private/loopback addresses | `false` |
| `RC_DEMO_MODE` | Public demo instance: shows the demo accounts on the login page | `false` |
| `RC_IP_ALLOWLIST` | Comma-separated CIDRs; anything else gets a 403 | *(unset — no restriction)* |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Sending email (the `email` connector) | — |

> In production you must set `AUTH_SECRET`, `RC_WRITE_TOKEN`, `APP_BASE_URL`, and the
> SMTP settings if email is used.
>
> `AUTH_SECRET` and `RC_WRITE_TOKEN` ship with public defaults (the ones in
> `.env.example`). Under `NODE_ENV=production` — which includes the Docker image —
> they are **refused**: the app will not start without a private `AUTH_SECRET`, and an
> `RC_WRITE_TOKEN` left at `change-me` makes ingestion fail with a 401. Generate both
> with `openssl rand -base64 32`.

---

## Configuration files (`config/`)

`config/` is copied into the Docker image. It holds:

- **`auth-users.yml`** — local authentication users (username, name, email, roles,
  scrypt `passwordHash`). Generate a hash with:
  ```bash
  npx tsx -e "import {hashPassword} from './src/lib/auth/localProvider'; console.log(hashPassword('MY_PASSWORD'))"
  ```
- **`ldap.yml`** — `userSearchFilter`, attributes, `groupSearchFilter`, and the
  `groupRoles` table (group CN → role).
- **`deploy.yml`** — `scheduledLeadMinutes` (default 15): how long before its planned
  date a `SCHEDULED` release moves to `PENDING`.
- **`hook-templates/{red,orange,green}.yml`** — message templates per severity (email
  `subject`/`body`, teams `title`/`text`), with the variables `{product}`,
  `{service}`, `{environment}`, `{version}`, `{status}`, `{actor}`, `{fromStatus}`,
  `{toStatus}`, `{comment}`, `{actionUrl}`, …
  Localised: `{colour}.{locale}.yml` (e.g. `red.en.yml`) is used when the notification
  target is configured in that language; the file without a locale stays the French
  default. A missing file falls back to the built-in templates.

---

## Authentication & roles

- **Roles**: `admin`, `devops`, `qa`, `viewer`.
- **Sessions**: signed JWT (HS256) in an `httpOnly` cookie (`rc_session`), 8 h.
- **Login**: the `/login` page → `POST /api/auth/login`. Logout:
  `POST /api/auth/logout`. Current session: `GET /api/auth/me`.
- **Local provider** (default): reads `config/auth-users.yml` (scrypt passwords).
- **LDAP/AD provider** (`AUTH_PROVIDER=ldap`): bind a service account → search for the
  user → re-bind to verify the password → read the groups → map them to roles through
  `config/ldap.yml`.

**Enforcement**:

- **Configuration** routes (companies, products, services, environments, hooks,
  targets, ingestion sources) require an **`admin` session**.
- **Deployment transitions** require a session: the `qa` role for TESTING/VALIDATE,
  `devops` otherwise, `admin` everywhere; the actor is the signed-in user.
- The **REST ingestion API** (`/api/v1/deployments|incidents|maintenances`) stays
  protected by `RC_WRITE_TOKEN` (for CI).
- **Server actions** (creating/editing from the UI, Excel import/export) require a
  session. A server action is an ordinary POST endpoint: "server-side" is not an
  access control.
- **Brute force**: 5 failed logins for an (IP, username) pair trigger a 15-minute
  pause (`429` + `Retry-After`). The counter lives in the process memory, so behind
  *N* replicas the effective limit is 5×N.

---

## Security

**Headers** — the middleware sets a per-request CSP carrying a nonce: only the
scripts Next stamps execute, so an injected `<script>` is inert. Alongside it: HSTS
(production only), `nosniff`, `frame-ancestors 'none'` / `X-Frame-Options: DENY`,
`Referrer-Policy` and `Permissions-Policy`. `style-src` keeps `'unsafe-inline'`: a
nonce cannot cover a `style="…"` attribute, which the UI uses for status and
environment colours.

**Outbound webhooks** — hook and target URLs are checked both at creation *and* at
send time: an `http(s)` scheme is required, link-local addresses (cloud metadata
`169.254.x`, `fd00:ec2::254`) are always refused, and redirects are not followed.
Private addresses stay allowed by default (a self-hosted instance notifies internal
endpoints); `RC_WEBHOOK_BLOCK_PRIVATE=true` refuses those too. Known limit: only
literal IPs are inspected, so a hostname that *resolves* to a private address gets
through — the real control remains outbound network filtering.

**One-click links** (`/go/<token>`) — the token *is* the authorisation, since the
recipient has no session. It is therefore **single-use** (a `jti` consumed in the
database, once only, even on a simultaneous double click) and expires after **48 h**,
so a forwarded or archived email replays nothing.

**Audit log** — the `AuditLog` table, readable at `/admin/audit` or through
`GET /api/v1/audit` (admin). Tracked: successful, failed and blocked logins, creation
and deletion of ingestion sources, hooks and notification targets, and every use of a
one-click link (replay attempts included). Secrets are never copied into it: the
label, the type and the host are recorded, never the token or the full URL.

---

## Deployment workflow

```
SCHEDULED → PENDING → IN_PROGRESS → DEPLOYED → TESTING → VALIDATE
```

- Every transition is recorded (from/to, actor, comment; a comment is required for
  VALIDATE) and can fire hooks.
- **Rollback**: strikes the deployment through and adds a ROLLBACK entry; the
  deployment duration then ends at the rollback date.
- **Scheduled release**: create it with the `SCHEDULED` status and a planned date;
  `POST /api/v1/deployments/promote-scheduled` (cron) promotes to `PENDING` the ones
  that are close to due (`scheduledLeadMinutes`).

---

## Environments

Managed dynamically under **Admin → Environments**: name, slug (immutable), colour,
order, soft-delete. The per-product environment workflow (e.g. `DEV → QA → PROD`) is
editable per product and shown on a deployment's drawer.

---

## Ingesting from CI

Create an **ingestion source** under **Admin → Sources** (**Service**, **Company** or
**Global** scope). Each source has a token. CI posts:

```bash
curl -X POST "$APP/api/v1/ingest/deployments" \
  -H "authorization: Bearer <SOURCE_TOKEN>" \
  -H "content-type: application/json" \
  -d '{
    "version": "1.2.3",
    "environment": "PROD",
    "changeType": "NORMAL",
    "deployStatus": "DEPLOYED",
    "requester": "gitlab-ci",
    "lot": "release-2026.08",
    "externalLink": "https://gitlab/example/-/pipelines/123"
  }'
```

- **Service**: the service is implicit (tied to the token).
- **Company**: the payload names `product` + `service`.
- **Global**: the payload names `company` + `product` + `service`.
- A source's `defaultEnvironment` may be `ALL` (no default) → the payload must then
  provide `environment`.

---

## Notification hooks

Per product (**Admin → Hooks**):

- **Types**: `webhook`, `teams`, `email`.
- **Events**: `deploy.created`, `deploy.status_changed`, `deploy.status_undone`,
  `deploy.rolled_back`, `incident.created`, `maintenance.created` (or `*`).
- **Targeted transitions** (for `deploy.status_changed`): e.g. `DEPLOYED → TESTING`.
- **Reusable targets** (**Admin → Targets**): define a mail group, a Teams URL or a
  webhook once, then **reuse** it across several hooks — editing it updates every hook
  that references it (a live reference).
- **Templates** per severity in `config/hook-templates/` (red: incident/rollback;
  orange: release in progress; green: done), in French and English
  (`{colour}.en.yml`). The language is chosen per target under **Admin → Targets**.
- **Delivery log**: **Admin → Logs** (`/admin/logs`), filterable (kind, type,
  ok/failure, code, error, date) with pagination.
- **No-code integration**: a `webhook` hook can point at a **Power Automate / Logic
  Apps** flow (*HTTP request* trigger → *Create an Outlook event*). The payload
  includes `scheduledAt`, `windowStart`, `windowEnd`.

---

## One-click action link

Messages (the orange template) can include `{actionUrl}`: a signed link, scoped to
**one** transition of **one** event. The recipient opens `/go/<token>`, confirms, and
the status moves forward (actor "link") — without signing in. Single use is guaranteed
by a consumed `jti`, so a second click does nothing; the token expires after 48 h. Set
`APP_BASE_URL` so the links point at the right host.

---

## iCalendar feed

A subscribable feed of scheduled releases and maintenance windows:

```
GET /api/v1/calendar.ics?company=&product=&service=&environment=
```

`Content-Type: text/calendar`. Subscribe from Outlook / Google / Apple Calendar with
the URL. Deployments use `scheduledAt` (falling back to `occurredAt`); maintenance
uses the `windowStart → windowEnd` window.

---

## DORA metrics

The **/metrics** page (linked from the sidebar). Company / product / service /
environment filters plus a window (30/90/180 days). Four cards:

- **Deployment frequency** (count + per day)
- **Lead time for changes** (median occurredAt → DEPLOYED)
- **Change failure rate** (rolled-back deployments / total)
- **MTTR** (median across resolved incidents)

Each metric is placed in a DORA band (Elite / High / Medium / Low). API:
`GET /api/v1/metrics/dora?…&days=30`.

---

## REST API

Base: `/api/v1`. **Config writes** = admin session; **ingestion** =
`Bearer RC_WRITE_TOKEN`. OpenAPI specification: `/api/v1/openapi.json`
(Swagger UI: `/api/docs`).

**Dates** — every date field (`occurredAt`, `scheduledAt`, `startedAt`, `resolvedAt`,
`windowStart`, `windowEnd`) accepts ISO 8601 with **any offset**, not only UTC:
`2026-06-25T12:00:00+02:00` and `2026-06-25T10:00:00Z` name the same instant and are
stored identically. Avoid dates *without* a timezone (`2026-06-25T12:00`): they are
read in the server's timezone. The UI then shows each instant in the visitor's
timezone, or in UTC through the sidebar's `local / UTC` selector.

**Reads** — a session sees everything. Without one, the API applies exactly the rules
of the UI's public mode: the company, the product *and* the service must all be marked
public, the event type must be among the public types, and the environment must be
public. A private service returns **404**, not 403: confirming it exists would already
be the leak. This covers `companies`, `products`, `services`, `services/*/events`,
`services/*/current`, `environments`, `metrics/dora` and `calendar.ics`.

Some reads additionally require an **admin session**, because they carry a secret or
allow account enumeration: `ingest-sources` (CI tokens in the clear),
`notification-targets` and `products/*/hooks` (webhook URLs), `hooks/deliveries` (the
payloads that were sent), `directory` (LDAP accounts) and `audit`. `lots/candidates`
requires a plain session: it lists the whole company's releases and only serves the
batch-creation modal.

Main routes:

| Method | Route | Auth |
|---|---|---|
| GET | `/companies`, `/products`, `/services`, `/environments` | public |
| POST/PUT/DELETE | same + `/products/[slug]/hooks`, `/notification-targets`, `/…/ingest-sources` | admin session |
| POST/PUT | `/deployments`, `/incidents`, `/maintenances` (+ `/[externalId]`) | write token |
| POST | `/ingest/deployments` | source token |
| POST | `/deployments/promote-scheduled` | write token (cron) |
| GET | `/metrics/dora` | public |
| GET | `/calendar.ics` | public |
| GET/POST | `/auth/login`, `/auth/logout`, `/auth/me` | — |

---

## Admin interface

`/admin` (the `admin` role only), with a side navigation:

- **Companies** — create / list.
- **Environments** — CRUD over colours and order.
- **Products** — build URL template + environment workflow.
- **Hooks** — create (type, events, transitions, target or inline config), list,
  delete; links through to the **Logs**.
- **Targets** — CRUD over the reusable notification targets.
- **Sources** — ingestion sources (service / company / global) + a `curl` example.
- **Logs** (`/admin/logs`) — the filterable hook delivery log.

---

## Tests

```bash
npm test            # vitest (single run)
npm run test:watch  # watch mode
```

The suite needs the test Postgres (port 5433) and, for the LDAP integration test, the
`ldap` container (`docker compose up -d db_test ldap`).

---

## Architecture

- **Next.js 15** (App Router) — server pages + route handlers + server actions.
- **Prisma 6 / PostgreSQL** — an event model (`Event`: DEPLOYMENT / INCIDENT /
  MAINTENANCE) plus `StatusTransition`, `Rollback`, `Hook`, `NotificationTarget`,
  `EnvironmentConfig`, `IngestSource`, `HookDelivery`.
- **jose** — signed sessions and action tokens. **ldapts** — the LDAP provider.
  **nodemailer** — email. **exceljs** — import/export.
- **Pure, testable logic** kept apart (`src/lib/*`): the status workflow, DORA
  metrics, role mapping, templates, ICS — tested under node; React components are
  checked by hand.
- Containers: `db`, `db_test`, `ldap`, `app` (`docker-compose.yml`).

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Copyright 2026 Yabison.
