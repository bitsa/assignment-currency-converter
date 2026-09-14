.PHONY: help up up-d down logs ps health test lint docs-lint docs-fix

help:  ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

# ---- Stack ----
up:  ## Build and start the stack in the foreground
	docker compose up --build

up-d:  ## Build and start the stack detached
	docker compose up -d --build

down:  ## Stop and remove the stack's containers and network
	docker compose down

logs:  ## Follow the logs of every service
	docker compose logs -f

ps:  ## List services with their state and health
	docker compose ps

# Asks Compose for the published host port instead of parsing .env, so any value Compose
# accepts (quotes, inline comments, shell overrides) works here too.
health:  ## Print the /health body; exits non-zero unless it answers 200
	@port=$$(docker compose port app 3000 2>/dev/null | head -n 1 | sed 's/.*://'); \
	if [ -z "$$port" ]; then echo "app is not running: no published port for app:3000" >&2; exit 1; fi; \
	curl -sS --fail-with-body --max-time 10 -w '\n' "http://localhost:$$port/health"

# ---- Code ----
test:  ## Run the unit tests
	npm test

lint:  ## Run the linter
	npm run lint

# ---- Docs ----
DOCS_GLOBS := "**/*.md" "!**/node_modules/**" "!.claude/**"

docs-lint:  ## markdownlint every markdown file
	markdownlint-cli2 --config .markdownlint.json $(DOCS_GLOBS)

docs-fix:  ## markdownlint --fix (auto-corrects fixable issues)
	markdownlint-cli2 --fix --config .markdownlint.json $(DOCS_GLOBS)
