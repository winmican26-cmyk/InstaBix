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

## Deliberately not done in this session

- No legacy kit code was imported, adapted into production, or shipped.
- No real Meta/Instagram, Resend, Stripe, or Whop account test was run.
- No Whop sandbox publish was attempted; no key was available.
- No Playwright E2E, Lighthouse, load test, backup/restore drill, security review, or App Review recording was performed.
- No clean-clone CI run was performed.
- No cross-tenant isolation test was re-run.
- No Git commit or remote push was made; the working tree remains uncommitted on `main` with no remote.
