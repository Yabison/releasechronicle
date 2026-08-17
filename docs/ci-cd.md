# CI / CD

*English — [Version française](ci-cd.fr.md)*

## The flow

```
fix/xxx  feat/xxx
   |         |
   +----+----+
        v  PR (CI: tests, typecheck, build, scan)
       rc  ------> images :rc-0.2.0-rc.15 and :rc
        |            |
        |            v  systemd timer, every 5 min
        |          demo server              shows v0.2.0-rc.15
        v  PR
      main ------> image :main (integration, deployed by nobody)
        |
        v  release-please opens "chore(main): release 0.2.0"
        v  merging that PR
     tag v0.2.0 --> images :release-0.2.0, :0.2.0, :0.2, :latest
                    + GitHub Release        shows v0.2.0
```

| Branch / ref | Tests | Image published | Version shown | Deployed |
|---|---|---|---|---|
| `fix/*`, `feat/*` (PR) | yes | no | — | — |
| `rc` | yes | `:rc-0.2.0-rc.15`, `:rc`, `:sha-<sha>` | `0.2.0-rc.15` | demo, automatically |
| `main` | yes | `:main`, `:sha-<sha>` | `package.json` | nothing |
| tag `v*` (release-please) | already passed | `:release-0.2.0`, `:0.2.0`, `:0.2`, `:latest`, `:sha-<sha>` | `0.2.0` | by hand, for now |

Every image has its `-demo-tools` counterpart (seeders + ticker) under the same tag,
suffixed.

The number in the tag and the one the UI shows are **the same**, and
`rc-0.2.0-rc.15` names the fifteenth candidate for the release that will ship as
`release-0.2.0`.

The `-rc.<n>` counter is the number of commits landed since the last release — one
per pull request, since merges are squashed. It exists so that two candidates for the
same release do not collide: without it every commit on `rc` would republish the same
`rc-0.2.0` tag and silently overwrite the previous image. It comes from the git
history rather than from a CI run number, so the same commit always yields the same
version, whoever builds it.

## What the CI does

`.github/workflows/ci.yml`, three jobs.

**test** — on pull requests and on push. `npm ci`, the `db_test` (5433) and `ldap`
(1389) containers through compose, `prisma migrate deploy`, `npm test`,
`npm run build`, then `tsc --noEmit` (after the build: tsconfig includes
`next-env.d.ts` and `.next/types/**`, which the build generates; `next build` only
typechecks the app, this pass adds `tests/` and `prisma/`).

**security** — `npm audit` (non-blocking: an upstream CVE must not turn an unrelated
PR red), a local build of the runtime image, a Trivy HIGH/CRITICAL scan, and SARIF
uploaded to code scanning.

**publish** — only on a push to `rc` or `main`, and only if `test` passes. Calls
`publish-images.yml`, the reusable workflow that builds and pushes both images. It is
reusable so that `release-please.yml` pushes in exactly the same way: one definition
of the build, no drift between the two paths.

## Branch protection to set up

On `rc` and `main` (Settings → Branches → Add rule):

- require a pull request before merging
- require status checks: `Typecheck, test, build`
- require branches to be up to date before merging

Without this, a direct push to `rc` deploys the demo without having gone through the
tests.

## Demo CD — pull-based

Nothing inbound to the server, no SSH key in the GitHub secrets: the server fetches
the image itself.

The files live in `deploy/`. To install:

```bash
sudo install -m 755 rc-demo-update.sh /usr/local/bin/rc-demo-update.sh
sudo install -m 644 releasechronicle-demo-update.service /etc/systemd/system/
sudo install -m 644 releasechronicle-demo-update.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now releasechronicle-demo-update.timer
```

The script compares the digests before and after `docker compose pull` and only
recreates the containers when the tag has moved. `up -d` is already idempotent, so
the comparison only exists to keep the journal readable.

```bash
systemctl list-timers releasechronicle-demo-update.timer   # next run
journalctl -u releasechronicle-demo-update.service -n 50   # what it did
sudo systemctl start releasechronicle-demo-update.service  # force one now
```

Latency between a merge to `rc` and the demo being up to date: the CI (~5 min) plus
at most 5 min of timer.

> The GHCR package is public, so the pull needs no credentials. Were it to go private
> again, `docker login ghcr.io` would have to have been run by the user the timer runs
> as (root here) — the token lands in `~/.docker/config.json`. An expired PAT makes
> the pull fail silently on the service side: `journalctl` is the only place it shows.

## Automatic versions

The version number is never written by hand. `release-please` reads the commit
messages that landed on `main` since the last release and derives the bump from them.

### Where the rc images' number comes from

`package.json` only moves when the release PR is merged, so on `rc` it still holds the
**previous** version — tagging `rc-0.1.0` would name an image that already carries
post-0.1.0 work.

`scripts/next-version.ts` therefore computes the version to come: the commits since
the last `v*` tag, under release-please's own rules, read out of
`release-please-config.json` so the two cannot drift apart (`src/lib/version.ts`,
covered by `tests/lib/version.test.ts`). The CI runs it in the `test` job and passes
the result as `build-args: RC_VERSION`, which the Dockerfile turns into
`NEXT_PUBLIC_RC_VERSION` **before** `npm run build` — Next inlines `NEXT_PUBLIC_*` at
compile time, not at startup.

The upshot: the tag and the login screen show the same number, and `rc-0.2.0-rc.15`
becomes `release-0.2.0` without the digits changing.

Note that the version only moves at a **release**, not at a commit: it answers "what
would the next release after 0.1.0 be", so ten `feat:` commits still add up to a
single 0.2.0. The `-rc.<n>` counter is what moves between two candidates.

Outside the CI (`npm run dev`, a local build) the variable is empty and
`src/lib/appMeta.ts` falls back to `package.json`.

The `test` job's checkout uses `fetch-depth: 0`: without the tags, the script would
not know where the range of commits to read begins.

**Commit messages become contractual** — the
[Conventional Commits](https://www.conventionalcommits.org/) format:

| Commit | Effect from 0.1.0 |
|---|---|
| `fix: ...` | 0.1.0 → 0.1.1 |
| `feat: ...` | 0.1.0 → 0.2.0 |
| `feat!: ...` or `BREAKING CHANGE:` in the body | 0.1.0 → 0.2.0 (no 1.0.0 while we are on 0.x) |
| `chore:`, `test:`, `style:` | none, and absent from the CHANGELOG |

`bump-minor-pre-major: true` in `release-please-config.json` is what makes a `feat`
raise the minor rather than the patch before 1.0.0. Moving to 1.0.0 is a manual
decision (`Release-As: 1.0.0` in a commit body).

### How it plays out

1. You merge a PR into `main`. `release-please` opens — or updates — a
   `chore(main): release 0.2.0` PR carrying the `package.json` bump and the
   `CHANGELOG.md` entry. It stays open and grows with every subsequent merge.
2. When you want to ship, you merge that PR. It creates the `v0.2.0` tag, the GitHub
   Release, and triggers publication of the `:release-0.2.0`, `:0.2.0`, `:0.2` and
   `:latest` images.

Nothing to tag, nothing to edit. The only decision left to you: *when* to merge the
release PR.

### One repository setting to make

Settings → Actions → General → Workflow permissions:

- tick **Allow GitHub Actions to create and approve pull requests**

Without it, `release-please` fails with `GitHub Actions is not permitted to create
pull requests`.

### Why the release images do not come out of ci.yml

A tag created with `GITHUB_TOKEN` does **not** trigger another workflow — a GitHub
guard against loops. A `tags: ["v*"]` trigger on `ci.yml` would therefore never fire.
So `release-please.yml` calls `publish-images.yml` itself once the release has just
been created. The commit is not untested for all that: it went through the full CI as
a pull request, and again on the push to `main`.

### Pinning the demo to a version

By default the demo follows `rc`. To pin it: `RC_IMAGE_TAG=0.2.0` in `.env.demo` on
the server — the timer then has nothing left to pull.
