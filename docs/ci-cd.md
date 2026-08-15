# CI / CD

## Le flux

```
fix/xxx  feat/xxx
   |         |
   +----+----+
        v  PR (CI: tests, typecheck, build, scan)
       rc  ------> image ghcr .../releasechronicle:rc
        |            |
        |            v  timer systemd, toutes les 5 min
        |          serveur de démo
        v  PR
      main ------> image :main (intégration, déployée par personne)
        |
        v  release-please ouvre "chore(main): release 0.2.0"
        v  merge de cette PR
     tag v0.2.0 --> images :0.2.0, :0.2, :latest + GitHub Release
```

| Branche / ref | Tests | Image publiée | Déployé |
|---|---|---|---|
| `fix/*`, `feat/*` (PR) | oui | non | — |
| `rc` | oui | `:rc`, `:sha-<sha>` | démo, automatiquement |
| `main` | oui | `:main`, `:sha-<sha>` | rien |
| tag `v*` (release-please) | déjà passés | `:0.2.0`, `:0.2`, `:latest` | à la main pour l'instant |

Chaque image a son pendant `-demo-tools` (seeders + ticker), même tag suffixé.

## Ce que fait la CI

`.github/workflows/ci.yml`, trois jobs.

**test** — sur PR et sur push. `npm ci`, conteneurs `db_test` (5433) et `ldap` (1389)
via compose, `prisma migrate deploy`, `npm test`, `npm run build`, puis
`tsc --noEmit` (après le build : tsconfig inclut `next-env.d.ts` et `.next/types/**`,
que le build génère ; `next build` ne typecheck que l'app, cette passe ajoute
`tests/` et `prisma/`).

**security** — `npm audit` (non bloquant : une CVE amont ne doit pas mettre au rouge
une PR sans rapport), build local de l'image runtime, scan Trivy HIGH/CRITICAL,
SARIF vers code scanning.

**publish** — seulement sur push de `rc` ou `main`, et seulement si `test` passe.
Appelle `publish-images.yml`, le workflow réutilisable qui construit et pousse les
deux images. Il est réutilisable pour que `release-please.yml` pousse exactement de
la même façon : une seule définition du build, pas de dérive entre les deux chemins.

## Protection de branches à poser

Sur `rc` et `main` (Settings → Branches → Add rule) :

- require a pull request before merging
- require status checks : `Typecheck, test, build`
- require branches to be up to date before merging

Sans ça, un push direct sur `rc` déploie la démo sans être passé par les tests.

## CD de la démo — pull-based

Aucun accès entrant au serveur, aucune clé SSH dans les secrets GitHub : le serveur
va chercher l'image lui-même.

Fichiers dans `deploy/`. Installation :

```bash
sudo install -m 755 rc-demo-update.sh /usr/local/bin/rc-demo-update.sh
sudo install -m 644 releasechronicle-demo-update.service /etc/systemd/system/
sudo install -m 644 releasechronicle-demo-update.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now releasechronicle-demo-update.timer
```

Le script compare les digests avant / après `docker compose pull` et ne recrée les
conteneurs que si le tag a bougé. `up -d` étant déjà idempotent, la comparaison ne
sert qu'à garder un journal lisible.

```bash
systemctl list-timers releasechronicle-demo-update.timer   # prochaine exécution
journalctl -u releasechronicle-demo-update.service -n 50   # ce qu'il a fait
sudo systemctl start releasechronicle-demo-update.service  # forcer maintenant
```

Latence entre le merge sur `rc` et la démo à jour : le temps de la CI (~5 min) plus
au plus 5 min de timer.

> Le paquet GHCR est public, le pull se fait sans identifiants. S'il repassait en
> privé, le `docker login ghcr.io` devrait avoir été fait par
> l'utilisateur qui exécute le timer (root ici) — le token est écrit dans
> `~/.docker/config.json`. Un PAT expiré fait échouer le pull en silence côté
> service : le `journalctl` est le seul endroit où ça se voit.

## Versions automatiques

Le numéro de version n'est jamais écrit à la main. `release-please` lit les messages
de commit arrivés sur `main` depuis la dernière release et en déduit le bump.

**Les messages de commit deviennent contractuels** — format
[Conventional Commits](https://www.conventionalcommits.org/) :

| Commit | Effet depuis 0.1.0 |
|---|---|
| `fix: ...` | 0.1.0 → 0.1.1 |
| `feat: ...` | 0.1.0 → 0.2.0 |
| `feat!: ...` ou `BREAKING CHANGE:` dans le corps | 0.1.0 → 0.2.0 (pas de 1.0.0 tant qu'on est en 0.x) |
| `chore:`, `test:`, `style:` | aucun, et absents du CHANGELOG |

C'est `bump-minor-pre-major: true` dans `release-please-config.json` qui fait qu'un
`feat` monte le minor plutôt que le patch avant la 1.0.0. Le passage en 1.0.0 se
décide à la main (`Release-As: 1.0.0` dans le corps d'un commit).

### Comment ça se passe

1. Tu merges une PR sur `main`. `release-please` ouvre — ou met à jour — une PR
   `chore(main): release 0.2.0`, qui contient le bump de `package.json` et l'entrée
   de `CHANGELOG.md`. Elle reste ouverte et s'enrichit à chaque merge suivant.
2. Quand tu veux publier, tu merges cette PR. Ça crée le tag `v0.2.0`, la GitHub
   Release, et déclenche la publication des images `:0.2.0`, `:0.2`, `:latest`.

Rien à taguer, rien à éditer. La seule décision qui te reste : *quand* merger la PR
de release.

### Réglage à faire une fois dans le dépôt

Settings → Actions → General → Workflow permissions :

- cocher **Allow GitHub Actions to create and approve pull requests**

Sans ça, `release-please` échoue avec `GitHub Actions is not permitted to create pull
requests`.

### Pourquoi les images de release ne sortent pas de ci.yml

Un tag créé avec `GITHUB_TOKEN` ne déclenche **pas** d'autre workflow — un garde-fou
GitHub contre les boucles. Un trigger `tags: ["v*"]` sur `ci.yml` ne partirait donc
jamais. `release-please.yml` appelle donc lui-même `publish-images.yml` quand la
release vient d'être créée. Le commit n'est pas non testé pour autant : il est passé
par la CI complète en PR, puis à nouveau au push sur `main`.

### Figer la démo sur une version

Par défaut la démo suit `rc`. Pour l'épingler : `RC_IMAGE_TAG=0.2.0` dans
`.env.demo` sur le serveur — le timer n'aura alors plus rien à tirer.
