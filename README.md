# InstaBix

InstaBix is a real-data creator partnership platform. This workspace contains three additive applications:

| Application | Path | Port | Purpose |
| --- | --- | --- | --- |
| Root Next.js platform | `.` | 3000 | Multi-tenant Postgres/Drizzle application: dashboard, creators, outreach, studio, revenue, settings, audit, integrations, public site, portal |
| FastAPI backend | `backend/` | 8000 | Scout, outreach drafts/classification, products, Whop adapter, revenue, settings |
| Next.js dashboard starter | `frontend/` | 3100 | Server-rendered operator dashboard that reads the FastAPI backend |

The three apps do not import from each other or from `reference/kit/`. `reference/` is a read-only design archive, is Git-ignored, and must never ship.

## Prerequisites

- Node.js `>=22` for the root app; `>=20.9.0` is sufficient for the frontend starter.
- Python with `venv` and `pip` for the backend.
- PostgreSQL 16 for the root app’s Drizzle schema. The backend defaults to local SQLite and can use Postgres through `DATABASE_URL`.
- Optional credentials only when their integration is actually being exercised: Meta/Instagram, Resend, Stripe, Anthropic, Whop.

## 1. Root app setup

From the repository root:

```powershell
npm install
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
# Fill required values in .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `next dev` | Development server |
| `build` | `node scripts/build.mjs` | Production build with forced `NODE_ENV=production` |
| `start` | `next start` | Production server |
| `typecheck` | `tsc --noEmit` | TypeScript check |
| `lint` | `eslint .` | ESLint check |
| `test` | `vitest run` | Unit tests |
| `verify` | typecheck + lint + test + build | Full root gate |
| `db:generate` | `drizzle-kit generate` | Generate migrations |
| `db:migrate` | `tsx scripts/migrate.ts` | Apply migrations |
| `db:seed` | `tsx scripts/seed.ts` | Seed local data |
| `db:reset` | `tsx scripts/reset.ts` | Reset local database |
| `e2e` | `playwright test` | Playwright suite, when configured |

## 2. Postgres, Drizzle, and RLS

- Root stack: Drizzle `0.45.4` with `pg`.
- Schema: 33 tables in `src/lib/db/schema.ts`.
- Migrations: `drizzle/0000` through `drizzle/0004`.
- `DATABASE_URL` is the application role and must not be a superuser in production.
- `DATABASE_URL_ADMIN` is for migration/seed ownership only.
- RLS verification script: `scripts/verify/rls.sql`.

Run the RLS verification against a disposable database:

```powershell
docker exec -i instabix-postgres psql -U instabix -d instabix -f - < scripts/verify/rls.sql
```

This script exists in the repository; no RLS isolation test was re-run in the session documented in `EVIDENCE.md`.

## 3. Backend setup, run, and tests

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Interactive API documentation is at `http://localhost:8000/docs`.

Verification:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m compileall -q app tests
```

Session results: final lead re-gate `70 passed, 1 warning in 3.49s` (earlier producer and judge runs: `3.15s` and `2.96s`); `compileall` produced no output. The warning is a Starlette deprecation notice about `httpx`/`TestClient`.

Backend surface:

| Endpoint family | Notes |
| --- | --- |
| `GET/POST /api/scout` | Qualify and list creators |
| `GET /api/outreach`, `POST /api/outreach`, `/classify`, `/{id}/approve` | Approval-gated drafts and classification |
| `GET/POST /api/products`, `/{id}/approve` | Products, TOC, server-derived split snapshot |
| `GET /api/whop`, `POST /api/whop/publish` | Adapter status and publishing |
| `GET /api/revenue`, `POST /api/revenue/sales`, refund route | Integer-cent sales and splits |
| `GET/PUT /api/settings` | Locked branding/niches/splits plus mutable settings |
| `GET /api/health` | Service health and Whop status without secrets |

## 4. Frontend setup, run, and tests

```powershell
cd frontend
npm install
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Open `http://localhost:3100`.

```powershell
cd frontend
npm run typecheck
npm run build
npm start
```

Session results: typecheck clean; Next.js 16.4.6 Turbopack build compiled successfully with `/` dynamic and `/_not-found` static.

The dashboard is a server-rendered page. It reads health, creators, outreach, products, Whop status, revenue, and settings. If health cannot be read it shows a backend-unreachable state and no figures. Individual endpoint failures are isolated to their cards.

## 5. Environment variable map

### Root (`.env.local`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Application Postgres connection; non-superuser in production |
| `DATABASE_URL_ADMIN` | Migration/seed connection |
| `APP_URL` | Public root app URL |
| `AUTH_SECRET` | Session signing secret |
| `TOKEN_ENCRYPTION_KEY` | Encryption key for provider tokens at rest |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_WEBHOOK_VERIFY_TOKEN`, `GRAPH_VERSION` | Instagram/Meta integration |
| `RESEND_API_KEY`, `OUTREACH_FROM`, `OUTREACH_REPLY_TO`, `OUTREACH_INBOX` | Email integration |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe test-mode integration |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | Product studio AI |
| `SENTRY_DSN`, `POSTHOG_KEY` | Optional observability |
| `SEED_EMAIL`, `SEED_PASSWORD` | Local seed only |

### Backend (`backend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Controls production safety rails |
| `APP_VERSION` | `0.1.0` | Reported by health endpoint |
| `DATABASE_URL` | `sqlite:///./instabix.db` | SQLite locally; Postgres URL in production |
| `API_KEY` | unset | Optional server-side key; every `/api` route except health then requires `X-API-Key` |
| `CORS_ORIGINS` | `http://localhost:3100,http://127.0.0.1:3100` | Allowed browser origins |
| `PUBLIC_APP_URL` | `http://localhost:3100` | Used for unsubscribe links |
| `WHOP_API_KEY` | unset | Live adapter key; required in production |
| `WHOP_ACCOUNT_ID` | unset | Optional account scope |
| `WHOP_API_BASE` | `https://api.whop.com/api/v1` | Live API base; use the sandbox base for sandbox testing |
| `WHOP_API_VERSION_DATE` | `2026-11-17-3` | Pinned API version date |
| `WHOP_TIMEOUT_SECONDS` | `20` | HTTP timeout |
| `WHOP_MOCK_MODE` | `auto` | `auto`, `true`, or `false`; never mock in production |

### Frontend (`frontend/.env.local`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL used by server-side fetches |
| `API_KEY` | unset | Server-only value sent as `X-API-Key`; never prefixed with `NEXT_PUBLIC_` |

## 6. Locked product rules

- Branding: `hybrid`.
- Niches: Sports, Home, Finance, Parenting, AI Tools for Small Business, Faith & Mindset.
- Split tuple order: `(creator, InstaBix)`.
- First product: `(0.60, 0.40)`.
- Later products: `(0.50, 0.50)`.
- Product ordinal is derived server-side and cannot be overridden by a client.
- Money is integer cents; splits are basis points.
- Whop production without `WHOP_API_KEY` is disabled and publish returns 503.
- The legacy design kit never ships; fake data is never used to fill a screen.

## 7. Full verification

```powershell
cd C:\Users\mican\Documents\InstaBix
npm run verify
```

This runs root typecheck, lint, Vitest tests, and the production build. Session result: clean typecheck, clean lint, `10 tests passed`, successful production build. The build wrapper exists because this shell exports `NODE_ENV=development`.

## 8. Known blockers

- No clean-clone CI run has been demonstrated.
- No real Meta/Instagram account test: credentials and registered test accounts required.
- No real Resend send/reply/unsubscribe test: credentials, verified domain, and real inbox required.
- No real Stripe test-mode purchase/refund/statement reconciliation: credentials required.
- No Whop sandbox publish: sandbox key required.
- No Playwright E2E, Lighthouse budgets, load test, backup/restore drill, security review, or App Review recording.
- Root surfaces compile and pass unit tests but were not runtime-reverified against populated real rows in the documented session.
- Git working tree was uncommitted on `main` with no remote at the time of documentation; it has since been committed as `9d74ad8` and pushed to `origin/main`.

## 9. Documentation index

- [AUDIT.md](AUDIT.md) — legacy mock artifacts, replacements, and no-mock audit.
- [PLAN.md](PLAN.md) — goal, milestone status, risks, verification strategy, bounded next steps.
- [DECISIONS.md](DECISIONS.md) — architecture and product decision log.
- [TRACEABILITY.md](TRACEABILITY.md) — screen/card to endpoint to schema matrix.
- [EVIDENCE.md](EVIDENCE.md) — commands, verdicts, docs-read report, residuals, gates, and loop notes.
