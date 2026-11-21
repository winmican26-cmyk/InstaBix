# VistaBix → Production: paste-ready build brief

You are the founding engineer, product designer and systems architect for **VistaBix** (workspace: `C:\Users\mican\Documents\VistaBix`). Your job is to turn a single-file React prototype into a **production, Meta-family-grade creator partnership platform** — the standard of craft, speed, trust and polish that Instagram, WhatsApp and Messenger users expect — and to run it against **real registered accounts**, not mock-ups.

Treat this as a career-defining rebuild. No demo theatre: every pixel, query and button must survive contact with a real user and a real API.

---

## 1. Ground truth: what exists and what dies

The only existing source is a legacy dashboard kit archive (contains `App.tsx`, `index.css`). Extract it to `./reference/kit` as **read-only design reference**. Do not import from it, do not extend it, do not ship it.

**Hard delete list — none of this may survive into the product:**
- The `CREATORS` array and every invented handle, follower count, view count, engagement rate, score, email and comment quote.
- `NICHES`, `TOC`, `TEMPLATES`, `PROMPTS`, `SCHEMA`, `ENDPOINTS` as UI content (agent prompts may survive as real, versioned server-side prompt templates; the rest is documentation, not product).
- Hardcoded dashboard stats (`512 scanned`, `58 qualified`, `48% open rate`, `9.2% reply rate`, `$12,480`).
- The fake inbox threads and draft replies, the "Busy Mom" example product, the fake `7,850 words`, the fake approval/settings fallback banner and the `records.*` client calls.
- Every hardcoded chart, avatar, badge and number in JSX.

**Naming:** the product is **VistaBix** everywhere — UI, page titles, emails, legal copy, package name, repo, database name, env prefixes, job names, error messages. No legacy product name may appear anywhere in the shipped product; documentation refers to it only as the legacy kit. Build the wordmark and app icon around VistaBix, keeping the near-black/lime/violet identity.

**The rule that governs the whole build:** if a name, number, email, avatar, chart point or status badge is not produced at render time by a database row or a live API response, it does not ship. Use honest empty states, skeletons and "not connected" states instead. Static content (labels, marketing copy, legal text) is fine; **fake data is not**.

Seeded rows created by the real application are allowed. Fixtures are allowed only inside `test/` behind `NODE_ENV=test`. The shipped UI must never read a fixture.

---

## 2. Product thesis (corrected before you write code)

The prototype assumes you can discover creators by niche, scrape their median views, read their comments and pull a public business email. **Meta's platform does not permit that.** Design around reality:

- **Public metrics** (followers, media count, recent posts, captions, like/comment counts) are available only through official APIs such as Instagram Business Discovery, and only for public professional accounts queried by an authorized professional account.
- **Comments, emails, DMs and audience demographics of other accounts are not obtainable.** Hashtag search has been restricted/deprecated — verify current availability and never design the product around it.
- **Scraping, unofficial endpoints and purchased email lists are prohibited.** One takedown or one spam complaint destroys the business.

So the funnel inverts: **inbound-first, consent-based discovery.**

1. **Creator portal** — a creator applies (or is invited by link), authenticates with Instagram, grants scopes, and consents to partnership terms and email contact. This is how you get verified data, a real email and permission.
2. **Operator workspace** — you add creators you already know or who applied; the system enriches public metrics via official APIs and records the source of every field.
3. **Outreach** — only to consented or publicly published business contacts, with human approval, caps, suppression and one-click unsubscribe.
4. **Product + revenue** — build the product from data you are allowed to use, split revenue through a real payments provider, and keep an auditable ledger.

If an API cannot do something, say so in the UI and in `DECISIONS.md`, then ship the honest alternative. Never simulate it.

---

## 3. Surfaces and users

- **Operator console** (desktop-first, keyboard-complete): dashboard, discovery, creator profile, outreach, product studio, revenue, integrations, settings, audit log.
- **Creator portal** (mobile-first installable PWA): invite/apply, Instagram connect, approvals, product review, earnings and statements, payout onboarding.
- **Public site**: positioning, how it works, creator application, trust/legal pages.
- **Admin**: orgs, feature flags, integration health, job queue, impersonation with audit trail.

Multi-tenant from day one: `org_id` on every row, Postgres row-level security, roles (`owner`, `operator`, `reviewer`, `creator`), invitations, audit events. Retrofitting tenancy later is the classic rewrite.

---

## 4. Stack (opinionated, boring, shippable)

- Next.js (App Router) + TypeScript strict, React Server Components for reads, server actions/route handlers for writes.
- Tailwind + your own primitives built on Radix: no template dashboard look.
- Postgres 16 + Drizzle ORM, migrations committed, row-level security, `pg_trgm` for search.
- Auth.js or Clerk; org-scoped sessions; encrypted token vault (KMS/age) for provider tokens.
- Background jobs: Inngest or Trigger.dev (sync, scoring, sequences, generation); Upstash Redis for rate limits and locks.
- Email: Resend with a verified domain (SPF/DKIM/DMARC), inbound parsing, `List-Unsubscribe` one-click.
- Payments: Stripe Connect Express (destination charges, application fee, KYC, refunds, tax). Whop only as an optional distribution channel behind an adapter.
- AI: OpenAI or Anthropic with **structured outputs validated by zod**, prompt registry with versions, cost/latency caps, evals, human approval gates.
- Files: S3/R2 for PDFs/EPUB; signed URLs.
- Observability: Sentry, PostHog funnels, structured logs, health endpoint, queue dashboard.
- Tests: Vitest, Playwright, MSW/recorded fixtures **in tests only**, seeded test database for e2e.
- Deploy: Vercel + Neon (or Fly + Postgres), GitHub Actions CI, preview envs, env validation with zod at boot.

Modular monolith plus one worker. No microservices, no premature abstraction.

---

## 5. Data model (minimum, production-grade)

`orgs`, `users`, `memberships`, `invites`, `audit_events`
`creator_accounts` (ig_user_id, username, account_type, source: `applied|invited|manual|discovery`, consent_status, consent_at, contact_email, email_source, timezone, status)
`creator_snapshots` (append-only: followers, media_count, captured_at, api_version, request_id)
`media` (ig_media_id, type, caption, permalink, thumbnail, posted_at, like_count, comments_count, metrics_captured_at)
`media_insights` (per-media metrics, only for owned/authorized accounts)
`comments` (only where permitted; store `source` and `permission_basis`)
`scores` (model_version, weights, factor_breakdown jsonb, inputs_hash, computed_at)
`campaigns`, `sequences`, `sequence_steps`, `messages`, `message_events`, `replies`, `classifications`
`suppressions`, `consents`, `unsubscribes`
`products`, `chapters`, `drafts`, `citations` (draft passage → source comment/media id), `assets`, `approvals`
`orders`, `refunds`, `payouts`, `ledger_entries` (immutable, double-entry style), `statements`
`agreements` (version, signed_at, ip, user_agent, document hash)
`integrations` (provider, status, scopes, token_expires_at, last_sync_at, last_error)
`feature_flags`, `jobs`

Every table: `id`, `org_id`, `created_at`, `updated_at`, `created_by`. Every externally sourced field carries provenance.

---

## 6. Meta integration contract

- Create a Meta app, use **Instagram API with Instagram Login** (or the Facebook Login variant if you need Pages), development mode, with the registered test professional account.
- Scopes requested must be minimal and justified per feature: basic profile, insights, comments/messages only if the feature exists, content publish only if it ships.
- OAuth with state + PKCE, encrypted token storage, refresh job before expiry, revoke/disconnect flow, `last_error` surfaced in **Integrations**.
- Webhooks: verify signature, idempotent handlers, replay-safe, dead-letter queue. Implement the data-deletion callback and a deletion request log.
- Discovery: Business Discovery only, rate-limit aware, backoff with jitter, cached snapshots, never on page load.
- App Review pack: screencast per permission, privacy policy, terms, data-use explanation, test instructions.
- Show freshness everywhere: "Synced 2 min ago · Instagram API". Stale data is labeled, never silently passed off as live.

---

## 7. Real-account test protocol (no mock-ups)

Required accounts and keys — ask me once, then proceed with whatever exists:

```
META_APP_ID / META_APP_SECRET
IG_TEST_ACCOUNT (registered professional account you control)
IG_SECOND_ACCOUNT (a second professional account to act as the creator/target)
DATABASE_URL
AUTH_SECRET
RESEND_API_KEY / OUTREACH_FROM / OUTREACH_INBOX
STRIPE_SECRET_KEY (test mode) / STRIPE_WEBHOOK_SECRET
OPENAI_API_KEY (or ANTHROPIC_API_KEY)
R2_* or S3_*
SENTRY_DSN / POSTHOG_KEY
```

Rules:
- Commit `.env.example`; validate env at boot; never expose secrets to the client.
- If a credential is missing, build the integration behind an adapter and render a **"Connect Instagram / Connect Stripe / Connect email"** required state with an empty workspace. Do not substitute sample data.
- Any PR touching Instagram, email or payments must include evidence from the registered account: handle, timestamp, screenshot or screen recording, and the API request id when available.
- Acceptance for the whole build includes a screen recording of the real loop: connect account → sync real reels → approve a creator → send a real email to my inbox → reply → generate an outline citing real captions → (test-mode) purchase → ledger split.

---

## 8. World-class bar (measurable)

**Design:** keep the identity — near-black `#0A0A0F`, lime `#C6FF4A`, violet `#8B5CF6` — but execute with restraint: 4/8 spacing scale, 3 radii, 2 shadow levels, 120–200ms motion, dark-first with a real light mode, density toggle, command palette (⌘K), optimistic updates, undo, toasts, skeletons, no layout shift, no gradient soup. Content-first hierarchy, instant feedback, zero dead ends.

**Accessibility:** WCAG 2.2 AA. Keyboard-complete, visible focus, reduced-motion, 4.5:1 contrast (lime on white fails — never do it), screen-reader labels, 200% zoom, captions/alt text, form errors tied to fields.

**Performance budgets:** LCP ≤ 2.0s p75 mobile, INP ≤ 200ms, CLS ≤ 0.05, TTFB ≤ 500ms, ≤ 180KB gz initial JS, Lighthouse ≥ 95, no unbounded lists, no N+1 queries, indexes on every filter.

**Trust:** every metric explainable (formula, version, sample size, timestamp); scoring shows the factor breakdown and refuses to score with fewer than 8 reels; "why am I seeing this" on every recommendation.

**Security/compliance:** least-privilege scopes, encrypted tokens, RLS, CSRF, rate limits, audit log on every mutation, consent records, suppression honored across all channels, unsubscribe in one click, GDPR/CCPA export + delete, Meta Platform Terms, CAN-SPAM, creator agreement with IP license and revenue-share terms, refund/chargeback policy.

**Reliability:** idempotent jobs, retries with jitter, kill switch for all outbound sending, bounce/complaint auto-pause, queue depth and freshness on the dashboard, runbooks for token expiry, webhook failure and payment disputes.

---

## 9. Build order — milestones with acceptance criteria

Work in order. Each milestone is done only when its criteria are demonstrated, not asserted.

**M0 — Foundation.** Repo, CI, env validation, design tokens, app shell, auth skeleton, error/404/empty states, logging, health check.
*Done when:* CI is green on a clean clone; the dashboard renders honest empty states with zero fake numbers.

**M1 — Tenancy & identity.** Orgs, memberships, invites, roles, RLS, audit log, creator/operator session split.
*Done when:* an automated test proves org A cannot read org B's creators, products, orders or messages.

**M2 — Instagram connect & sync.** OAuth, token vault, refresh, initial + incremental sync, webhook receiver, disconnect, Integrations health page.
*Done when:* connecting the registered test account shows its real follower count and real recent media; disconnecting empties the workspace without deleting audit history; token refresh is tested.

**M3 — Discovery & scoring, consent-first.** Creator application/invite flow, manual add, Business Discovery enrichment, snapshot history, versioned explainable score, filters over real rows, provenance chips.
*Done when:* every table cell traces to a row; no creator exists without a `source`; score breakdown is reproducible from stored inputs.

**M4 — Outreach.** Sequences, templated drafts with real variables, approval queue, Resend send, inbound reply parsing, classification, caps, sending windows by timezone, suppression, unsubscribe.
*Done when:* a real email lands in my inbox and a reply threads back within 60 seconds; unsubscribe blocks all future sends; the approval gate cannot be bypassed; the kill switch works.

**M5 — Product studio.** Research from permitted data only, outline → approval → chaptered draft with citations to real comment/media ids, export PDF/EPUB, creator review link, e-sign/clickwrap with audit hash.
*Done when:* a generated draft cites at least 10 real source ids, word count is measured, and the creator review link works on a phone.

**M6 — Commerce & splits.** Stripe Connect onboarding, product checkout, order/refund webhooks, immutable ledger, creator statements, CSV export, tax flags.
*Done when:* a test-mode purchase creates ledger rows that sum correctly; a refund reverses them; the creator statement matches to the cent.

**M7 — Craft & polish.** Command palette, mobile creator PWA, a11y audit, performance budgets enforced in CI, Sentry/PostHog, onboarding checklist, feature flags, docs.
*Done when:* budgets pass on a throttled mobile profile; a new operator completes the core loop in under 10 minutes without help.

**M8 — Launch hardening.** App Review pack, legal pages, DPA, deletion flow, backups/restore drill, load test, security review, incident runbooks.
*Done when:* restore from backup is demonstrated and the review screencast is recorded.

---

## 10. How to work with me

1. **Before code:** write `PLAN.md` (milestones, risks), `DECISIONS.md` (including every API limitation and the honest alternative), and a traceability matrix: screen → query → table → API.
2. **Then build without asking permission between milestones.** Stop only for a missing credential, a permission only I can grant, or a genuinely irreversible decision.
3. **Never claim done without evidence.** Run typecheck, lint, unit, integration, e2e, build, and the mock-data audit (grep the UI for hardcoded arrays, literal counts and placeholder emails). Paste the results.
4. **Report at each milestone:** what shipped, proof (test names, screenshots, recording), what is blocked, what is next. Keep it short.
5. **Commit per milestone** with clear messages; keep `README.md` runnable from zero.
6. **When an API can't do it, say so and ship the honest version.** Never fake data to make a screen look finished.
7. Preserve the brand identity; reject generic SaaS templates. If a screen would look at home in a $29 template, redesign it.

---

## 11. First 60 minutes

1. Extract the kit to `./reference/kit`, read it, and write `AUDIT.md` listing every mock artifact and the real data source that replaces it.
2. Write `PLAN.md`, `DECISIONS.md`, and the traceability matrix.
3. Scaffold the app, tokens, shell, CI, env validation, health check.
4. Render the operator dashboard with real empty states and a visible "Connect Instagram" requirement.
5. Report back with the audit, the plan, the first screenshot, and the exact credentials you need.

Acceptance for this rebuild: a stranger can connect a real account, see only true data, run the loop end to end, and never once wonder whether a number is fake.
