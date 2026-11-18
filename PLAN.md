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
| M3 — Discovery & scoring | **Partial** | Backend Agent 1 gates verified by unit tests; root provenance/score UI exists from prior work | Exercise one real permitted row end-to-end and confirm every displayed field traces to storage | No real-row end-to-end run in this session |
| M4 — Outreach | **Blocked** | Backend approval gate and reply classification verified by unit tests | Send one real approved draft, receive a reply, and verify unsubscribe suppression | `RESEND_API_KEY`, verified domain, and a real inbox not available |
| M5 — Product studio | **Partial / Blocked** | Backend Agent 3 TOC generation and validation verified | Generate a cited draft from permitted source data, measure word count, complete creator review and e-sign | AI credentials and real source data not available |
| M6 — Commerce & splits | **Partial / Blocked** | Backend split and ledger math verified; root ledger/scoring Vitest suite passed (`10 passed`); Stripe webhook/checkout code exists from prior work | Run a test-mode purchase, refund, and cent-matched creator statement; run Whop sandbox publish | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a Whop sandbox key not available |
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

## Verification strategy

1. **Static gates:** root `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`; frontend `npm run typecheck`, `npm run build`; backend pytest and `compileall`.
2. **Evidence gates:** exact commands and summaries are recorded in `EVIDENCE.md`.
3. **Honesty gates:** unused-backend-port smoke, client-secret bundle scan, rendered-number provenance review, forbidden-brand scan.
4. **Real-data gates:** only with registered accounts and test-mode credentials; capture handle/account, timestamp, request ID where available, and screenshots or recordings.
5. **Independent review:** separate judge verdicts are required for non-trivial atoms; residuals stay listed until closed.

## Bounded next steps

Already completed in this session: documentation package, frontend/backend independent judge passes, root regression fix and final verification, and the no-mock/brand audits. These are not open work items.

Next bounded units, in order:

1. Add a Playwright E2E smoke for the frontend against a seeded backend, covering unreachable, empty, populated, and partial-failure states.
2. Add the two-org Postgres/RLS isolation test and run it against a real database.
3. Obtain Meta credentials and registered professional accounts; run the M2 connect/sync/refresh/disconnect loop.
4. Obtain Resend and a real inbox; run the approval-to-reply-to-unsubscribe loop.
5. Obtain Stripe test-mode keys; run purchase, refund, ledger, and statement reconciliation.
6. Obtain a Whop sandbox key; run one official live-path publish with idempotency and no money movement.
7. Add Lighthouse/Playwright performance budgets and a clean-clone CI workflow.
8. Schedule backup/restore drill, load test, security review, and App Review recording before M8 is considered Done.
