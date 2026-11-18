# InstaBix — Mock Artifact Audit

**Date:** 2026-11-18  
**Scope:** shipped root Next.js app, `backend/`, `frontend/`, and the read-only design reference at `reference/kit/`.  
**Brand rule:** the product is InstaBix everywhere. The source design kit is referred to only as “the legacy kit” or `reference/kit/`.

## 1. Reference-kit handling

- The source kit was extracted read-only to `reference/kit/App.tsx` and `reference/kit/index.css`.
- It is not imported, bundled, or shipped by any application.
- `reference/` is ignored by Git; it is outside the build and lint graphs of the root app, `backend/`, and `frontend/`.
- The attached starter ZIP download was invalid: it was an HTML error page, not a ZIP. No usable starter came from it and no starter content was used.
- Static labels and legal/marketing copy are allowed. Invented names, metrics, emails, inbox threads, product drafts, schema snippets, and endpoint lists from the legacy kit are not allowed.

## 2. Artifact replacement matrix

| Legacy mock artifact | Where it appeared | What replaced it | Verified source |
| --- | --- | --- | --- |
| Invented creator array with handles, names, emails, follower/view/engagement/score values, reel titles, pillars, insights, and comment quotes | `reference/kit/App.tsx` | Real creator records returned by `GET /api/scout`; root `creatorAccounts`, `creatorSnapshots`, `media`, and `scores` tables | `backend/app/main.py`, `backend/app/models.py`, root `src/lib/db/schema.ts`, `src/lib/db/queries.ts` |
| Hard-coded dashboard statistics | Legacy dashboard cards | Counts derived from API responses: `/api/scout`, `/api/outreach`, `/api/revenue`; root `getDashboard()` aggregates from database rows | `frontend/app/page.tsx`, `backend/app/main.py`, root `src/lib/db/queries.ts` |
| Hard-coded niche banner and client-side filters | Legacy config strip | Locked server-side `NICHES` and `/api/settings`; no UI-owned source of truth | `backend/app/config.py`, `backend/app/main.py` |
| UI-displayed agent prompt text | Legacy “agents” panel | Server-side agents `agent1.py`–`agent4.py`; prompts are not product data | `backend/app/agents/` |
| Hard-coded outreach templates and fake example bodies | Legacy Outreach tab | Server-side `agent2.TEMPLATES`, `/api/outreach/templates`, approval-gated drafts stored in `emails`; no provider is configured in the backend starter | `backend/app/agents/agent2.py`, `backend/app/main.py`, `backend/app/models.py` |
| Fake classified inbox threads, reply quotes, and draft replies | Legacy Inbox panel | `GET/POST /api/outreach`, `/api/outreach/classify`, `/api/outreach/{id}/approve`; root `messages`, `replies`, `sequenceSteps`, `sequences` | `backend/app/main.py`, root `src/lib/db/schema.ts` |
| Hard-coded example product, table of contents, word count, price, and draft state | Legacy Product Studio | `agent3.build_toc()` / `validate_toc()`, `POST /api/products`, backend `products` table with `price_cents`, `target_words`, `toc`, and approval fields; root `products`, `chapters`, `drafts`, `citations`, `agreements` | `backend/app/agents/agent3.py`, `backend/app/main.py`, `backend/app/models.py`, root `src/lib/db/schema.ts` |
| Hard-coded schema and endpoint lists rendered as UI content | Legacy “Build Kit” view | Real 33-table Drizzle schema plus migrations `0000`–`0004`; real FastAPI routes documented at `/docs` | root `src/lib/db/schema.ts`, `drizzle/`, `backend/app/main.py` |
| `callRecords(...)` mock record-store calls for approvals and settings | Legacy client-side persistence shim | FastAPI endpoints with optional `X-API-Key`, backend `app_settings` table, root server actions/route handlers with org-scoped Drizzle queries | `backend/app/main.py`, `backend/app/security.py`, `root src/lib/actions/`, `src/lib/db/queries.ts` |
| Fake settings fallback/banner with local-only state | Legacy Outreach controls | `GET/PUT /api/settings`, locked branding and split rules, `outreach_paused`; frontend reads settings from the API | `backend/app/main.py`, `frontend/app/page.tsx` |
| Simulated Whop publishing/checkout presentation | Legacy Integrations/Studio actions | `WhopClient` adapter with explicit `mock`, `live`, and `disabled` modes; `GET /api/whop`, `POST /api/whop/publish`; no credentials in UI output | `backend/app/whop.py`, `backend/app/routers/whop.py`, `backend/app/config.py` |
| Static charts, avatars, badges, and literal metric labels | Throughout the legacy kit | API-derived cards plus explicit `empty`, `unavailable`, and `backend unreachable` states | `frontend/app/page.tsx`, `frontend/lib/api.ts` |

## 3. No-mock and coupling audit

The forbidden legacy brand pattern is deliberately not written in this document. The checks below used a shell variable holding that pattern.

| Check | Command / method | Result |
| --- | --- | --- |
| Forbidden brand in shipped root files | `rg -n -i "$FORBIDDEN_BRAND" src public scripts tests package.json next.config.ts tailwind.config.ts postcss.config.mjs playwright.config.ts drizzle.config.ts eslint.config.mjs tsconfig.json README.md` | No match |
| Forbidden brand in backend source | Case-insensitive recursive scan of `backend/app` and `backend/tests`, excluding `backend/.venv` | No match |
| Forbidden brand in built output | Case-insensitive scan of `.next` | No match |
| Forbidden brand in frontend source | Independent-judge scan of `frontend/`, excluding `node_modules` and `.next` | No match |
| Starter coupling | `reference/kit` import/coupling scan across shipped root, `backend/`, and `frontend/` | No imports or coupling; `frontend/package.json` depends only on Next, React, React DOM, and TypeScript tooling |
| Runtime honesty smoke | Frontend started against an unused port | `UNREACHABLE_STATE_PRESENT` and `NUMERIC_TEXT_ABSENT` |
| Client secret leakage | Independent-judge scan of nine client JS chunks | `API_KEY` absent from all client chunks; present only in server SSR chunks |
| Rendered number provenance | Independent-judge review of `frontend/app/page.tsx` | All rendered numbers derive from response fields; failed cards are structurally isolated |
| Git/ignore hygiene | `git check-ignore -v backend/.venv backend/instabix.db backend/__pycache__ reference/kit/App.tsx` | All four paths confirmed ignored |

## 4. Audit outcome

No shipped source or built output contains the forbidden legacy brand or the legacy kit’s mock data. The residual work is runtime evidence with real accounts, not removal of embedded mock artifacts. See `EVIDENCE.md` for exact verification commands, verdicts, and residuals.
