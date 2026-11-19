# InstaBix — Architecture and Product Decisions

**Date:** 2026-11-18  
**Status:** locked decisions from this session. Changes require a new dated entry and re-verification.

## D01 — Additive three-application architecture

- The audited root Next.js platform remains in place; it is not replaced.
- `backend/` is a distinct FastAPI service on port 8000.
- `frontend/` is a distinct Next.js dashboard starter on port 3100.
- No application imports from `reference/kit/`, and the three apps have no source-import coupling.
- The invalid ZIP download produced no starter content and is not a source for any decision or code.

## D02 — Official APIs only

- Use official provider APIs such as Instagram Business Discovery for permitted public professional-account data.
- Do not scrape, use unofficial endpoints, purchase contact lists, or infer private comments/emails.
- Where an API cannot supply a field, the UI says so and shows an honest empty or not-connected state.
- Comments, DMs, audience demographics, and another account’s private email are not assumed available.

## D03 — Consent-first discovery and outreach

- Creators enter through application, invite, or manual entry with a recorded `source`.
- Outreach requires a qualified or approved creator and a human approval gate.
- The backend starter records drafts and classifications but has no email provider configured; approval does not equal send.
- Suppression and unsubscribe are product requirements, not optional polish. The frontend never renders a fake sent or replied state.

## D04 — Locked branding and niches

- Branding is locked to `hybrid`.
- Locked niches are: Sports, Home, Finance, Parenting, AI Tools for Small Business, Faith & Mindset.
- Branding and niches are server-owned: `BRANDING`, `NICHES`, `/api/settings`. The frontend reads them from the API.
- `PUT /api/settings` rejects any branding value other than `hybrid`.
- The forbidden legacy brand does not appear in shipped source or built output; the source kit is called “the legacy kit” or `reference/kit/`.

## D05 — Split rules and server-derived product ordinal

- Tuple order is `(creator, InstaBix)`.
- `split_for(True) = (0.60, 0.40)` for the first product built with a creator.
- `split_for(False) = (0.50, 0.50)` for subsequent products.
- The product ordinal is derived server-side from stored products for that creator. A client-supplied ordinal is rejected when it disagrees.
- Split percentages are stored as basis points (`6000/4000` or `5000/5000`) so historical sales remain reproducible.

## D06 — Whop modes and fail-closed publishing

- `mock`: no key outside production; simulated IDs and URLs clearly flagged.
- `live`: `WHOP_API_KEY` present; official current v1 API calls to `POST /products` then `POST /variants`.
- `disabled`: production without a key, or explicit `WHOP_MOCK_MODE=false` without a key. Publish returns 503.
- Production never falls back to mock data.
- Default API base: `https://api.whop.com/api/v1`. For sandbox tests, point `WHOP_API_BASE` at the provider's sandbox v1 base (`https://sandbox-api.whop.com/api/v1`); that value is not the local default and has not been exercised here.
- Auth: `Authorization: Bearer <key>`; pinned `Api-Version-Date: 2026-11-17-3`; stable `Idempotency-Key` derived from the product slug.
- A Whop sandbox key is still required before the live path can be called safe to test.

## D07 — Money representation

- All money is integer cents. No floating-point currency values are stored or rendered as authoritative amounts.
- Split shares are basis points.
- Payout rounding uses half-up on the creator share; the remainder goes to InstaBix so creator plus platform equals net exactly.
- Refunds are bounded by gross cents and recompute the split snapshot.

## D08 — Frontend honesty

- The dashboard is an async Server Component with `dynamic = "force-dynamic"` and `connection()`.
- All seven GET requests are made server-side; each failure is a value, not a thrown page error.
- If `/api/health` is unreadable, the page renders “Backend unreachable” and no figures.
- Empty arrays render explicit empty states; partial failures render per-card “could not load” states.
- `NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000`.
- Optional `API_KEY` is sent as `X-API-Key` only from the server; it is never prefixed with `NEXT_PUBLIC_`.
- Whop status shows mode and readiness, never a secret.
- Split and branding values come from `/api/settings`, not from frontend constants.

## D09 — Root and backend data ownership

- Root app: Postgres via Drizzle 0.45.4 + `pg`, 33-table schema, migrations `0000`–`0004`, scrypt sessions, org-scoped queries, RLS verification script.
- Backend app: SQLAlchemy models for `creators`, `campaigns`, `products`, `emails`, `sales`, and `app_settings`; SQLite default for local development, Postgres via `DATABASE_URL`.
- The backend starter is additive and must not be treated as a replacement for the root tenancy model.
- No real-account integration test was run in this session; the existence of routes is not evidence of live integration.

## D10 — Build wrapper for this shell

- This workspace exports `NODE_ENV=development`, which makes a bare `next build` compile in the wrong mode.
- Root `scripts/build.mjs` and frontend `scripts/build.mjs` invoke the local Next CLI with `NODE_ENV=production`.
- `dev` and `start` behavior is unchanged.
- All verification commands use `npm run build`, not raw `next build`.

## D11 — Reference archive never ships

- `reference/kit/App.tsx` and `reference/kit/index.css` are read-only design references.
- `reference/` is Git-ignored and outside build/lint graphs.
- Fake creators, fake metrics, fake inbox threads, fake product drafts, fake prompt/schema/endpoint displays, and mock record-store calls are documented in `AUDIT.md` and replaced by real sources.
- Static design tokens may be studied; data-bearing content may not be copied.

## D12 — Stage 1 safety gates (2026-11-19)

- Outbound sending is blocked at the send-time gate by `orgs.settings.outreachPaused`, even for already-approved messages.
- Domain warmup is fail-closed: only an explicit owner/admin completion allows sends; there is no time-based auto-unlock and no UI for the toggle in Stage 1.
- The 50/day cap counts the workspace's `sent` messages since UTC midnight. The recipient-domain filter was removed after a judge found it made the cap a no-op.
- Stage 1 uses one verified sending domain (`OUTREACH_FROM` must match `EMAIL_FROM_DOMAIN`), so the cap is workspace-scoped. Multiple workspaces sharing that domain are capped independently; before multi-org production use, either provision one domain per org or replace the counter with an RLS-safe global one.
- `createProductAction` no longer accepts split basis points from form input; the ordinal and split are derived inside the org transaction.

## D13 — Stage 1 scoring contract (2026-11-19)

- Score factors are unit ratios: `engagement_rate`, `view_consistency`, and `unmonetized_score` are 0..1. A percentage-like engagement input greater than 1 is divided by 100 (5.5 -> 0.055); values above 100 clamp to 1.0.
- The former 6% full-marks cap was removed. Python and TypeScript now use the same normalization and produce the same 2dp total; shared fixture = 50.80.
- Hard qualification gates never consult the score. A failed gate cannot be turned into a pass by a high score.
- `BIO_SIGNALS` and `POST_SIGNALS` are the exact seven and three strings from the Stage 1 spec; tests assert them literally, not from the implementation arrays.

## D14 — Stage 1 product draft truthfulness (2026-11-19)

- `word_count` is a target; `actual_word_count` is recomputed from the generated section bodies. Validation fails closed when the real prose is outside 4,500–10,000 even if the target label says 4,500.
- With no writer adapter configured, an offline deterministic expander writes evidence-bound prose from supplied quotes, themes, creator phrases, and source ids. It is deliberately templated, not claimed to be LLM-quality creator voice; a `WriterAdapter` seam exists for configured providers.
- Google Doc, PDF, and plagiarism/AI checking remain blocked without real credentials and never report fake success. Creator approval and human concept pick remain mandatory; no quality-gate path auto-publishes.

## D15 — Stage 1 Integrator observability (2026-11-19)

- Every outbound Whop attempt is recorded in an injectable call-audit sink with method/path/ids/status only; keys, headers, payloads, and secrets are never recorded or logged.
- On terminal failure the client retries exactly once, then logs and emits a `failed_retry` human notification. Notification and launch-tracking adapters return `blocked` rather than fake delivery.
- Cover, PDF, community/Discord, and affiliate links are mapped only from documented response fields or explicitly blocked; no upload endpoint or URL is invented.
- The audit sink and notification events are process-local in Stage 1; durable storage, persisted affiliate links, and hot-reply/sale-made emitters are follow-up work.
- Root `publishProductAction` still only changes local product status. External Whop publishing remains the FastAPI Integrator's responsibility in this two-backend architecture; adding a second unverified TypeScript Whop client was rejected as scope creep for Stage 1.

## D16 — Stage 2 database schema interpretation (2026-11-19)

- The six-table schema in the Stage 2 block is implemented in the FastAPI backend, whose tables already use those names. The root app keeps its richer 33-table multi-tenant model; a compatibility matrix is documented in `TRACEABILITY.md`.
- The forbidden legacy operator-brand token in the pasted enum is replaced by `instabix_only`. Product-level branding accepts `hybrid` (default), `creator_only`, and `instabix_only`. The global `/api/settings` branding value remains locked to `hybrid`.
- `campaigns.creator_id` is a UNIQUE FK because the key-column list is more specific than the text ER diagram. This makes one active campaign per creator; the ER text is recorded as a conflict.
- Split columns `split_creator` / `split_operator` mirror the locked basis-point values as decimals (`6000/10000 = 0.60`, `4000/10000 = 0.40`; sum exactly 1.00). Basis points remain authoritative for money math; no floating-point value is used to compute payouts.
- Money columns named `amount`, `payout_creator`, and `payout_operator` are decimal mirrors of the authoritative integer-cent values. Integer cents remain the source of truth for all ledger arithmetic.
- Product status uses the spec vocabulary `idea / toc_approved / draft / creator_approved / live / rejected`; creator status uses the spec's title-case vocabulary. Root-app status vocabularies are unchanged and mapped in documentation.
- `settings` replaces `app_settings` in the backend and gains `id`, unique `key`, and JSON value (JSONB on Postgres, JSON on SQLite).
- New columns are added idempotently by an explicit backend migration runner; fresh databases receive full CHECK constraints from SQLAlchemy metadata.

## D17 — Stage 3 API contract interpretation (2026-11-19)

- `GET /health` is an API-key-exempt alias of `GET /api/health`; the canonical response is unchanged.
- `POST /api/scout/search` filters stored creators by niche and follower/view ranges using real DB rows only; it does not invent or rank synthetic data. It reuses the Stage 1 score model only to expose existing qualification fields.
- `GET /api/creators` is an alias of the Stage 2 creator list and adds a `niche` filter alongside `status`.
- `POST /api/creators/{id}/approve` maps "approved for outreach" to the existing Stage 2 status `Qualified` plus `qualified=True`. No new creator status value is added and the DB CHECK is not loosened. The legacy lowercase `approved` value remains only in a read-only guard set and is never written.
- `POST /api/outreach/send` creates a draft with status `draft_needs_approval` and step 1/2/3. It never sends. Human approval via `/api/outreach/{id}/approve` remains mandatory; no provider call is made from this endpoint.
- `POST /api/products/generate` is an alias of the locked product-creation path with TOC generation forced on. Branding stays `hybrid` and splits stay server-derived (6000/4000 for the first product, 5000/5000 after).
- `POST /api/whop/publish` accepts both integer product ids and external ids like `prod_1`. The request's `is_first_product` is accepted for contract compatibility but is never used for split math; the stored ordinal is authoritative and the response echoes the server-derived value.
- The publish response adds the Stage 3 flat keys (`product_id`, `whop_product_id`, `whop_url`, `split_creator`, `split_operator`, `bio_link`, `story_templates`, `launch_captions`, `status`) while retaining the existing nested audit keys so current clients and tests keep working. `story_templates` and `launch_captions` are string renderings of the stored structured assets; the structured versions remain in `assets` for disclosure/link auditing.
- Mock id and URL prefixes shown in the spec are illustrative. The real adapter's stored values are returned unchanged; no URL or id is fabricated.
- `GET /api/whop/products/{id}` resolves the external id to the local product, reads its stored Whop identifiers, and uses the adapter only in live mode. Mock mode returns an explicit `mode=mock` projection from stored rows.
- `POST /api/whop/webhook` is marked "(Next)" in the spec and is deferred. It will get signature verification, idempotency and a sale/payout ledger when implemented; the manual `/api/revenue/sales` path and `calc_payouts` remain the only current sale writers.
- `GET /api/revenue` adds `payouts_due_cents` (integer cents, authoritative) and a decimal `payouts_due` mirror from the same aggregate; no payout ledger is invented. `GET /api/settings` adds `email_domain` and `daily_cap` from backend config, matching the locked 50/day workspace cap.

## D18 — Reference starter structure (blocks 5–6) reconciliation (2026-11-19)

- The pasted reference-starter tree and FastAPI snippets are the excluded legacy reference, not a production patch. Their brand token, toy schemas (string UUID ids, float money, float splits), permissive defaults and `EMAIL_FROM_NAME`/`OPENAI_API_KEY`/`FRONTEND_URL`/`SPLIT_*`/`BRANDING_MODE` variables are deliberately not adopted. Splits and branding are locked server-side; integer cents and basis points stay authoritative.
- The reference `WHOP_COMPANY_ID` maps to the shipped `WHOP_ACCOUNT_ID`. The reference `alembic`/`python-dotenv` dependencies are unnecessary: the backend uses an idempotent in-app migration runner and pydantic-settings. Production requirement pins are newer than the reference and are not downgraded.
- The reference `backend/migrations/001_initial.sql` maps to the existing `backend/migrations/0001_stage2.sql`, which is already the full six-table Postgres DDL. A second initial DDL would duplicate the authoritative definition, so none was added.
- The reference splits routes across six router modules. The accepted production architecture keeps one registration point in `backend/app/main.py` (with `routers/whop.py` for the audit endpoint), which the Stage 2/3 judges verified. A literal router split is a no-op refactor and is deferred to a dedicated atom if requested; it is not required for endpoint correctness.
- The one genuinely missing artifact was an API client collection. It is added as `postman/Instabix.postman_collection.json`, `postman/Instabix.postman_environment.json` and `postman/README.md`, using InstaBix naming only, covering all 13 endpoints and carrying no credentials.

## D19 — Section 7 Whop reference reconciliation (2026-11-19)

- The pasted Section 7 code is the excluded legacy reference, not a patch. An independent read-only audit compared every item with the shipped adapter; no production code change was warranted. Each reference capability is already present, aliased to a stronger shipped implementation, or deliberately rejected by a prior locked decision.
- API base: the reference `https://api.whop.com/v5` conflicts with the locked Current API base `https://api.whop.com/api/v1` (`config.py:74`) and `Api-Version-Date` pin (`config.py:75`, `whop.py:323`). Official Whop docs confirm `/api/v1` is the Current API (sandbox `https://sandbox-api.whop.com/api/v1`) and `/api-reference/legacy/` is the Legacy API. The v5 path was not adopted.
- Credentials: module-level `API_KEY`/`COMPANY_ID` globals are rejected; shipped credentials are injected `Settings` values (`config.py:72-73`, `deps.py:24-25`), with reference `WHOP_COMPANY_ID` mapped to `WHOP_ACCOUNT_ID`.
- Split authority: the reference `split_for(client_bool)` survives only as a decimal mirror (`whop.py:66`). Authoritative basis points come from the stored product ordinal (`split_bps_for`, `whop.py:75`; `main.py:842-860,982-983`), and a disagreeing client ordinal is rejected. Client `is_first_product` stays non-authoritative.
- Money: the reference `price: float`, `int(price*100)` and float-rounded payouts are rejected. Shipped `calc_payouts(gross_cents, is_first_product, refunded_cents=0)` (`whop.py:80-115`) uses integer cents with Decimal half-up and remainder-to-platform; decimals are mirrors only.
- Live calls: the reference single `POST /products` with `company_id` and client `metadata.branding` is superseded by the official two-call product+variant flow (`whop.py:719-751`) using `account_id`, idempotency keys, one retry and audited failure notifications.
- Demo data / URLs: the `_demo_products` dict, dynamic product object and fabricated `https://whop.com/mock/...` URL are rejected. Publish resolves a real DB `Product` and blocks with 409 `publish_blocked` before any call; mock mode returns explicitly flagged simulated values and is never selected in production (disabled → 503).
- Branding: the reference description's operator-brand text and split percentages are rejected. Shipped description is TOC-derived only (`agent4.py:550-555`); branding is structured metadata `{"branding": "hybrid"}` and the operator-only branding value stays `instabix_only`. The forbidden brand token appears nowhere in the shipped tree.
- Story/caption counts: the reference 3 stories + 2 captions matches no shipped array and is a style difference, not a functional gap. Shipped stores and renders 4 story + 3 caption strings (`agent4.py:226-258,300-344`) plus 3 compact story specs and 3 caption variations. D17 already locked the flat keys as string renderings of structured assets with disclosure preserved; that contract is unchanged.
- Residual `(Next)` items (webhook 501, in-memory audit/notifications, sandbox verification) are deferred cuts, not reference features; none is needed to satisfy this comparison.

## Deliberately not done in this session

- No legacy kit code was imported, adapted into production, or shipped.
- No real Meta/Instagram, Resend, Stripe, or Whop account test was run.
- No Whop sandbox publish was attempted; no key was available.
- No Playwright E2E, Lighthouse, load test, backup/restore drill, security review, or App Review recording was performed.
- No clean-clone CI run was performed.
- No cross-tenant isolation test was re-run.
- Git commit and remote push were not part of the original verification session; they were completed afterward as root commit `9d74ad8` on `main`, pushed to `origin/main`.
