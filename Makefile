# Dev / test helpers. See docs/dev-environment.md.
.PHONY: help build up down reset dev test lint migrate wipe seed seed-import seed-config seed-rundeck ldap-admin backup restore

help: ## List targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build: ## Start containers (db, db_test, mailpit, ldap)
	docker compose build

up: ## Start containers (db, db_test, mailpit, ldap)
	docker compose up -d db db_test mailpit ldap

down: ## Stop the dev containers
	docker compose stop db db_test mailpit ldap

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
