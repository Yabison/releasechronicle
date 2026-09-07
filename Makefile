# Dev / test helpers. See docs/dev-environment.md.
.PHONY: help build up up-deps down demo-up demo-down reset dev test lint migrate wipe \
        seed seed-private seed-private-config ldap-admin backup restore

help: ## List targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build: ## Build the app image
	docker compose build

# `up` and `down` name no service: compose starts everything in the default
# profile, so a service added to docker-compose.yml is picked up here without
# anyone remembering to. The previous hardcoded list had already drifted.
up: ## Start every container, app included (app publishes 3000 — see up-deps)
	docker compose up -d

# The app image publishes 3000, which is also the port `make dev` binds. Running
# the app on the host means running everything BUT the app in Docker, which is
# the flow docs/dev-environment.md describes.
up-deps: ## Start only what the host-run app needs (db, db_test, mailpit, ldap)
	docker compose up -d $$(docker compose config --services | grep -vx app)

down: ## Stop the dev containers, keeping their data
	docker compose stop

demo-up: ## Start the self-contained demo stack (own database, port 3001)
	docker compose --profile demo up -d

demo-down: ## Stop the demo stack
	docker compose --profile demo stop

reset: ## Migrate + seed the demo dataset
	npx prisma migrate deploy && npm run db:seed:demo

dev: ## Run the app on the host
	npm run dev

test: ## Run the test suite
	npm test

lint: ## ESLint over the whole repo (zero-warning budget)
	npm run lint

migrate: ## Create/apply a dev migration
	npm run db:migrate

wipe: ## Empty every table
	npm run db:wipe

seed: ## Seed the publishable demo dataset (Yabison)
	npm run db:seed:demo

seed-private: ## Seed the real dataset (needs private/, not in the repo)
	npm run db:seed:private

seed-private-config: ## Real hierarchy only, no events
	npm run db:seed:private:config

ldap-admin: ## Add admin/admin to the running dev LDAP
	printf 'dn: uid=admin,ou=users,dc=example,dc=org\nobjectClass: inetOrgPerson\nuid: admin\ncn: Admin\nsn: Admin\nmail: admin@example.org\nuserPassword: admin\n\ndn: cn=admins,ou=groups,dc=example,dc=org\nchangetype: modify\nadd: member\nmember: uid=admin,ou=users,dc=example,dc=org\n' | docker compose exec -T ldap ldapadd -x -D "cn=admin,dc=example,dc=org" -w adminpassword -c

backup: ## Dump the dev database to backups/ (gzip)
	@mkdir -p backups
	docker compose exec -T db pg_dump -U rc -d releasechronicle | gzip > backups/releasechronicle-$(shell date +%Y%m%d-%H%M%S).sql.gz
	@ls -1t backups/*.sql.gz | head -1 | sed 's/^/-> /'

restore: ## Restore a backup (FILE=path, default = latest in backups/)
	gunzip -c $(or $(FILE),$(shell ls -1t backups/*.sql.gz | head -1)) | docker compose exec -T db psql -U rc -d releasechronicle
