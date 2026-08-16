# Publier l'instance de démo sur un serveur Linux

Une pile autonome — Postgres dédié, app, et une boucle qui fait avancer le monde
toutes les quelques minutes et le reconstruit à 00:00 UTC — derrière Traefik.

Rien n'est compilé sur le serveur : les deux images sont tirées de GHCR, publiées par
`.github/workflows/ci.yml` sur un tag `v*` (et sur `main`).

| Image | Contenu | Rôle |
|-------|---------|------|
| `ghcr.io/yabison/releasechronicle:<tag>` | runtime Next standalone | l'app |
| `ghcr.io/yabison/releasechronicle:<tag>-demo-tools` | + tsx, seeders, sources | le ticker |

> L'instance de démo charge `config/auth-users.demo.yml`, dont les mots de passe sont
> publiés dans ce dépôt. **Elle ne doit jamais contenir de données réelles.**

## Prérequis

- Docker Engine + plugin compose v2
- un Traefik déjà en place, avec un certresolver ACME configuré
- un DNS `demo.example.org` → IP du serveur

## 1. Publier les images

La démo suit la branche `rc` : tout merge dessus republie le tag mouvant `:rc`
(et `:rc-demo-tools`). Voir [docs/ci-cd.md](ci-cd.md) pour le flux complet.

```bash
git push origin rc          # -> images :rc
```

Les images versionnées (`:0.2.0`, `:0.2`, `:latest`) sortent du merge de la PR de
release ouverte par `release-please` sur `main` — pas d'un `git tag` manuel.

Le paquet GHCR est **public** (vérifié : `GET /v2/yabison/releasechronicle/manifests/rc`
répond 200 sans identifiants), donc le serveur tire sans authentification. S'il
repassait en privé — Package settings → Change visibility — il faudrait s'y
connecter avec un PAT `read:packages` :

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin
```

## 2. Poser la pile sur le serveur

Seuls deux fichiers sont nécessaires — pas de clone complet :

```bash
mkdir -p /srv/rc-demo && cd /srv/rc-demo
curl -O https://raw.githubusercontent.com/Yabison/releasechronicle/main/docker-compose.demo.yml
curl -O https://raw.githubusercontent.com/Yabison/releasechronicle/main/.env.demo.example
mv .env.demo.example .env.demo && chmod 600 .env.demo
```

Renseigne `.env.demo` :

```bash
openssl rand -hex 32      # DEMO_DB_PASSWORD  — hex obligatoire, voir ci-dessous
openssl rand -base64 32   # DEMO_AUTH_SECRET
openssl rand -base64 32   # DEMO_WRITE_TOKEN
```

> `DEMO_DB_PASSWORD` en **hex**, pas en base64 : il part tel quel dans
> `DATABASE_URL`, et un `/` — que base64 produit — coupe l'autorité de l'URL en
> deux. Prisma s'arrête alors sur
> `P1013 ... invalid port number in database URL`, parce qu'il lit le fragment de
> mot de passe qui suit le `:` comme un numéro de port.

`TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT` et `TRAEFIK_CERTRESOLVER` doivent coller au
proxy qui tourne. Pour les retrouver :

```bash
docker network ls | grep -i traefik
docker inspect <conteneur-traefik> --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -i 'entrypoint\|certresolver'
```

## 3. Démarrer

```bash
docker compose -f docker-compose.demo.yml --env-file .env.demo pull
docker compose -f docker-compose.demo.yml --env-file .env.demo up -d
docker compose -f docker-compose.demo.yml --env-file .env.demo logs -f demo_driver
```

Les migrations s'appliquent toutes seules : `docker-entrypoint.sh` lance
`prisma migrate deploy` au démarrage de l'app, et `scripts/demo-loop.sh` le refait
avant de construire le monde — idempotent, pas de course entre les deux.

Le premier `demo-reset` remplit la base immédiatement : un conteneur neuf n'est
jamais vide. Ensuite, un tick toutes les `DEMO_TICK_SECONDS` (180 par défaut) et une
reconstruction complète au premier changement de date UTC.

Comptes : `demo` (devops), `demo-qa` (qa), `demo-admin` (admin), mot de passe `demo`.
Les visiteurs anonymes ont la vue publique en lecture seule.

## 4. Mise à jour automatique

Un timer systemd va chercher l'image lui-même toutes les 5 minutes — rien à ouvrir
en entrée, aucune clé SSH dans les secrets GitHub. Depuis `deploy/` du dépôt :

```bash
sudo install -m 755 rc-demo-update.sh /usr/local/bin/rc-demo-update.sh
sudo install -m 644 releasechronicle-demo-update.service /etc/systemd/system/
sudo install -m 644 releasechronicle-demo-update.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now releasechronicle-demo-update.timer
```

```bash
systemctl list-timers releasechronicle-demo-update.timer   # prochaine exécution
journalctl -u releasechronicle-demo-update.service -n 50   # ce qu'il a fait
sudo systemctl start releasechronicle-demo-update.service  # forcer maintenant
```

Le service ne recrée les conteneurs que si le digest a bougé. Avec
`RC_IMAGE_TAG=rc`, la démo suit la branche RC ; avec `RC_IMAGE_TAG=0.1.0`, elle
reste figée et le timer ne fait plus rien.

À la main, sans le timer :

```bash
docker compose -f docker-compose.demo.yml --env-file .env.demo pull
docker compose -f docker-compose.demo.yml --env-file .env.demo up -d
```

## Exploitation

```bash
# état
docker compose -f docker-compose.demo.yml --env-file .env.demo ps

# reconstruire le monde tout de suite, sans attendre 00:00
docker compose -f docker-compose.demo.yml --env-file .env.demo exec demo_driver npx tsx prisma/demo-reset.ts

# repartir de zéro, base comprise
docker compose -f docker-compose.demo.yml --env-file .env.demo down -v
```

Pas de sauvegarde à prévoir : la base est reconstruite chaque nuit à partir du
seeder, il n'y a rien à perdre.

## Garde-fous

- `prisma/demo-guard.ts` : le ticker et le reset refusent de tourner si
  `RC_DEMO_MODE` n'est pas `true` **et** si le nom de la base ne contient pas
  `demo`. Un `DATABASE_URL` mal saisi ne peut pas effacer autre chose.
- `RC_WEBHOOK_BLOCK_PRIVATE=true` : aucune notification sortante vers une adresse
  privée depuis une instance publique.
- Le port Postgres n'est pas publié — seuls les deux conteneurs app y accèdent.
- TLS obligatoire : en production l'app envoie `Strict-Transport-Security` et
  `upgrade-insecure-requests` (`src/lib/securityHeaders.ts`). Servie en HTTP simple,
  le navigateur force https et la démo devient inatteignable.
- `APP_BASE_URL` doit être l'URL publique https : c'est elle que portent les liens
  d'action envoyés par mail (`src/lib/actionToken.ts`).

Restriction d'accès optionnelle, le temps d'une préversion : ajouter
`RC_IP_ALLOWLIST` (CIDR séparés par des virgules) à `app_demo`. Le filtre lit
`x-forwarded-for`, donc il suppose un reverse proxy de confiance devant — ce que
Traefik est ici.
