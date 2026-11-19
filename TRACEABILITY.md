# InstaBix — Screen-to-Source Traceability

**Date:** 2026-11-18  
**Rule:** every name, number, and status shown in the product must resolve to a database row, a real API response, or explicitly static copy. This matrix records where each surface obtains its data.

## 1. Frontend dashboard cards (`frontend/`, port 3100)

The page is an async Server Component (`frontend/app/page.tsx`) with `dynamic = "force-dynamic"` and `connection()`. Requests are made through the server-only client in `frontend/lib/api.ts`.

| Screen / card | Endpoint | Backend table / field or source | Root schema equivalent | Evidence |
| --- | --- | --- | --- | --- |
| Backend health | `GET /api/health` | No table; `SELECT 1`, with response fields `status`, `version`, `env`, `branding`, `database`, `whop.status()`, `api_key_required` | Root `src/app/api/health/route.ts` exists but was not runtime-tested this session | Frontend typecheck/build passed; unused-port smoke showed unreachable state with no numbers |
| Creator pipeline | `GET /api/scout` | `creators.count`, `qualified`, `status`, `niche`, `name`, `handle`, `created_at` | `creatorAccounts`, `creatorSnapshots`, `scores` via `getDashboard()` / `listCreators()` | Backend unit tests passed; judge confirmed rendered numbers derive from response fields |
| Outreach queue | `GET /api/outreach` | `emails.count`, `status`, `approved`, `subject`, `creator_name` | `messages`, `sequences`, `sequenceSteps`, `creatorAccounts` via `getOutreach()` | Backend approval/classify tests passed; frontend structural per-card failure states confirmed |
| Products | `GET /api/products` | `products.title`, `status`, `slug`, `split.creator_share`, `split.platform_share` | `products`, `chapters`, `drafts`, `creatorAccounts` via `listProducts()` / `getProductDetail()` | Backend product/TOC and split tests passed; frontend build passed |
| Revenue | `GET /api/revenue` | `sales` aggregates: `sales_count`, `gross_cents`, `refunded_cents`, `net_cents`, `creator_cents`, `instabix_cents`; recent items | `ledgerEntries`, `orders`, `statements`, `creatorAccounts` via `getRevenue()` | Backend payout/refund tests passed; root Vitest `10 passed` |
| Whop status | `GET /api/whop` | `WhopClient.status()` fields `mode`, `configured`, `mock`, `publish_ready`, `account_id`, `api_base`, `api_version_date`, `note`, plus route-added `branding` and `publish_endpoint`; no credentials are rendered | `integrations` via `getIntegrations()`; not runtime-tested this session | Backend Whop tests passed; no live publish performed |
| Settings & locked rules | `GET /api/settings` | `settings.key/value` plus server config `BRANDING`, `NICHES`, `_split_payload()` | `memberships`, `users`, `invites` via `getSettings()` - different root settings surface | Frontend judge confirmed no hard-coded split/branding; `PUT` rejects non-`hybrid` branding |

## 2. Root application surfaces (`src/`, port 3000)

These routes exist from prior work and are included in the passing root typecheck, lint, Vitest, and production build. They were **not re-verified at runtime against real rows in this session**.

| Screen / route | Query or handler | Drizzle source | Evidence | Runtime status this session |
| --- | --- | --- | --- | --- |
| Dashboard `src/app/(app)/dashboard/page.tsx` | `getDashboard(orgId)` | `creatorAccounts`, `messages`, `products`, `ledgerEntries`, `integrations`, `auditEvents`, `users` | Root `npm run verify` passed; query source read | Not runtime-reverified |
| Creators list `src/app/(app)/creators/page.tsx` | `listCreators(orgId, filters)` | `creatorAccounts`, latest `creatorSnapshots.followers/captured_at`, latest `scores.total/sampleSize/computedAt` | Query source read; build passed | Not runtime-reverified |
| Creator detail `src/app/(app)/creators/[id]/page.tsx` | `getCreatorDetail(orgId, creatorId)` | `creatorAccounts`, `creatorSnapshots`, `scores`, `media`, `products`, `messages`, `agreements`, `campaigns` | Query source read; build passed | Not runtime-reverified |
| Outreach `src/app/(app)/outreach/page.tsx` | `getOutreach(orgId)` | `sequences`, `sequenceSteps`, `messages`, `creatorAccounts.consentStatus/username/displayName` | Query source read; build passed | Not runtime-reverified |
| Studio `src/app/(app)/studio/page.tsx` and `[id]` | `listProducts()`, `getProductDetail()` | `products`, `creatorAccounts`, `chapters`, `drafts`, `agreements`, `orders` | Query source read; build passed | Not runtime-reverified |
| Revenue `src/app/(app)/revenue/page.tsx` | `getRevenue(orgId)` | `ledgerEntries`, `orders`, `statements`, `creatorAccounts`; totals from `account`/`direction`/`amount_cents` | Query source read; root ledger tests passed | Not runtime-reverified |
| Settings `src/app/(app)/settings/page.tsx` | `getSettings(orgId)` | `memberships`, `users`, `invites` | Query source read; build passed | Not runtime-reverified |
| Audit `src/app/(app)/audit/page.tsx` | `getAudit(orgId, limit)` | `auditEvents`, `users` | Query source read; build passed | Not runtime-reverified |
| Integrations `src/app/(app)/integrations/page.tsx` | `getIntegrations(orgId)` | `integrations` | Query source read; build passed | Not runtime-reverified |
| Storefront `src/app/p/[id]/page.tsx` | Direct org-scoped Drizzle reads | `products`, `chapters`, `creatorAccounts`, `orgs` | Route source read; build passed | Not runtime-reverified |
| Creator portal `src/app/c/[token]/...` | Portal token/server actions | `portalTokens`, `creatorAccounts`, `products`, `agreements`, `consents` | Schema/actions source read; build passed | Not runtime-reverified |

## 3. Backend ownership boundary

| Backend endpoint family | Backend model | Notes |
| --- | --- | --- |
| `/api/scout` | `Creator` / `creators` | Qualification result stored in `qualification`; ordinal/source retained |
| `/api/outreach` | `Email`, `Campaign` / `emails`, `campaigns` | Approval gate recorded; no email provider configured in this starter |
| `/api/products` | `Product` / `products` | `price_cents`, `is_first_product`, `split_creator_bps`, `split_platform_bps`, `toc`, approval fields |
| `/api/whop`, `POST /api/whop/publish` | `WhopClient` + `products.whop_product_id`, `whop_plan_id`, `bio_link` | Mock/live/disabled modes; official v1 API only in live mode |
| `/api/revenue` | `Sale` / `sales` | Integer cents and basis-point snapshot; no floating-point money |
| `/api/settings` | `Setting` / `settings` plus server config | Locked branding/niches/splits; mutable sender/support/pause values; legacy `app_settings` was migrated, not deleted |

## 4. Traceability gaps

- No real Meta/Instagram row was synced in this session; M2 remains Blocked.
- No real Resend send/reply/unsubscribe loop was executed; M4 remains Blocked.
- No real Stripe purchase/refund or Whop sandbox publish was executed; M6 remains Partial/Blocked.
- Root surfaces were compile-checked and source-read but not runtime-reverified against populated real rows.
- The backend degraded-health case (service answers, database unavailable) still shows a warning plus any successfully returned data; it was reviewed structurally but not executed as an independent runtime test.

## 5. Stage 1 atom traceability (2026-11-19)

| Stage 1 behavior | Implementation | Evidence |
| --- | --- | --- |
| Kill switch, warmup, 50/day cap at send time | `src/lib/actions/outreach.ts`, `src/lib/outreach-policy.ts` | 13 Vitest tests including compiled-SQL regression; audit actions `message.send_blocked_paused` / `_warmup` / `_cap` |
| Locked split derivation in root create path | `src/lib/actions/studio.ts`, `src/lib/splits.ts` | 5 Vitest tests; ordinal and split audited server-side only |
| Scout scoring and qualified-only ranking | `backend/app/agents/agent1.py`, `src/lib/scoring.ts`, `src/lib/constants.ts` | 31 backend + 18 root tests; Python/TS parity 50.80; `SCORE_MODEL_VERSION=ibx-score-v2` |
| Exact 3-email sequence + reply actions | `backend/app/agents/agent2.py`, `scripts/seed.ts`, `src/lib/email/classify.ts` | 40 backend + 11 root tests; Email 1 rendered 53 words, no URL |
| Compliance footer + dedicated domain | `src/lib/email/resend.ts`, `src/lib/env.ts`, `.env.example` | 4-var fail-closed config; exact domain match; unsubscribe + address in text/html |
| Product research, 3 concepts, real draft, quality gate | `backend/app/agents/agent3.py`, `backend/app/main.py` | 32 backend tests; generated bodies measured at 4500/6500/10000 words; 4 gated endpoints |
| Whop audit, retry, approval, blocked assets | `backend/app/whop.py`, `backend/app/routers/whop.py`, `backend/app/agents/agent4.py` | 27 backend tests; `GET /api/whop/audit`; no secrets in audit; no fabricated links |

Stage 1 residuals that affect live traceability: `/api/scout` does not forward the optional scoring inputs or expose `rank_creators`; the Whop audit sink and affiliate link are not persisted; `no_response` is not yet set by a sequence orchestrator; root `publishProductAction` only changes local status. See `EVIDENCE.md` section 6.

## 6. Stage 2 six-table schema (2026-11-19)

The Stage 2 schema is authoritative in the FastAPI backend. `src/lib/db/schema.ts` is intentionally unchanged (D16); the root app keeps its 33-table multi-tenant model.

| Spec table | Backend model / table | Stage 2 fields added or aligned | Root equivalent (not changed) |
| --- | --- | --- | --- |
| `creators` | `Creator` / `creators` | globally unique `handle`; `engagement_rate`, `monetization_score`, `top_reels`, `content_pillars`; 6-value `niche` CHECK; 7-value title-case `status` CHECK | `creatorAccounts` + `creatorSnapshots` + `scores` + `media` |
| `campaigns` | `Campaign` / `campaigns` | unique `creator_id` FK, `sequence_status`, `reply_classification`, `current_step` (1-3), `next_followup_at` | `campaigns` (nullable non-unique `creatorId`) + `sequences` + `sequenceSteps` |
| `products` | `Product` / `products` | `word_count`, `branding`, `whop_url`, `content_md`, decimal `price` / `split_creator` / `split_operator` mirrors, 6-value `status` CHECK | `products` + `chapters` + `drafts` (basis points remain authoritative in both) |
| `emails` | `Email` / `emails` | `step` (1-3 CHECK), `opened`, `replied` | `messages` + `sequenceSteps` |
| `sales` | `Sale` / `sales` | decimal `amount` / `payout_creator` / `payout_operator` mirrors, `whop_order_id`, `sold_at` | `orders` + `refunds` + `ledgerEntries` + `statements` |
| `settings` | `Setting` / `settings` | `id`, unique `key`, JSONB value; legacy `app_settings` copied forward and left intact | `featureFlags` + `rateLimits` + `orgs.settings` |

Authoritative vs mirror columns: basis points (`split_creator_bps` = 6000/5000, `split_platform_bps` = 4000/5000) and integer cents (`price_cents`, `gross_cents`, `creator_cents`, `platform_cents`) drive all arithmetic. The Stage 2 decimal columns are persisted mirrors with CHECK constraints (`= 10000` bps, `= 1.00` decimals). The operator-only branding value is `instabix_only`; the global `/api/settings` branding value stays locked to `hybrid`.

Migration evidence: `backend/app/migrate.py` is additive and idempotent; `backend/migrations/0001_stage2.sql` is the readable Postgres target DDL. Both fresh and legacy-upgrade paths were executed against a real Postgres instance on 2026-11-19 (see `EVIDENCE.md` section 7).

## 7. Stage 3 API endpoint surface (2026-11-19)

All routes below are in `backend/app/main.py`; the base URL is `http://localhost:8000`. D17 in `DECISIONS.md` records the interpretation rulings. `git` verified exactly one `POST /api/whop/publish` route.

| Spec endpoint | Route (file:line) | Request / helper | Contract notes |
| --- | --- | --- | --- |
| `GET /health` | `main.py:387` on `app` | no body | API-key-exempt alias of `main.py:370` `/api/health`; identical body |
| `POST /api/scout/search` | `main.py:526` | `schemas.py:164` `ScoutSearchRequest`; `agent1.search_creators` (`agent1.py:395`) | Filters stored `Creator` rows only; case-insensitive locked niche; inclusive follower/view bounds; no fabrication or ranking |
| `GET /api/creators` | `main.py:406` | query `status`, `niche` | Alias of the Stage 2 creator list with the added niche filter |
| `POST /api/creators/{id}/approve` | `main.py:421` | `schemas.py:124` `ApprovalRequest` | Writes `status="Qualified"` + `qualified=True`; lowercase `"approved"` only in a read-only guard set; idempotent, 404 when missing |
| `POST /api/outreach/send` | `main.py:692` | `schemas.py:226` `OutreachSendRequest` | Creates `status="draft_needs_approval"`, step 1/2/3, `approved=False`, `sent_at=None`, `delivery.status="not_sent"`; no provider call |
| `POST /api/outreach/classify` | `main.py:740` | `schemas.py:153` `ClassifyRequest` | Existing Stage 2 classifier; labels `POSITIVE`/`SOFT_POSITIVE`/`NEGATIVE` |
| `POST /api/products/generate` | `main.py:908` | `schemas.py:87` `ProductCreate` | Delegates to `create_product` with `generate_toc=True`, `branding="hybrid"`, client ordinal cleared; splits server-derived |
| `POST /api/products/{id}/approve` | `main.py:931` | `ApprovalRequest` | Existing Stage 2 gate; sets `creator_approved`, required before publish |
| `POST /api/whop/publish` | `main.py:953` | `schemas.py:130` `PublishRequest` | Accepts int or `"prod_1"`; client `is_first_product` never used for splits; adds nine flat keys and keeps all nested audit keys |
| `GET /api/whop/products/{id}` | `main.py:1034` | `whop.py` `WhopClient.get_product` | 404 missing, 409 `not_published`; mock mode returns `id/mode/mock/note` with no fabricated URL |
| `POST /api/whop/webhook` | `main.py:1060` | no body | Explicit 501 `(Next)` stub, code `webhook_next_cut`; creates no sale row |
| `GET /api/revenue` | `main.py:1079` | no body | Adds integer-cent `payouts_due_cents` plus decimal `payouts_due` mirror from `sum(Sale.creator_cents)` |
| `GET /api/settings` | `main.py:1189` | `config.py:67-70` | Adds `email_domain` and `daily_cap` (50/day); branding stays locked to `hybrid` |

Publish response flat keys and sources (`main.py:953-1023`): `product_id` from `_external_product_id`; `whop_product_id`/`whop_url` from the adapter result stored on the product; `split_creator`/`split_operator` decimal mirrors of `split_creator_bps` via `_split_mirrors`; `bio_link` from `assets`; `story_templates`/`launch_captions` as string renderings of structured assets via `agent4.render_story_templates` / `render_launch_captions` (`agent4.py:379`), preserving disclosure; `status="live"`. Structured assets remain in the nested `assets` key for link/disclosure auditing. Evidence: `EVIDENCE.md` section 8; `DECISIONS.md` D17.

## 8. Section 7 Whop reference reconciliation (2026-11-19)

The pasted Section 7 code is legacy reference, not a production patch. D19 in `DECISIONS.md` records the verdict and `EVIDENCE.md` section 11 the evidence. No code changed.

| Reference symbol | Shipped counterpart |
| --- | --- |
| `WHOP_BASE = ".../v5"` | `config.py:74` `whop_api_base` = `https://api.whop.com/api/v1`; `Api-Version-Date` at `whop.py:323` |
| `API_KEY`, `COMPANY_ID` globals | `Settings.whop_api_key` / `whop_account_id` injected at `whop.py:273-284` via `deps.py:24-25` |
| `split_for(client_bool)` as authority | Decimal mirror `whop.py:66`; authority `split_bps_for` `whop.py:75` + stored ordinal `main.py:842-860,982-983` |
| `create_whop_product` float/mock | `WhopClient.publish_product` `whop.py:653-774`; official two-call flow `whop.py:719-751`; disabled → 503 `whop.py:304-311` |
| `calc_payouts(amount: float, ...)` | `calc_payouts(gross_cents: int, ...)` `whop.py:80-115` |
| `_demo_products` + fabricated GET URL | Real DB `Product` + 409 gate `main.py:953-980`; mock projection without URL `whop.py:542-552` |
| 3 stories + 2 captions | 4 story + 3 caption strings; 3 specs + 3 variations (`agent4.py:226-363`) |
