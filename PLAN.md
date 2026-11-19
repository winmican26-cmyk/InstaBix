# InstaBix — Delivery Plan and Milestone Status

**Date:** 2026-11-18  
**Policy:** a milestone is not marked Done without session evidence. No milestone below is marked Done.

## Goal

Operate InstaBix as a real-data creator partnership platform: consent-first discovery, human-approved outreach, server-built products, honest commerce reporting, and auditable splits. The shipped UI must never invent a name, metric, email, thread, or status.

## Architecture baseline

- Root Next.js platform remains intact and is the authoritative multi-tenant Postgres/Drizzle application.
- `backend/` is a separate FastAPI service on port 8000 with SQLite for local development and Postgres via `DATABASE_URL`.
- `frontend/` is a separate Next.js dashboard starter on port 3100 that reads the FastAPI service.
- These are additive apps. There is no source import coupling between them or with `reference/kit/`.

## Milestone register

| Milestone | Status | Evidence from this session | Next action | Blockers / gaps |
| --- | --- | --- | --- | --- |
| M0 — Foundation | **Partial** | Root `npm run verify` passed after config/build fixes; backend `70 passed` and `compileall` clean; frontend typecheck/build clean; dashboard has explicit unreachable/empty/partial-failure states | Add CI that runs the same gates from a clean clone | CI on a clean clone was not demonstrated |
| M1 — Tenancy & identity | **Partial** | 33-table Drizzle schema, invites, roles, sessions, audit events, and RLS verification script exist from prior work | Add and run an automated org-A/org-B isolation test across creators, products, orders, and messages | No cross-org isolation test was re-run in this session |
| M2 — Instagram connect & sync | **Blocked** | Instagram OAuth/sync/webhook routes and integrations surface exist from prior work | Run the registered professional-account connect, sync, refresh, and disconnect loop | `META_APP_ID`, `META_APP_SECRET`, and registered test accounts not available in this session |
| M3 — Discovery & scoring | **Partial (Stage 1 code accepted)** | Stage 1 Scout gates, exact weighted score, monetization signals, and qualified-only ranked output verified in 31 backend + 18 root tests; Python/TS parity fixture both 50.80 | Exercise one real permitted row end-to-end and confirm every displayed field traces to storage | No real-row end-to-end run; `main.py`/`schemas.py` do not yet forward optional score inputs; `rank_creators` has no API caller; `models.py` stores score as Integer |
| M4 — Outreach | **Partial / Blocked (Stage 1 code accepted)** | Kill switch, fail-closed warmup, 50/day cap, exact 3-email copy, domain/footer compliance, and all five reply actions verified in 13 policy + 11 classify + 40 backend tests | Send one real approved draft, receive a reply, and verify unsubscribe suppression | `RESEND_API_KEY`, verified domain, physical address, 14-day warmup completion, and a real inbox not available; cap is org-scoped; `no_response` needs an orchestration caller |
| M5 — Product studio | **Partial / Blocked (Stage 1 code accepted)** | Stage 1 research clustering, 3 evidence-quoted concepts with human pick, real 4,500/6,500/10,000-word drafts, fail-closed quality gate, and 4 gated API endpoints verified in 32 backend tests | Generate a cited draft from permitted real source data, complete creator review and e-sign | AI/writer, Google Doc, PDF, and plagiarism-checker credentials unavailable; offline prose is deterministic and templated |
| M6 — Commerce & splits | **Partial / Blocked (Stage 1 code accepted)** | Root split is server-derived only; backend split math, ordinal override rejection, production 503, per-call Whop audit, retry-once+notify, and blocked asset/link handling verified in 143 backend + 5 root split tests | Run a test-mode purchase, refund, and cent-matched creator statement; run Whop sandbox publish | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a Whop sandbox key not available; root publish path is not wired to the FastAPI Whop adapter; Whop audit sink is in-memory |
| M7 — Craft & performance | **Partial** | Frontend uses accessible semantics, explicit states, and a passing Next 16 build; root build passes | Add Playwright E2E, Lighthouse budget checks, and performance CI | No Lighthouse, Playwright, load, or performance CI evidence in this session |
| M8 — Launch hardening | **Blocked / Not demonstrated** | Legal pages exist from prior work | Demonstrate backup/restore, load test, security review, incident runbooks, and App Review recording | No backups/restore drill, load test, security review, or App Review recording in this session |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Real credentials absent | Integration paths remain unverified even though adapters and routes exist | Keep adapters behind explicit configuration; render connect/disabled states; do not substitute mock data in production |
| Tenant isolation inferred from schema rather than executed | Cross-tenant leak could ship unnoticed | Add automated two-org test against Postgres with RLS enabled before M1 Done |
| Product ordinal or split drift | Incorrect payouts and broken trust | Keep ordinal derivation and split math server-side; preserve tests for basis points and cent rounding |
| Shell `NODE_ENV=development` breaks production builds | False build failures or wrong build mode | Use `scripts/build.mjs` wrappers for root and frontend; keep the wrapper in verification commands |
| Nested app files break root lint/typecheck | Root verification regresses as apps grow | Keep `frontend/**`, `backend/**`, `.venv`, and generated outputs ignored at the root; re-run `npm run verify` after app changes |
| Degraded backend/database ambiguity | UI could imply healthy data when the database is unavailable | Frontend shows a degraded warning and withholds per-card fabrication; add a specific degraded-state test |
| Whop production misconfiguration | Publishing could silently fabricate links | Production without `WHOP_API_KEY` selects `disabled` and returns 503 for publish; test live path only with a sandbox key |

## Stage 1 acceptance (2026-11-19)

Five independently judged atoms were accepted after one or two rejection/fix cycles each:

| Atom | Final verdict | Core evidence |
| --- | --- | --- |
| STAGE1-SAFETY | ACCEPT | Kill switch and warmup block before claim/send; 50/day cap counts the right rows with a compiled-SQL regression test; root split bps are server-derived |
| STAGE1-SCOUT | ACCEPT | Exact 0.4/0.3/0.3 score, exact signals, hard gates independent of score, Python/TS parity 50.80 |
| STAGE1-EMAIL | ACCEPT | Exact 3-email copy, no links/attachments in Email 1, footer compliance, dedicated domain, all five reply actions in both languages |
| STAGE1-PRODUCT | ACCEPT | Real 4,500–10,000-word prose generated and measured, 3 evidence-quoted concepts, human pick, fail-closed quality gate |
| STAGE1-WHOP | ACCEPT | Creator approval gate, locked splits, 503 fail-closed, per-call audit, retry-once+notify, no fabricated links/assets |

Stage 1 combined gates on 2026-11-19: root `npm run verify` passed (52 Vitest tests + production build); backend pytest `143 passed`, `compileall` clean; frontend typecheck and production build clean; 208 tracked files scanned with no legacy-brand hit.

## Stage 2 database schema acceptance (2026-11-19)

The pasted six-table schema was implemented in the FastAPI backend with independent producer/judge atoms. D16 in `DECISIONS.md` records the interpretation rulings (campaign UNIQUE, `instabix_only`, basis points / integer cents authoritative, root schema unchanged).

| Atom | Final verdict | Core evidence |
| --- | --- | --- |
| STAGE2-SCHEMA | ACCEPT | Six tables with all required columns, JSONB variants, unique constraints and exact CHECK expressions; idempotent additive migration; 7 schema tests |
| STAGE2-APP | REQUEST-CHANGES then fixed | `details.reasons` restored, 0/3/7 claim corrected, `before_flush` workaround removed at source; re-judged in the final integration pass |
| STAGE2-TESTS | ACCEPT | Stage 2 vocabulary expectations plus 5 new end-to-end tests for campaigns, product mirrors, outreach reply state, settings lock and health |
| STAGE2-MIGRATION-FIX | ACCEPT | Three real Postgres upgrade bugs found and fixed: portable boolean defaults, legacy creator-status remapping, JSON scalar preservation |
| STAGE2-PUBLISH-FIX | ACCEPT | `details.reasons` contract restored, single publish route, direct `live` write, 503/retry/audit/idempotency preserved |

Stage 2 combined gates on 2026-11-19: backend `156 passed`, `compileall` clean; root `npm run verify` passed (`52 tests` + production build); frontend typecheck and production build clean; 213 tracked files plus 4 new files scanned with no legacy-brand hit; live `GET /api/health` returned `status=ok`, `database=ok`; fresh-Postgres and legacy-Postgres migration smokes both passed with idempotent double-runs.

Stage 2 residuals: `STEP_DELAY_DAYS` provides 0/3/7 dates but only day 0 is initialized — advancing `current_step` to 2/3 and recomputing `next_followup_at` is a separate atom. The 50/day cap, warmup, and real-provider credential gaps from Stage 1 remain unchanged. The root app still uses its own 33-table schema; no dual-write layer was added.

## Stage 3 API surface and publish contract acceptance (2026-11-19)

The pasted API endpoint table was implemented in the FastAPI backend with two independent producer/judge atoms. D17 in `DECISIONS.md` records the interpretation rulings (API-key-exempt health alias, creator approval mapped to `Qualified`, draft-only outreach send, client ordinal ignored, string-rendered assets, webhook deferred).

| Atom | Final verdict | Core evidence |
| --- | --- | --- |
| STAGE3-HELPERS | ACCEPT | Pure stored-row `search_creators`, disclosure-preserving string renderers, secret-free `get_product` with no fabricated URL/price, 50/day cap config; 10 deterministic tests |
| STAGE3-API | ACCEPT | All 13 spec routes present, exactly one publish route, exact flat publish contract with the client ordinal ignored, fail-closed 501 webhook, payouts and settings mirrors; 11 non-vacuous tests |

Stage 3 combined gates on 2026-11-19: backend `177 passed` (156 pre-existing + 11 API + 10 helper), `PYTEST_EXIT=0`, `compileall` clean (`COMPILEALL_EXIT=0`); root `npm run verify` passed (`52 tests` + production build); frontend typecheck and production build clean; brand audit zero hits across root files, backend (excluding `.venv`), `.next` and frontend; live `/health` and `/api/health` both returned `status=ok`, `database=ok`.

Stage 3 residuals: `POST /api/whop/webhook` is an explicit 501 `(Next)` stub — signature verification, idempotency and a sale/payout ledger remain a later cut; the live Whop adapter is still unverified without a sandbox key; the publish response's `is_first_product` is the server-derived value, never the client's; `email_domain` is `null` when unset; mock `get_product` intentionally exposes no URL.

## Verification strategy

1. **Static gates:** root `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`; frontend `npm run typecheck`, `npm run build`; backend pytest and `compileall`.
2. **Evidence gates:** exact commands and summaries are recorded in `EVIDENCE.md`.
3. **Honesty gates:** unused-backend-port smoke, client-secret bundle scan, rendered-number provenance review, forbidden-brand scan.
4. **Real-data gates:** only with registered accounts and test-mode credentials; capture handle/account, timestamp, request ID where available, and screenshots or recordings.
5. **Independent review:** separate judge verdicts are required for non-trivial atoms; residuals stay listed until closed.

## Bounded next steps

Already completed in this session: documentation package, frontend/backend independent judge passes, root regression fix and final verification, no-mock/brand audits, and the Stage 1–3 producer/judge cycles. These are not open work items.

Next bounded units, in order:

1. Add a Playwright E2E smoke for the frontend against a seeded backend, covering unreachable, empty, populated, and partial-failure states.
2. Add the two-org Postgres/RLS isolation test and run it against a real database.
3. Obtain Meta credentials and registered professional accounts; run the M2 connect/sync/refresh/disconnect loop.
4. Obtain Resend and a real inbox; run the approval-to-reply-to-unsubscribe loop.
5. Obtain Stripe test-mode keys; run purchase, refund, ledger, and statement reconciliation.
6. Obtain a Whop sandbox key; run one official live-path publish with idempotency and no money movement.
7. Add Lighthouse/Playwright performance budgets and a clean-clone CI workflow.
8. Schedule backup/restore drill, load test, security review, and App Review recording before M8 is considered Done.
