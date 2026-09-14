.PHONY: help docs-lint docs-fix

help:  ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

# ---- Docs ----
DOCS_GLOBS := "**/*.md" "!**/node_modules/**" "!.claude/**"

docs-lint:  ## markdownlint every markdown file
	markdownlint-cli2 --config .markdownlint.json $(DOCS_GLOBS)

docs-fix:  ## markdownlint --fix (auto-corrects fixable issues)
	markdownlint-cli2 --fix --config .markdownlint.json $(DOCS_GLOBS)
