# TaskFlow API

A small Node.js/Express REST API for managing users and tasks (JWT authentication +
CRUD operations), built with SIT223/SIT753's HD Jenkins pipeline task in mind. It is
intentionally scoped so that every one of the assignment's 7 pipeline stages has
something real to do.

## Features

**Authentication**
- Register, log in, and an explicit `/api/auth/logout` endpoint (JWTs are
  stateless, so logout mainly clears the client-side token and logs the
  event — the natural hook point for token revocation if the app grows)
- Passwords hashed with bcrypt; server-side email format and password length
  validation

**Task management**
- Create, view, update, and delete tasks, scoped per authenticated user
- Dedicated `PATCH /api/tasks/:id/complete` and `/reopen` endpoints for
  marking a task done/not-done — plus a `PATCH /api/tasks/:id/status`
  endpoint for cycling through pending → in-progress → done directly
- In the UI: a checkbox for "mark complete" separate from the status pill,
  so both interaction styles are demonstrated

**Backend**
- REST API (Express)
- Plain JSON-file persistence (zero native dependencies, nothing to
  compile — installs cleanly on any machine or Jenkins agent)
- Token-based auth (JWT) via an `authenticate` middleware
- Server-side input validation (email format, required fields, string
  length limits, numeric route params) with consistent `{ "error": "..." }`
  responses
- Centralized error handling, including a friendly 400 for malformed JSON
  bodies rather than a raw 500

**Operational features**
- `/health` endpoint for readiness/liveness checks
- `/metrics` endpoint exposing Prometheus-format metrics (via `prom-client`)
- Structured JSON application/request logging (`src/utils/logger.js`) — one
  line per event, easy for Jenkins console output or a log shipper to parse
- Environment-based configuration (`src/config/index.js` + `dotenv`) — reads
  `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `LOG_LEVEL`, `NODE_ENV`, with sane
  defaults for development and a hard failure if a weak default secret is
  used in production
- Docker support: multi-stage `Dockerfile` + `docker-compose.yml`

**Testing & CI/CD**
- Jest + Supertest test suite (30+ assertions) with coverage and JUnit XML
  output
- ESLint configuration for static code analysis
- `sonar-project.properties` for SonarQube integration
- A complete `Jenkinsfile` implementing all 7 pipeline stages

## Tech stack

| Concern           | Tool/Library                                   |
|--------------------|-------------------------------------------------|
| Runtime            | Node.js 20, Express                            |
| Database           | JSON file store (`src/db`, plain Node.js `fs`) |
| Auth               | JWT (jsonwebtoken), bcryptjs                   |
| Config             | dotenv + `src/config`                          |
| Logging            | Custom structured JSON logger (`src/utils`)    |
| Testing            | Jest, Supertest                                |
| Code quality       | ESLint, SonarCloud                              |
| Security scanning  | npm audit, Snyk (or swap for Trivy)            |
| Containerization   | Docker, Docker Compose                         |
| Monitoring         | prom-client (Prometheus-compatible)            |
| CI/CD              | Jenkins (declarative pipeline)                 |

## Running locally

```bash
npm install
cp .env.example .env
npm start
# API + web UI both available at http://localhost:3000
```

## Running tests

```bash
npm test
```

## Running with Docker

```bash
docker compose up --build
curl http://localhost:3000/health
```

## API summary

| Method | Endpoint                     | Auth required | Description                          |
|--------|-------------------------------|:--------------:|----------------------------------------|
| POST   | `/api/auth/register`          | No             | Create a new user                      |
| POST   | `/api/auth/login`             | No             | Log in, receive a JWT                  |
| POST   | `/api/auth/logout`            | Yes            | Log out (clears client-side session)   |
| GET    | `/api/tasks`                  | Yes            | List your tasks                        |
| GET    | `/api/tasks/:id`              | Yes            | Get one task                            |
| POST   | `/api/tasks`                  | Yes            | Create a task                           |
| PUT    | `/api/tasks/:id`               | Yes            | Update a task's title/description/status |
| PATCH  | `/api/tasks/:id/status`        | Yes            | Change just the status                  |
| PATCH  | `/api/tasks/:id/complete`      | Yes            | Mark a task as done                     |
| PATCH  | `/api/tasks/:id/reopen`        | Yes            | Mark a completed task as pending again  |
| DELETE | `/api/tasks/:id`               | Yes            | Delete a task                           |
| GET    | `/health`                      | No             | Health check                            |
| GET    | `/metrics`                     | No             | Prometheus metrics                      |

## Configuration

All runtime configuration lives in `src/config/index.js`, sourced from
environment variables (see `.env.example`):

| Variable         | Default (dev)              | Notes                                          |
|-------------------|------------------------------|--------------------------------------------------|
| `PORT`            | `3000`                      |                                                  |
| `NODE_ENV`        | `development`               | `development`, `test`, or `production`          |
| `JWT_SECRET`       | insecure dev default        | **must** be overridden in production, or the app refuses to start |
| `JWT_EXPIRES_IN`   | `2h`                        | Any `jsonwebtoken` expiry string                |
| `LOG_LEVEL`        | `debug` (dev) / `info` (prod) | `debug`, `info`, `warn`, `error`               |

## How this maps to the 7 pipeline stages

1. **Build** — `npm ci`, `npm run build` (lint gate), then `docker build` produces a
   tagged, versioned Docker image (the build artefact).
2. **Test** — Jest + Supertest run unit/integration tests against the auth and task
   endpoints; results are published as JUnit XML for Jenkins' test reporting UI.
3. **Code Quality** — ESLint runs first as a fast static check, then SonarCloud runs a
   deeper analysis (duplication, complexity, maintainability) using
   `sonar-project.properties`.
4. **Security** — `npm audit` plus Snyk (dependency **and** container image scanning)
   check for known CVEs in dependencies and the built Docker image.
5. **Deploy** — `docker compose up` deploys the image to a staging container, then a
   `curl` against `/health` confirms the deployment succeeded.
6. **Release** — On the `main` branch, the image is re-tagged for production, a Git
   tag is cut, and the same compose file promotes it to a production container/port.
7. **Monitoring** — `/metrics` (Prometheus format) is polled to confirm it's
   scrape-able, and a health-check script fails the build (simulating an alert) if
   production stops responding — this is the hook point for a real Datadog/New Relic
   integration. Structured JSON logs (`src/utils/logger.js`) give you something
   concrete to show in the "monitoring and alerting" part of your demo video.

## Notes for the Security stage write-up

Once you actually run `npm audit` / Snyk against this project in your report, list
each finding with: what the issue is, its severity, and how you addressed it (e.g.
bumping a dependency version, or documenting why a finding is a false positive/low
risk and excluding it). A freshly scaffolded project like this should have few or no
findings initially — as you add dependencies for your own extensions, re-scan.
