# Currency converter

A NestJS service that converts amounts between currencies using Monobank exchange rates, with a Redis cache in front of the upstream.

[![backend-ci](https://github.com/bitsa/assignment-currency-converter/actions/workflows/backend-ci.yml/badge.svg?branch=main)](https://github.com/bitsa/assignment-currency-converter/actions/workflows/backend-ci.yml)
[![integration-ci](https://github.com/bitsa/assignment-currency-converter/actions/workflows/integration-ci.yml/badge.svg?branch=main)](https://github.com/bitsa/assignment-currency-converter/actions/workflows/integration-ci.yml)
[![docs-ci](https://github.com/bitsa/assignment-currency-converter/actions/workflows/docs-ci.yml/badge.svg?branch=main)](https://github.com/bitsa/assignment-currency-converter/actions/workflows/docs-ci.yml)

## Overview

The repository holds a TypeScript backend (NestJS 11) and its Docker Compose stack: the `app` service and a Redis instance. Today the service starts, validates its configuration, and reports its readiness on `GET /health`, including whether Redis is reachable. Every pull request is checked by lint, format, type, unit, integration and markdown gates before it can reach `main`.

## Architecture

This section describes the components, the request flow and where each design pattern lives in the code.

## Quick start

Prerequisites: Docker with Compose v2. Node 24 is needed only to run the tests and `make docs-lint`.

Start the stack (no `.env` file is required):

```bash
docker compose up -d --build   # or: make up-d
```

Check that it is ready:

```bash
curl http://localhost:3000/health   # or: make health
```

A ready stack answers `200` with `"status":"ok"` in the body.

Stop it:

```bash
docker compose down   # or: make down
```

## Configuration

Application variables, read by the service at startup. An unset variable takes its default; an empty or invalid value stops the service with an error naming the variable.

| Variable | Default | Allowed values |
|---|---|---|
| `PORT` | `3000` | integer 1–65535 |
| `NODE_ENV` | `development` (Compose sets `production`) | `development`, `test`, `production` |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `REDIS_URL` | `redis://redis:6379` | URL with scheme `redis://` or `rediss://` |

Compose variables, read by Docker Compose from an optional `.env` file at the repository root:

| Variable | Default | Effect |
|---|---|---|
| `APP_HOST_PORT` | `3000` | host port mapped to the `app` container |
| `REDIS_HOST_PORT` | `6390` | host port mapped to Redis; non-standard so it does not clash with a local Redis |

[`.env.example`](.env.example) lists every variable with the value the stack uses; copy it to `.env` to override.

## API reference

The endpoints, request and response shapes and error codes are described here, and the running service serves interactive documentation at [http://localhost:3000/api/docs](http://localhost:3000/api/docs).

## Rate semantics

This section explains which Monobank rate is used for each conversion and how cross-currency conversions are calculated.

## Resilience

This section covers how the service behaves when Monobank or Redis is slow or unavailable.

## Testing

Install dependencies once from the repository root:

```bash
npm ci
```

| Command | What it runs |
|---|---|
| `npm test` | unit tests across workspaces |
| `npm run test:integration -w backend` | every integration spec, over HTTP against the Compose stack |
| `npm run test:integration:ci -w backend` | every integration spec except the stack-lifecycle tests, against a stack that is already up (as CI runs them) |
| `make docs-lint` | markdownlint over the repository's markdown files |

The stack-lifecycle integration tests start and stop the stack themselves, so they run locally with the stack down:

```bash
docker compose down
npm run test:integration -w backend -- stack-lifecycle
```

Continuous integration runs these checks on every pull request to `main` and on every commit to `main`:

- `backend-ci`, as two parallel jobs:
  - `lint-format-typecheck` — `npm ci`, ESLint, Prettier check and TypeScript check.
  - `unit-tests` — `npm ci` and the backend unit tests with a coverage report.
- `integration-ci` — builds and starts the Compose stack with `docker-compose.test.yml`, waits for `/health` to answer `200`, runs `npm run test:integration:ci -w backend`, and prints the service logs on failure.
- `docs-ci` — markdownlint over every tracked markdown file.

## Design decisions

This section summarises the main technical choices and the alternatives that were rejected.

## Out of scope

This section lists what the service deliberately does not do.
