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
| Settings & locked rules | `GET /api/settings` | `app_settings` values plus server config `BRANDING`, `NICHES`, `_split_payload()` | `memberships`, `users`, `invites` via `getSettings()` — different root settings surface | Frontend judge confirmed no hard-coded split/branding; `PUT` rejects non-`hybrid` branding |

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
| `/api/settings` | `AppSetting` / `app_settings` plus server config | Locked branding/niches/splits; mutable sender/support/pause values |

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
