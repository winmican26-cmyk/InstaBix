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
| `META_DISCOVERY_TOKEN`, `META_DISCOVERY_IG_USER_ID` | Business Discovery enrichment; disabled, never simulated, until both are set |
| `META_SCOPES` | Optional override of the OAuth scopes requested from Meta |
| `RESEND_API_KEY`, `OUTREACH_FROM`, `OUTREACH_REPLY_TO`, `OUTREACH_INBOX` | Email integration |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe test-mode integration |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | Product studio AI |
| `GOOGLE_DOCS_CLIENT_ID`, `GOOGLE_DOCS_CLIENT_SECRET`, `GOOGLE_DOCS_REFRESH_TOKEN`, `PDF_SERVICE_API_KEY`, `PLAGIARISM_API_KEY`, `AI_DETECTION_API_KEY` | Reserved credential nodes; no adapter reads them yet, so a value alone enables nothing |
| `SENTRY_DSN`, `POSTHOG_KEY` | Optional observability |
| `SEED_EMAIL`, `SEED_PASSWORD` | Local seed only |

Credential nodes are prepared empty in `.env.example`, `.env.local` and `backend/.env` and will be filled when real values are supplied. `src/lib/env.ts` treats empty or whitespace-only optional values as unset, so a prepared file boots safely and cannot accidentally enable a provider. These local env files are gitignored; never commit real values.

### Backend (`backend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Controls production safety rails |
| `APP_VERSION` | `0.1.0` | Reported by health endpoint |
| `DATABASE_URL` | `sqlite:///./instabix.db` | SQLite locally; Postgres URL in production |
| `API_KEY` | unset | Optional server-side key; every `/api` route except health then requires `X-API-Key` |
| `EMAIL_FROM_DOMAIN` | unset | Verified sender domain exposed by `GET /api/settings` |
| `OUTREACH_DAILY_CAP` | `50` | Workspace-scoped daily outreach cap exposed by `GET /api/settings` |
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
- Outbound sending is blocked by workspace pause and fail-closed domain warmup; the 50/day cap counts this workspace's sent mail since UTC midnight.
- Scout uses the exact 0.4/0.3/0.3 weighted score; hard qualification gates are independent of the score.
- Email 1 is under 120 words, has no link, and asks for one `INTERESTED` reply; every send carries unsubscribe plus physical address.
- Product drafts are validated on actual body word count (4,500–10,000), not a target label.
- Whop publishing requires creator approval; every call is audited, failures retry once then notify a human.

## 7. Full verification

```powershell
cd C:\Users\mican\Documents\InstaBix
npm run verify
```

This runs root typecheck, lint, Vitest tests, and the production build. Stage 1 result on 2026-11-19: clean typecheck, clean lint, `52 tests passed`, successful production build. Backend additionally passed `143 tests` with `compileall` clean; frontend typecheck and production build were clean. The build wrapper exists because this shell exports `NODE_ENV=development`.

Required email configuration now includes `RESEND_API_KEY`, `OUTREACH_FROM`, `EMAIL_FROM_DOMAIN`, and `OUTREACH_PHYSICAL_ADDRESS`. Sending stays disabled until all four are set and domain warmup is explicitly completed.

## 7b. Stage 1 status

Stage 1 code is complete and independently accepted for Scout, approval/outreach safety, Product Architect, and the Whop Integrator. Live provider paths remain credential-blocked (Meta, Resend, Stripe, Whop sandbox, writer/plagiarism/Google Doc/PDF). Known engineering residuals are listed in `EVIDENCE.md` section 6 and `DECISIONS.md` D12–D15.

## 7c. Stage 2 database schema

The FastAPI backend now implements the six-table Stage 2 schema: `creators`, `campaigns`, `products`, `emails`, `sales`, `settings`. Required columns, uniqueness, relationships and CHECK constraints are in `backend/app/models.py`; the readable Postgres DDL is `backend/migrations/0001_stage2.sql`. `backend/app/migrate.py` upgrades an existing database additively and idempotently (no data deletion), backfilling the new decimal mirrors from the authoritative integer columns.

- Creator niche/status and product branding/status use the Stage 2 vocabularies. The operator-only branding value is `instabix_only`; the global `/api/settings` branding stays locked to `hybrid`.
- Basis points and integer cents remain the source of truth; `split_creator`/`split_operator` mirror `0.60/0.40` or `0.50/0.50` and always sum to `1.00`.
- `campaigns.creator_id` is unique (one campaign per creator); duplicate creation returns a clear 409.
- Outreach emails carry `step` 1-3 plus `opened`/`replied`; sales carry decimal payout mirrors, `whop_order_id` and `sold_at`.
- Product publish writes status `live` at the source in `backend/app/agents/agent4.py`; there is no session-level status rewrite.

Gates on 2026-11-19: backend `156 passed` with clean `compileall`; root `npm run verify` passed (`52 tests` + production build); frontend typecheck and production build clean; fresh and legacy Postgres migration smokes passed; live health check returned `database=ok`. See `EVIDENCE.md` section 7 and `DECISIONS.md` D16.

## 7d. Stage 3 API surface and Whop publish contract

All 13 endpoints from the Stage 3 cut are implemented on the FastAPI backend at `http://localhost:8000`: the API-key-exempt `GET /health` alias, creator search/list/approval, outreach send/classify, product generate/approve, Whop publish/get, the `(Next)` webhook stub, revenue and settings. Exact route-to-code mapping is in `TRACEABILITY.md` section 7.

The `POST /api/whop/publish` request accepts `{"product_id": "prod_1", "is_first_product": true}` (integer ids also work). The client's `is_first_product` is accepted for contract compatibility but is **never** used for split math: the stored ordinal wins, so the response reports the server-derived split and `is_first_product`. The flat response keys are `product_id`, `whop_product_id`, `whop_url`, `split_creator`, `split_operator`, `bio_link`, `story_templates` (strings), `launch_captions` (strings) and `status="live"`; every pre-existing nested audit key is retained. Disclosure text is preserved in the rendered arrays. `GET /api/whop/products/{id}` returns real adapter data in live mode and an explicit `mode=mock` projection with no fabricated URL in mock mode. `POST /api/whop/webhook` is an intentional 501 `webhook_next_cut` stub; `/api/revenue/sales` remains the only current sale writer.

Gates on 2026-11-19: backend `177 passed` with clean `compileall`; root `npm run verify` passed (`52 tests` + production build); frontend typecheck and production build clean; brand audit zero hits; live `/health` and `/api/health` both returned `status=ok`, `database=ok`. Two independent judge verdicts: STAGE3-HELPERS **ACCEPT**, STAGE3-API **ACCEPT**. See `EVIDENCE.md` section 8 and `DECISIONS.md` D17.

## 7e. Section 7 Whop reference reconciliation

The pasted Section 7 snippets are legacy reference, not a patch. An independent read-only audit found no genuine functional gap: every item is already present, aliased to a stronger shipped implementation, or deliberately rejected by a locked decision. No production code changed.

Official Whop docs confirm the Current API base is `https://api.whop.com/api/v1` (sandbox `https://sandbox-api.whop.com/api/v1`) with `Authorization: Bearer` and a dated `Api-Version-Date` pin. The pasted `/v5` path, client-trusted splits, float money, demo products, operator-brand text and fabricated mock URLs were not adopted. The reference 3 stories + 2 captions is a style difference; shipped keeps 4 story + 3 caption strings plus 3 compact specs and 3 caption variations, with disclosure preserved (D17). See `DECISIONS.md` D19, `EVIDENCE.md` section 11 and `TRACEABILITY.md` section 8.

## 8. Known blockers

- No clean-clone CI run has been demonstrated.
- No real Meta/Instagram account test: credentials and registered test accounts required.
- No real Resend send/reply/unsubscribe test: credentials, verified domain, and real inbox required.
- No real Stripe test-mode purchase/refund/statement reconciliation: credentials required.
- No Whop sandbox publish: sandbox key required; live `get_product` was exercised only with a monkeypatched transport.
- `POST /api/whop/webhook` is a 501 `(Next)` stub: signature verification, idempotency and a sale/payout ledger remain a later cut.
- `email_domain` is `null` until `EMAIL_FROM_DOMAIN` is configured; no outreach send path is enabled in this build.
- No Playwright E2E, Lighthouse budgets, load test, backup/restore drill, security review, or App Review recording.
- Root surfaces compile and pass unit tests but were not runtime-reverified against populated real rows in the documented session.
- Stage 1 was pushed as `43d75e9`; Stage 2 was pushed as `03a8512`; Stage 3 was committed and pushed on 2026-11-19 (see git log and `EVIDENCE.md` section 8 for the exact hash and gates).

## 9. Documentation index

- [AUDIT.md](AUDIT.md) — legacy mock artifacts, replacements, and no-mock audit.
- [PLAN.md](PLAN.md) — goal, milestone status, risks, verification strategy, bounded next steps.
- [DECISIONS.md](DECISIONS.md) — architecture and product decision log.
- [TRACEABILITY.md](TRACEABILITY.md) — screen/card to endpoint to schema matrix.
- [EVIDENCE.md](EVIDENCE.md) — commands, verdicts, docs-read report, residuals, gates, and loop notes.
