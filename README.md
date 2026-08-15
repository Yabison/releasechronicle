# releasechronicle

Suivi des mises en production (MEP), déploiements, incidents et fenêtres de
maintenance — avec workflow de statut, environnements dynamiques, métriques DORA,
hooks de notification (webhook / Teams / email), authentification LDAP/AD, et un flux
calendrier iCalendar abonnable.

> Application interne Next.js 15 + PostgreSQL. Les **lectures** sont publiques ; les
> **écritures de configuration** exigent une session admin ; l'**API d'ingestion REST**
> (CI/scripts) utilise un jeton d'écriture.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide (Docker)](#démarrage-rapide-docker)
- [Développement local](#développement-local)
- [Configuration (variables d'environnement)](#configuration-variables-denvironnement)
- [Fichiers de configuration](#fichiers-de-configuration-config)
- [Authentification & rôles](#authentification--rôles)
- [Workflow de déploiement](#workflow-de-déploiement)
- [Environnements](#environnements)
- [Ingestion depuis la CI](#ingestion-depuis-la-ci)
- [Hooks de notification](#hooks-de-notification)
- [Lien d'action « one-click »](#lien-daction-one-click)
- [Calendrier iCalendar](#calendrier-icalendar)
- [Métriques DORA](#métriques-dora)
- [API REST](#api-rest)
- [Interface admin](#interface-admin)
- [Tests](#tests)
- [Architecture](#architecture)

---

## Fonctionnalités

- **Timeline par service** : déploiements (MEP / MEP HOTFIX / MEP ROLLBACK), incidents,
  maintenances — filtrables par environnement, version, requester, tag, date. Durée de
  déploiement affichée (IN_PROGRESS → live, ou jusqu'au rollback).
- **Workflow de statut** : `SCHEDULED → PENDING → IN_PROGRESS → DEPLOYED → TESTING →
  VALIDATE`, avec historique des transitions, rollback, validation QA.
- **Déploiements planifiés** : statut `SCHEDULED` + date planifiée ; promotion
  automatique en `PENDING` un délai configurable avant l'échéance (endpoint
  déclenché par cron).
- **Lot multi-produit** : créer en une fois N déploiements partageant un même numéro de
  lot (Company → Produit → Service par ligne).
- **Environnements dynamiques** : ajout / renommage / couleur / ordre / soft-delete via
  l'admin (plus d'enum figé).
- **Métriques DORA** : fréquence de déploiement, lead time, change failure rate, MTTR —
  filtrables, avec bandes Elite/High/Medium/Low.
- **Hooks** webhook / Microsoft Teams / email, ciblés par kind d'événement et par
  transition précise, avec templates par sévérité (rouge / orange / vert) et **cibles
  réutilisables** (groupes de mails, URLs).
- **Lien d'action one-click** dans les messages : avancer le statut sans se connecter.
- **Flux iCalendar** abonnable (Outlook / Google / Apple) des MEP planifiées et
  maintenances.
- **Import / export Excel** des événements.
- **Authentification** : provider local (fichier) ou **LDAP/AD** (search-then-bind,
  mapping groupes → rôles).

---

## Démarrage rapide (Docker)

```bash
docker compose up -d --build       # Postgres + Postgres de test + OpenLDAP + l'app
```

- L'app écoute sur **http://localhost:3000**
- La base est migrée automatiquement au démarrage (`docker-entrypoint.sh`).

Seed de données de démonstration :

```bash
npm install
npm run db:seed:demo
```

Connexion admin de démo : **`admin` / `admin`** (à changer — voir
[Authentification](#authentification--rôles)).

---

## Jeux de données

Deux jeux, volontairement séparés.

| Commande | Contenu |
|---|---|
| `npm run db:seed:demo` | **Yabison**, 90 jours d'activité générés relativement à *maintenant*. Commité, publiable, c'est le jeu par défaut. |
| `npm run db:seed:private` | Vos vraies données. Lit `private/`, qui est **gitignoré** — le dépôt ne contient aucune donnée client. |

Le jeu de démo couvre délibérément toutes les fonctionnalités de l'UI : lots
multi-services, rollback détecté par numéro de build, hotfix avec ses phases PRE et
POST MEP, HO/HNO, incidents ouverts et résolus, maintenance à venir, dérive de build,
et des déploiements en cours au moment du seed. La compagnie **Yabison** est publique
et **Kaleido** ne l'est pas, ce qui rend le mode public visible sans se connecter.
Le produit *Release Chronicle* rejoue l'historique git réel de ce projet.

Le seeder privé attend `private/hierarchy.yml` (noms compagnies/produits/services) et
`private/deployments.xlsx` (export de déploiements au format de l'export Excel de
l'app). Chemins surchargeables par `RC_PRIVATE_HIERARCHY` et `RC_PRIVATE_IMPORT`.

## Instance de démo vivante

Une pile autonome, base et port dédiés, pilotée par une boucle qui fait avancer le
monde toutes les quelques minutes et le reconstruit à **00:00 UTC** :

```bash
docker compose --profile demo up -d    # app sur http://localhost:3001
docker compose logs -f demo_driver     # voir les déploiements avancer
```

Comptes : `demo` (devops), `demo-qa` (qa), `demo-admin` (admin) — mot de passe `demo`
pour les trois, définis dans `config/auth-users.demo.yml`. Deux rôles distincts pour
que le workflow de validation soit réellement essayable : un QA valide
TESTING → VALIDATE, un devops fait le reste. Les visiteurs anonymes ont la vue
publique en lecture seule.

Le ticker et le reset **refusent de s'exécuter** si `RC_DEMO_MODE` n'est pas à `true`
*et* si le nom de la base ne contient pas `demo` : un `DATABASE_URL` mal saisi ne peut
pas effacer autre chose. Exécution manuelle : `npm run demo:tick` / `npm run demo:reset`.

Pour publier cette instance sur un serveur (images GHCR + Traefik) :
[docs/demo-deploy.md](docs/demo-deploy.md).

---

## Développement local

Prérequis : Node 20+, une base PostgreSQL.

```bash
npm install
# renseigner DATABASE_URL dans .env (ex: postgresql://rc:rc@localhost:5432/releasechronicle)
npm run db:deploy            # applique les migrations
npm run db:seed:demo         # (optionnel) jeu de démo Yabison
npm run dev                  # http://localhost:3000
```

Les conteneurs `db` (5432) et `db_test` (5433) du `docker-compose.yml` fournissent les
bases de dev et de test.

---

## Configuration (variables d'environnement)

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL | — (requis) |
| `RC_WRITE_TOKEN` | Jeton `Bearer` de l'API d'ingestion REST (CI/scripts) | `change-me` *(refusé en production)* |
| `AUTH_SECRET` | Clé de signature des sessions JWT + jetons d'action | *(fallback dev, refusé en production)* |
| `AUTH_PROVIDER` | `local` (défaut) ou `ldap` | `local` |
| `AUTH_USERS_FILE` | Chemin du fichier d'utilisateurs locaux | `config/auth-users.yml` |
| `LDAP_URL` / `LDAP_BASE_DN` / `LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` | Connexion LDAP/AD (mode `ldap`) | — |
| `LDAP_CONFIG_FILE` | Filtres + mapping groupes→rôles | `config/ldap.yml` |
| `DEPLOY_CONFIG_FILE` | Config du délai de promotion planifiée | `config/deploy.yml` |
| `APP_BASE_URL` | Origine des liens one-click dans les messages | `http://localhost:3000` |
| `RC_WEBHOOK_BLOCK_PRIVATE` | Refuse aussi les webhooks vers des adresses privées/loopback | `false` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Envoi des emails (connecteur `email`) | — |

> En production, définir impérativement `AUTH_SECRET`, `RC_WRITE_TOKEN`, `APP_BASE_URL`
> et le SMTP si l'email est utilisé.
>
> `AUTH_SECRET` et `RC_WRITE_TOKEN` ont des valeurs publiques par défaut (celles de
> `.env.example`). Sous `NODE_ENV=production` — ce qui inclut l'image Docker — elles
> sont **refusées** : l'app ne démarre pas sans `AUTH_SECRET` privé, et un
> `RC_WRITE_TOKEN` resté sur `change-me` fait échouer l'ingestion en 401. Générer
> les deux avec `openssl rand -base64 32`.

---

## Fichiers de configuration (`config/`)

`config/` est copié dans l'image Docker. Il contient :

- **`auth-users.yml`** — utilisateurs de l'auth locale (username, name, email, roles,
  `passwordHash` scrypt). Générer un hash :
  ```bash
  npx tsx -e "import {hashPassword} from './src/lib/auth/localProvider'; console.log(hashPassword('MON_MDP'))"
  ```
- **`ldap.yml`** — `userSearchFilter`, attributs, `groupSearchFilter`, table
  `groupRoles` (CN de groupe → rôle).
- **`deploy.yml`** — `scheduledLeadMinutes` (défaut 15) : délai avant la date planifiée
  où une MEP `SCHEDULED` passe en `PENDING`.
- **`hook-templates/{red,orange,green}.yml`** — templates de message par sévérité
  (email `subject`/`body`, teams `title`/`text`), avec variables `{product}`,
  `{service}`, `{environment}`, `{version}`, `{status}`, `{actor}`, `{fromStatus}`,
  `{toStatus}`, `{comment}`, `{actionUrl}`, …
  Localisés : `{couleur}.{locale}.yml` (ex. `red.en.yml`) est utilisé quand la cible de
  notification est configurée dans cette langue ; le fichier sans locale reste le
  français par défaut. Un fichier manquant retombe sur les templates intégrés.

---

## Authentification & rôles

- **Rôles** : `admin`, `devops`, `qa`, `viewer`.
- **Sessions** : JWT signé (HS256) dans un cookie `httpOnly` (`rc_session`), 8 h.
- **Login** : page `/login` → `POST /api/auth/login`. Logout : `POST /api/auth/logout`.
  Session courante : `GET /api/auth/me`.
- **Provider local** (défaut) : lit `config/auth-users.yml` (mots de passe scrypt).
- **Provider LDAP/AD** (`AUTH_PROVIDER=ldap`) : bind d'un compte de service → recherche
  de l'utilisateur → re-bind pour vérifier le mot de passe → lecture des groupes →
  mapping en rôles via `config/ldap.yml`.

**Enforcement** :

- Les routes de **configuration** (companies, produits, services, environnements,
  hooks, cibles, sources d'ingestion) exigent une **session `admin`**.
- Les **transitions de déploiement** exigent une session : rôle `qa` pour
  TESTING/VALIDATE, `devops` sinon, `admin` partout ; l'acteur = l'utilisateur connecté.
- L'**API d'ingestion REST** (`/api/v1/deployments|incidents|maintenances`) reste
  protégée par `RC_WRITE_TOKEN` (pour la CI).
- Les **server actions** (création/édition depuis l'UI, import/export Excel) exigent
  une session. Une server action est un endpoint POST ordinaire : « côté serveur »
  n'est pas un contrôle d'accès.
- **Brute force** : 5 échecs de login pour un couple (IP, identifiant) déclenchent une
  pause de 15 minutes (`429` + `Retry-After`). Le compteur est en mémoire du process,
  donc derrière *N* replicas la limite effective est 5×N.

---

## Sécurité

**En-têtes** — le middleware pose une CSP par requête avec un *nonce* : seuls les
scripts estampillés par Next s'exécutent, un `<script>` injecté est inerte.
S'y ajoutent HSTS (production uniquement), `nosniff`, `frame-ancestors 'none'` /
`X-Frame-Options: DENY`, `Referrer-Policy` et `Permissions-Policy`.
`style-src` garde `'unsafe-inline'` : un nonce ne peut pas couvrir un attribut
`style="…"`, que l'UI utilise pour les couleurs de statut et d'environnement.

**Webhooks sortants** — les URLs de hooks et de cibles sont vérifiées à la création
*et* à l'envoi : schéma `http(s)` obligatoire, adresses link-local (métadonnées cloud
`169.254.x`, `fd00:ec2::254`) toujours refusées, redirections non suivies. Les
adresses privées restent autorisées par défaut (une instance auto-hébergée notifie
des endpoints internes) ; `RC_WEBHOOK_BLOCK_PRIVATE=true` les refuse aussi.
Limite connue : seules les IP littérales sont inspectées, un nom d'hôte qui *résout*
vers une adresse privée passe — le vrai contrôle reste le filtrage réseau sortant.

**Liens one-click** (`/go/<token>`) — le token *est* l'autorisation, puisque le
destinataire n'a pas de session. Il est donc à **usage unique** (un `jti` consommé en
base, une seule fois même en cas de double clic simultané) et expire en **48 h**, de
sorte qu'un mail transféré ou archivé ne rejoue rien.

**Journal d'audit** — table `AuditLog`, consultable dans `/admin/audit` ou via
`GET /api/v1/audit` (admin). Sont tracés : connexions réussies, échouées et bloquées,
création/suppression de sources d'ingestion, de hooks et de cibles de notification,
et chaque usage d'un lien one-click (y compris les tentatives de rejeu). Les secrets
n'y sont jamais recopiés : on enregistre le label, le type et l'hôte, jamais le token
ni l'URL complète.

---

## Workflow de déploiement

```
SCHEDULED → PENDING → IN_PROGRESS → DEPLOYED → TESTING → VALIDATE
```

- Chaque transition est enregistrée (from/to, acteur, commentaire ; commentaire requis
  pour VALIDATE) et peut déclencher des hooks.
- **Rollback** : barre le déploiement, ajoute une entrée ROLLBACK ; la durée de
  déploiement se termine alors à la date du rollback.
- **MEP planifiée** : créer avec le statut `SCHEDULED` + une date planifiée ;
  `POST /api/v1/deployments/promote-scheduled` (cron) promeut en `PENDING` celles dont
  l'échéance est proche (délai `scheduledLeadMinutes`).

---

## Environnements

Gérés dynamiquement dans **Admin → Environnements** : nom, slug (immuable), couleur,
ordre, soft-delete. Le workflow d'environnements par produit (ex `DEV → QA → PROD`) est
éditable par produit et affiché sur le drawer d'un déploiement.

---

## Ingestion depuis la CI

Créer une **source d'ingestion** dans **Admin → Sources** (portée **Service**,
**Company** ou **Global**). Chaque source a un jeton. La CI poste :

```bash
curl -X POST "$APP/api/v1/ingest/deployments" \
  -H "authorization: Bearer <TOKEN_DE_LA_SOURCE>" \
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

- **Service** : le service est implicite (lié au jeton).
- **Company** : le payload précise `product` + `service`.
- **Global** : le payload précise `company` + `product` + `service`.
- `defaultEnvironment` de la source peut être `ALL` (aucun défaut) → le payload doit
  alors fournir `environment`.

---

## Hooks de notification

Par produit (**Admin → Hooks**) :

- **Types** : `webhook`, `teams`, `email`.
- **Événements** : `deploy.created`, `deploy.status_changed`, `deploy.status_undone`,
  `deploy.rolled_back`, `incident.created`, `maintenance.created` (ou `*`).
- **Transitions ciblées** (pour `deploy.status_changed`) : ex `DEPLOYED → TESTING`.
- **Cibles réutilisables** (**Admin → Cibles**) : définir une fois un groupe de mails,
  une URL Teams ou webhook, puis la **réutiliser** dans plusieurs hooks — l'éditer met à
  jour tous les hooks qui la référencent (référence vivante).
- **Templates** par sévérité dans `config/hook-templates/` (rouge : incident/rollback ;
  orange : MEP en cours ; vert : terminé), en français et en anglais
  (`{couleur}.en.yml`). La langue se choisit par cible dans **Admin → Cibles**.
- **Journal des livraisons** : **Admin → Logs** (`/admin/logs`), filtrable
  (kind, type, ok/échec, code, erreur, date) + pagination.
- **Intégration sans code** : un hook `webhook` peut pointer vers un flux
  **Power Automate / Logic Apps** (déclencheur *HTTP request* → *Créer un événement
  Outlook*). Le payload inclut `scheduledAt`, `windowStart`, `windowEnd`.

---

## Lien d'action « one-click »

Les messages (template orange) peuvent inclure `{actionUrl}` : un lien signé, scopé à
**une** transition d'**un** événement. Le destinataire ouvre `/go/<token>`, confirme, et
le statut avance (acteur « lien ») — sans connexion. Usage unique garanti par la machine
à états (un second clic est sans effet) ; expiration 7 jours. Définir `APP_BASE_URL`
pour que les liens pointent vers le bon hôte.

---

## Calendrier iCalendar

Flux abonnable des MEP planifiées et fenêtres de maintenance :

```
GET /api/v1/calendar.ics?company=&product=&service=&environment=
```

`Content-Type: text/calendar`. S'abonner depuis Outlook / Google / Apple Calendar via
l'URL. Les déploiements utilisent `scheduledAt` (sinon `occurredAt`) ; les maintenances
la fenêtre `windowStart → windowEnd`.

---

## Métriques DORA

Page **/metrics** (lien dans la sidebar). Filtres company / produit / service /
environnement + fenêtre (30/90/180 j). Quatre cartes :

- **Deployment frequency** (nb + par jour)
- **Lead time for changes** (médiane occurredAt → DEPLOYED)
- **Change failure rate** (déploiements rollbackés / total)
- **MTTR** (médiane des incidents résolus)

Chaque métrique est classée en bande DORA (Elite / High / Medium / Low). API :
`GET /api/v1/metrics/dora?…&days=30`.

---

## API REST

Base : `/api/v1`. **Écritures de config** = session admin ; **ingestion** =
`Bearer RC_WRITE_TOKEN`. Spécification OpenAPI : `/api/v1/openapi.json`
(Swagger UI : `/api/docs`).

**Lectures** — une session voit tout. Sans session, l'API applique exactement les
mêmes règles que le mode public de l'UI : compagnie, produit *et* service doivent
être marqués publics, le type d'événement doit figurer dans les types publics, et
l'environnement doit être public. Un service privé renvoie **404**, pas 403 :
confirmer son existence serait déjà la fuite. Concerné : `companies`, `products`,
`services`, `services/*/events`, `services/*/current`, `environments`,
`metrics/dora` et `calendar.ics`.

Certaines lectures exigent en plus une **session admin**, parce qu'elles
transportent un secret ou permettent d'énumérer des comptes : `ingest-sources`
(jetons CI en clair), `notification-targets` et `products/*/hooks` (URLs de
webhook), `hooks/deliveries` (payloads envoyés), `directory` (comptes LDAP) et
`audit`. `lots/candidates` exige une session simple : il liste les MEP de toute la
compagnie et ne sert qu'au modal de création de lot.

Principales routes :

| Méthode | Route | Auth |
|---|---|---|
| GET | `/companies`, `/products`, `/services`, `/environments` | public |
| POST/PUT/DELETE | idem + `/products/[slug]/hooks`, `/notification-targets`, `/…/ingest-sources` | session admin |
| POST/PUT | `/deployments`, `/incidents`, `/maintenances` (+ `/[externalId]`) | write-token |
| POST | `/ingest/deployments` | jeton de source |
| POST | `/deployments/promote-scheduled` | write-token (cron) |
| GET | `/metrics/dora` | public |
| GET | `/calendar.ics` | public |
| GET/POST | `/auth/login`, `/auth/logout`, `/auth/me` | — |

---

## Interface admin

`/admin` (réservé au rôle `admin`), navigation latérale :

- **Companies** — création / liste.
- **Environnements** — CRUD couleurs + ordre.
- **Produits** — template d'URL de build + workflow d'environnements.
- **Hooks** — création (type, événements, transitions, cible ou config inline), liste,
  suppression ; lien vers les **Logs**.
- **Cibles** — CRUD des cibles de notification réutilisables.
- **Sources** — sources d'ingestion (service / company / global) + exemple `curl`.
- **Logs** (`/admin/logs`) — journal filtrable des livraisons de hooks.

---

## Tests

```bash
npm test            # vitest (une fois)
npm run test:watch  # mode watch
```

La suite nécessite Postgres de test (port 5433) et, pour le test d'intégration LDAP, le
conteneur `ldap` (`docker compose up -d db_test ldap`).

---

## Architecture

- **Next.js 15** (App Router) — pages serveur + route handlers + server actions.
- **Prisma 6 / PostgreSQL** — modèle événementiel (`Event` : DEPLOYMENT / INCIDENT /
  MAINTENANCE) + `StatusTransition`, `Rollback`, `Hook`, `NotificationTarget`,
  `EnvironmentConfig`, `IngestSource`, `HookDelivery`.
- **jose** — sessions et jetons d'action signés. **ldapts** — provider LDAP.
  **nodemailer** — email. **exceljs** — import/export.
- **Logique pure et testable** isolée (`src/lib/*`) : workflow de statut, métriques
  DORA, mapping de rôles, templates, ICS — testée en node ; les composants React sont
  vérifiés manuellement.
- Conteneurs : `db`, `db_test`, `ldap`, `app` (`docker-compose.yml`).
