# InstaBix — Verification Evidence Package

**Date:** 2026-11-18  
**Time convention:** all events below occurred on 2026-11-18. Wall-clock times were not retained, so no times are invented.  
**Scope:** evidence actually produced or re-run in this session. Prior-work files are described as present, not as newly tested against live services.

## 1. Atom register

| Atom ID | Goal | Success criteria | Risk | Generator verdict | Judge verdict |
| --- | --- | --- | --- | --- | --- |
| `BACKEND-REGATE` | Re-gate the FastAPI service after Whop/split work | Full pytest suite and bytecode compile clean | Test expectations could drift from app behavior | **PASS** — final lead re-gate `70 passed, 1 warning in 3.49s`; earlier producer run `3.15s`; `compileall` produced no output | Covered by `BACKEND-JUDGE` |
| `BACKEND-JUDGE` | Independently verify backend claims | Re-run suite, targeted new tests, confirm no source changes needed | False confidence from producer-run tests only | **PASS** | **PASS** — `70 passed, 1 warning in 2.96s`; targeted 16 new tests all passed; no source changes needed |
| `FRONTEND-REGATE` | Re-gate the standalone dashboard | Typecheck clean; production build succeeds | Next 16 API or build-mode drift | **PASS** — typecheck clean; build compiled successfully with `/` dynamic and `/_not-found` static | Covered by `FRONTEND-JUDGE` |
| `FRONTEND-SMOKE` | Prove no fabricated numbers when backend is absent | Unreachable state visible; numeric text absent | Page could fall back to sample figures | **PASS** — `UNREACHABLE_STATE_PRESENT`, `NUMERIC_TEXT_ABSENT` | Reviewed by `FRONTEND-JUDGE` |
| `FRONTEND-JUDGE` | Independently verify frontend honesty and isolation | No forbidden strings, no kit coupling, no client secret leak, all numbers response-derived | Secret leakage or silent mock fallback | **PASS** | **PASS** — re-ran typecheck/build; confirmed no forbidden-brand strings, no `reference/kit` imports, `API_KEY` absent from nine client chunks, all rendered numbers response-derived |
| `ROOT-REGRESSION` | Restore root verification after nested-app breakage | `npm run verify` green end to end | Root lint/typecheck globbing nested apps or virtualenv | **PASS** after three config/build fixes | No separate root judge recorded; final command output is the evidence |
| `BRAND-AUDIT` | Prove the forbidden legacy brand and kit data are absent from shipped output | No matches in source or built output | Historical brief or excluded archive could be mistaken for shipped code | **PASS** — no matches in shipped scope | Corroborated by frontend-judge scan |
| `DOCS-EVIDENCE` | Write the durable audit/plan/decisions/traceability/evidence/README package | All six root files created using only session-verified facts | Documentation could overstate milestone status | **PASS** — all six files written | **PASS** — independent docs judge; minor non-blocking notes closed below |
| `DOCS-JUDGE` | Independently verify the six documents | All required content present, factual, mutually consistent, no forbidden brand | Overstated milestones or stale claims | **PASS** | **PASS** — verified repository/config/routes, milestone qualifiers, docs-read paths, and no forbidden-brand matches |
| `STAGE3-HELPERS` | Add pure Stage 3 helper logic | Real-row search, disclosure-preserving renderers, secret-free get_product, config defaults | Fabricated data or dropped compliance content | **PASS** — 10 targeted tests green | **ACCEPT** — re-ran tests, independent probes for all four helpers, brand/diff audit clean |
| `STAGE3-API` | Implement the 13-endpoint surface and exact publish contract | All routes present, one publish route, flat keys with server-derived splits, fail-closed webhook | Client ordinal trusted, duplicate route, auto-send | **PASS** — 11 new tests, full suite 177 green | **ACCEPT** — re-ran full suite, route/OpenAPI probe, deliberate wrong-client-ordinal publish probe, webhook no-sale probe |

## 2. Exact commands and summaries

### 2.1 Backend producer re-gate

```powershell
cd C:\Users\mican\Documents\InstaBix\backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m compileall -q app tests
```

- `pytest`: final lead re-gate **70 passed, 1 warning in 3.49s**; earlier producer re-gate **70 passed, 1 warning in 3.15s**.
- Warning: Starlette deprecation warning concerning `httpx`/`TestClient`; no test failure.
- `compileall`: no output.

### 2.2 Backend independent judge

```powershell
cd C:\Users\mican\Documents\InstaBix\backend
.\.venv\Scripts\python.exe -m pytest
```

- Re-run: **70 passed, 1 warning in 2.96s**.
- Targeted re-run of the 16 new tests: all passed.
- Judge confirmed no application source changes were needed.
- Residual: the exact combination `APP_ENV=production` with `WHOP_MOCK_MODE=false` was not parametrized in a test, but code inspection confirmed `disabled` mode and 503 fail-closed publishing.

### 2.3 Frontend producer re-gate

```powershell
cd C:\Users\mican\Documents\InstaBix\frontend
npm run typecheck
npm run build
```

- `typecheck`: clean.
- `build`: Next.js 16.4.6 Turbopack compiled successfully; route `/` is dynamic; route `/_not-found` is static.

### 2.4 Frontend runtime smoke

The producer smoke harness pointed `NEXT_PUBLIC_API_URL` at an unused port. The exact harness command was not retained in the session record.

- Observed: `UNREACHABLE_STATE_PRESENT`.
- Observed: `NUMERIC_TEXT_ABSENT`.
- Interpretation: no fabricated figures are rendered when the backend cannot be reached.

### 2.5 Frontend independent judge

The judge re-ran:

```powershell
cd C:\Users\mican\Documents\InstaBix\frontend
npm run typecheck
npm run build
```

Additional verified findings:

- No forbidden legacy-brand strings in frontend source.
- No `reference/kit` imports or coupling.
- `API_KEY` absent from all nine client JS chunks and present only in server SSR chunks.
- All rendered numbers derive from response fields.
- Per-card failure states are structural, not text added after a caught exception.
- Residual: no durable docs-read report existed at judge time; **this `EVIDENCE.md` section 3 closes that residual**.
- Residual: degraded-health ambiguity was reviewed but not run as an isolated scenario; backend answered while database was unavailable produces a warning plus returned data and still no fabrication.
- Residual: no independent partial-failure runtime test was executed by the judge.

### 2.6 Root regression

Initial failure:

```powershell
cd C:\Users\mican\Documents\InstaBix
npm run verify
```

- Initial `npm run verify` failed because root ESLint and TypeScript globbed nested `frontend/` and `backend/.venv`.

Fixes, each bounded:

1. Added `frontend/**` and `backend/**` to root ESLint ignores.
2. Added `frontend` to root `tsconfig.json` exclude.
3. Added `scripts/build.mjs`, which forces `NODE_ENV=production` for the local Next CLI because this shell exports `NODE_ENV=development`.

Final re-run:

```powershell
cd C:\Users\mican\Documents\InstaBix
npm run verify
```

- Typecheck clean.
- Lint clean.
- Vitest: **10 tests passed**.
- Production build succeeded with the route list emitted.

### 2.7 Branding and no-mock audit

The forbidden legacy brand string is not reproduced in this document. A shell variable held the pattern for the scans.

```powershell
$FORBIDDEN_BRAND = '<legacy brand omitted>'
rg -n -i $FORBIDDEN_BRAND src public scripts tests package.json next.config.ts tailwind.config.ts postcss.config.mjs playwright.config.ts drizzle.config.ts eslint.config.mjs tsconfig.json README.md
rg -n -i $FORBIDDEN_BRAND backend --glob '!.venv/**'
rg -n -i $FORBIDDEN_BRAND .next
rg -n -i $FORBIDDEN_BRAND frontend --glob '!node_modules/**' --glob '!.next/**'
```

- Result: no matches in shipped root files, backend source excluding `.venv`, `.next`, or frontend source.
- No matches remain in tracked source; the legacy kit archive is excluded by Git and was never part of the commit.
- A separate judge scan of `frontend/` corroborated the no-match result.
- The judge also confirmed no `reference/kit` imports or coupling.

### 2.8 Git and ignore hygiene

```powershell
cd C:\Users\mican\Documents\InstaBix
git status --short --branch
git remote -v
git check-ignore -v backend/.venv backend/instabix.db backend/__pycache__ reference/kit/App.tsx
```

- Documentation-time working tree: uncommitted on `main`; no remote was configured.
- Post-push state: clean `main` tracking `origin/main` at `9d74ad8`; remote `origin` is `https://github.com/winmican26-cmyk/InstaBix.git`.
- Ignore check: `backend/.venv`, `backend/instabix.db`, `backend/__pycache__`, and `reference/kit/App.tsx` all confirmed ignored.
- `.gitignore` covers `node_modules`, `.next`, `.venv`, `__pycache__`, `*.pyc`, `*.db`, `.env` variants, `reference/`, and generated output paths.

### 2.9 Independent docs judge

The independent docs judge read all six documents and cross-checked them against repository files and the authoritative evidence.

- Verdict: **PASS**.
- Confirmed required content, milestone qualifiers, no forbidden-brand strings in the six docs, all ten docs-read paths exist, env defaults/routes/scripts match source, and cross-document consistency.
- Non-blocking notes were closed by recording the final `3.49s` backend duration above, clarifying the Whop sandbox base in `DECISIONS.md` as a configured value rather than the local default, and completing two field enumerations in `TRACEABILITY.md`.

## 3. Durable docs-read report

This section closes the frontend judge’s residual that no durable docs-read report had been recorded.

Next.js documentation read by the frontend producer:

1. `node_modules/next/AGENTS.md`
2. `node_modules/next/dist/docs/index.md`
3. `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
4. `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
5. `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
6. `node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md`
7. `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
8. `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`
9. `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md`
10. `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`

Additional documentation read by the independent judge:

- `connection.md`
- `turbopack.md`

No deprecated Next APIs were adopted. The dashboard uses `connection()`, `dynamic = "force-dynamic"`, a server-only API client, and the supported build path.

## 4. Residual risks

| Residual | Why it remains | Owner action |
| --- | --- | --- |
| Production + `WHOP_MOCK_MODE=false` not parametrized | Code inspection showed fail-closed, but no executed matrix case | Add a parametrized production-disabled test |
| Degraded backend health not isolated | Warning + returned data path was reviewed structurally | Add a fixture for database unavailable while HTTP succeeds |
| Partial-failure runtime not independently executed | Judge verified structure, not a live multi-endpoint failure run | Add Playwright/unit case where one GET fails |
| Clean-clone CI not demonstrated | All commands ran in the prepared workspace | Add CI and run from a fresh clone |
| Cross-org isolation not re-run | Schema and RLS script exist; no executed two-tenant assertion | Add and run the Postgres RLS test |
| No real credentials exercised | Meta, Resend, Stripe, and Whop keys unavailable | Obtain credentials and capture real-account evidence |
| Root runtime surfaces not re-populated | Root typecheck/lint/test/build passed; no real-row UI run | Seed a test database and run Playwright E2E |
| No backup/restore, load, security, or App Review evidence | M8 prerequisites not available | Schedule and record the drills |

## 5. Gate and loop notes

**Human gate:** the user explicitly said “Go ahead implement these accordingly.” No further permission was requested for bounded implementation within that instruction. New credentials, payments, or irreversible external actions were not attempted.

**Bounded loop:** no unbounded retry loops were used.

- Backend tests required three producer test-expectation fixes; no application source changes resulted from those fixes.
- Root regression required three config/build fixes; after the third, `npm run verify` passed.
- Frontend and backend judge passes were accepted with residuals recorded rather than re-run indefinitely.

## 6. Stage 1 staged implementation (2026-11-19)

The user supplied the Stage 1 agent block in sections. Five atoms were generated with disjoint file ownership, each independently judged. Rejections were fixed and re-judged rather than accepted:

| Atom | Judge history | Final verdict |
| --- | --- | --- |
| STAGE1-SAFETY | REJECT (daily cap filtered recipient domain, making it a no-op) -> fix + compiled-SQL regression test -> ACCEPT | ACCEPT |
| STAGE1-SCOUT | REQUEST-CHANGES (percentage values clamped; Python/TS engagement mismatch) -> shared normalization + parity tests -> ACCEPT | ACCEPT |
| STAGE1-EMAIL | REJECT (TS mirror lacked `no_response`) -> explicit case + 11 TS mapping tests -> ACCEPT | ACCEPT |
| STAGE1-PRODUCT | REJECT (222-word outline labelled 4,500 words) -> real prose generation + actual-word validation -> ACCEPT | ACCEPT |
| STAGE1-WHOP | No rejection; creator approval gate, split locks, audit, retry, and blocked adapters verified | ACCEPT |

Exact combined gate outputs on 2026-11-19:

```text
npm run verify
> instabix@0.1.0 typecheck   (tsc --noEmit, clean)
> instabix@0.1.0 lint        (eslint ., clean)
> instabix@0.1.0 test
 Test Files  5 passed (5)
      Tests  52 passed (52)

> instabix@0.1.0 build
✓ Compiled successfully in 2.8s
✓ Generating static pages using 15 workers (10/10) in 421ms

backend: .\.venv\Scripts\python.exe -m pytest -v --disable-warnings
======================= 143 passed, 1 warning in 6.87s ========================

backend: .\.venv\Scripts\python.exe -m compileall -q app tests
compileall_exit=0

frontend: npm run typecheck  (tsc --noEmit, clean)
frontend: npm run build       (compiled successfully, 2 static routes)

legacy-brand audit (208 tracked files, excluding node_modules/.next/.venv/reference)
TRACKED_FILES_CHECKED=208
NO_LEGACY_BRAND_IN_TRACKED_FILES
NO_LEGACY_BRAND_IN_BUILT_OR_VENV_OUTPUT
```

Stage-specific judge evidence:

- SAFETY compiled cap condition: `("messages"."org_id" = $1 and "messages"."status" = $2 and "messages"."sent_at" >= $3)` with params `["org-123","sent","2026-11-19T00:00:00.000Z"]`; the regression test fails if `to_email` reappears.
- SCOUT parity: Python `PY_PARITY 50.8`, TypeScript `{"total":50.8,"viewConsistency":0.6666666666666666,"unmonetizedScore":100}`.
- PRODUCT generated word counts from real section bodies: `$19 -> 4500`, `$29 -> 4500`, `$49 -> 6500`, `$97 -> 10000`; a 222-word body with a 4,500 label is rejected.
- WHOP: `27 passed` in `test_agent4.py` + `test_api.py`; audit records contain no headers/payload/secrets; affiliate link is null with a reason when the response lacks one.

### Stage 1 tracked residuals (non-blocking, must be closed before the stated production conditions)

| Residual | Owner action |
| --- | --- |
| 50/day cap is workspace-scoped, not installation-wide; multiple orgs sharing one sending domain can each send 50/day | Provision one verified domain per org or add an RLS-safe global counter before multi-org production |
| Cap counts only `sent` rows after transaction commit; concurrent approvals can race | Add an in-flight counter or DB-level advisory lock |
| Warmup requires an out-of-band owner/admin action; no UI exists | Add a settings control or seeded completion before launch |
| `no_response` is a workflow state; no sequence orchestrator sets it after three unanswered emails | Add the sequence-state transition in outreach orchestration |
| Scout optional score inputs are not forwarded by `/api/scout`; `rank_creators` has no API caller; `models.py.qualification_score` is Integer | Wire schemas/main/sync, promote the column to Numeric, and expose ranked output |
| Offline product prose is deterministic/templated; writer/plagiarism/Google Doc/PDF adapters need credentials | Configure real adapters and re-judge quality |
| Whop audit sink is in-memory; affiliate links not persisted; `hot_reply`/`sale_made` hooks have no emitters | Add durable audit storage, product columns, and event call sites |
| Root `publishProductAction` does not call Whop; two backends remain | Decide one authoritative publish path before production |

## 7. Stage 2 six-table schema (2026-11-19)

### Atoms and verdicts

| Atom / fix | Judge history | Final verdict |
| --- | --- | --- |
| STAGE2-SCHEMA | No rejection; metadata, CHECK dump, JSONB compile, migration idempotency and 7 schema tests verified against real code | ACCEPT |
| STAGE2-APP | REQUEST-CHANGES (missing `details.reasons`, overstated 0/3/7 scheduling, `before_flush` workaround, undisclosed failures) -> fixed at source + re-judged | ACCEPT |
| STAGE2-TESTS | Producer delivered 5 new end-to-end tests and corrected all 5 vocabulary expectations; verified for meaningfulness | ACCEPT |
| STAGE2-MIGRATION-FIX | Three real Postgres upgrade bugs found and fixed; non-destructive, idempotent, portable behavior re-judged | ACCEPT |
| STAGE2-PUBLISH-FIX | `details.reasons` contract, single publish route, direct `live` write, 503/retry/audit/idempotency re-judged | ACCEPT |

Final publish-path judge runtime probes: `POST /api/whop/publish count = 1` (only `publish_stage2`); a `creator_approved=True, status="draft"` product is blocked with `reasons == ['Product status must be creator_approved before publishing.']`; a direct `publish_product()` call persists `status="live"` without a CHECK violation; `32 passed` across `test_agent4.py`, `test_api.py` and `test_stage2_api.py`; `compileall` clean.

### Producer/judge evidence

- STAGE2-SCHEMA runtime CHECK dump (from `Base.metadata`, mirrored in real Postgres): `ck_products_split_bps_sum => split_creator_bps + split_platform_bps = 10000`; `ck_products_split_mirror_sum => split_creator + split_operator = 1.00`; `ck_products_branding => branding IN ('hybrid','creator_only','instabix_only')`; `ck_creators_niche` with the 6 spec values; `ck_creators_status` with the 7 title-case values; `ck_products_status` with the 6 spec values; `ck_campaigns_current_step` and `ck_emails_step` in 1..3.
- JSONB variant runtime check: `SQLite JSON type: JSON` / `Postgres JSON type: JSONB`.
- Publish gate: `validate_publishable` is called in `main.py.publish_stage2`, so the 409 body keeps `details.reasons` (`test_agent4.py:47` passes). A creator-approved boolean with `status="draft"` is still blocked. `agent4.py` now writes `status="live"` directly; the former `before_flush` rewrite and shadowed `/api/whop/publish` route were removed. Only one publish route remains.

### Three real Postgres bugs found and fixed during upgrade verification

1. `migrate._default_sql` emitted integer `0/1` for BOOLEAN columns; Postgres rejected `ALTER TABLE emails ADD COLUMN opened BOOLEAN DEFAULT 0`. Now emits `TRUE`/`FALSE`, which both dialects accept. Locked by `test_migration_boolean_defaults_are_portable`.
2. Legacy lowercase creator statuses violated `ck_creators_status` on upgrade. `_backfill_creators` now maps every known Stage 1 status (`new`, `reviewing`, `qualified`, `unqualified`, `approved`, `contacted`, `negotiating`, `partnered`, `declined`, `suppressed`) to the 7 Stage 2 values. Locked by the `Qualified` assertion in `test_migrate_schema_is_idempotent_and_backfills_mirrors`.
3. `_load_json` returned `None` for already-decoded JSON scalar strings from a JSONB driver, losing `app_settings.value='hybrid'` during the copy to `settings`. It now preserves literal scalars; locked by the ORM read assertion in the same test.

### Real Postgres smokes (throwaway databases, dropped after each run)

Fresh database + two `migrate_schema` calls:

```text
TABLES= ['campaigns', 'creators', 'emails', 'products', 'sales', 'settings']
CHECK_COUNT= 21  (19 table CHECKs + 2 PostgreSQL domain CHECKs)
JSONB_COLUMNS= [('creators', 'content_pillars', 'jsonb'), ('creators', 'qualification', 'jsonb'),
 ('creators', 'recent_reel_views', 'jsonb'), ('creators', 'top_reels', 'jsonb'),
 ('emails', 'classification_detail', 'jsonb'), ('products', 'launch_captions', 'jsonb'),
 ('products', 'story_templates', 'jsonb'), ('products', 'toc', 'jsonb'), ('settings', 'value', 'jsonb')]
POSTGRES_SMOKE_OK
```

Legacy-shaped database + two `migrate_schema` calls:

```text
CREATOR= [{'status': 'Qualified', 'engagement_rate': Decimal('0.045000'), 'monetization_score': 72}]
PRODUCT= [{'status': 'creator_approved', 'price': Decimal('19.00'), 'word_count': 7000,
           'split_creator': Decimal('0.60'), 'split_operator': Decimal('0.40')}]
SALE= [{'amount': Decimal('19.00'), 'payout_creator': Decimal('11.40'),
        'payout_operator': Decimal('7.60'), 'whop_order_id': 'sale_legacy_1', 'sold_at': datetime(...)}]
SETTINGS= [{'key': 'branding', 'value': 'hybrid'}]
LEGACY_PG_SMOKE_OK
```

### Combined gates on 2026-11-19

```text
backend: .\.venv\Scripts\python.exe -m pytest --tb=line
156 passed, 1 warning in 8.14s

backend: .\.venv\Scripts\python.exe -m compileall -q app tests
compileall_exit=0

root: npm run verify
> instabix@0.1.0 typecheck   (clean)
> instabix@0.1.0 lint        (clean)
> instabix@0.1.0 test        (5 files passed, 52 tests passed)
> instabix@0.1.0 build       (production build succeeded)

frontend: npm run typecheck  (clean)
frontend: npm run build      (compiled successfully)

legacy-brand audit (213 tracked files + 4 new files, excluding node_modules/.next/.venv/reference)
TRACKED_FILES_CHECKED=213
NO_LEGACY_BRAND_IN_TRACKED_OR_NEW_FILES

live smoke: uvicorn app.main:app --port 8011 -> GET /api/health
{"status":"ok","version":"0.1.0","env":"development","branding":"hybrid","database":"ok"}
LIVE_HEALTH_STATUS=OK
```

### Stage 2 residuals

| Residual | Owner action |
| --- | --- |
| `STEP_DELAY_DAYS` computes 0/3/7 but only day 0 is initialized; `current_step` never advances to 2/3 and `next_followup_at` is not recomputed | Add a sequence-advancement atom and test it |
| Root app keeps its 33-table schema; no dual-write layer | Decide one authoritative schema before multi-backend production (D16) |
| Postgres live-provider credentials still unavailable | Obtain Meta, Resend, Stripe, Whop sandbox, writer/AI and checker credentials before calling M2-M6 Done |

## 8. Stage 3 API surface and publish contract (2026-11-19)

### 8.1 Atom verdicts

Both atoms were independently judged read-only against the real system; no judge modified any file.

| Atom | Producer | Judge | Judge highlights |
| --- | --- | --- | --- |
| STAGE3-HELPERS | PASS | **ACCEPT** | `search_creators` is pure (no DB/API/network/ranking), case-insensitive on locked niches, inclusive bounds, stable order, bad rows skipped, invalid bounds raise; renderers emit 4 story + 3 caption strings with disclosure, links, hashtags and sticker text preserved and no dict remnants; `PublishOutcome.to_dict()` and structured assets unchanged; `get_product` live GET via audited `_request` with URL-quoted id and whitelisted secret-free projection (no price/URL fabrication), mock has no URL/price/plan_id, disabled raises `WhopNotConfigured`; config defaults `None` / `50`, cap validates `> 0` |
| STAGE3-API | PASS | **ACCEPT** | Full suite re-run green; flattened route probe found all 13 spec endpoints and exactly one `POST /api/whop/publish` (OpenAPI count 1); deliberate wrong client ordinal still produced server-derived splits; all nine flat keys plus every nested key present; webhook 501 created no sale; no legacy-brand hits; no lowercase `"approved"` written to creator status; no provider call on `/outreach/send`; `payouts_due_cents` from integer-cent aggregate |

### 8.2 Exact commands and outputs

```text
backend: .\.venv\Scripts\python.exe -m pytest --tb=line
177 passed, 1 warning in 10.78s
PYTEST_EXIT=0

backend: .\.venv\Scripts\python.exe -m compileall -q app tests
COMPILEALL_EXIT=0

backend targeted: .\.venv\Scripts\python.exe -m pytest tests/test_stage3_helpers.py --tb=short -q
10 passed, 1 warning in 0.05s

root: npm run verify
> typecheck (clean) / lint (clean) / test (5 files, 52 tests passed) / build (production build succeeded)

frontend: npm run typecheck  (clean)
frontend: npm run build      (compiled successfully)

legacy-brand audit (derived from the excluded reference kit into a shell variable; literal never written)
derived_pattern_length=12
root+docs hits=0  backend hits=0  .next hits=0  frontend hits=0

live smoke: uvicorn app.main:app --port 8000
/health      => {"status":"ok","version":"0.1.0","env":"development","branding":"hybrid","database":"ok","whop":{"mode":"mock",...},"api_key_required":false}
/api/health  => identical body
/api/settings no-key => HTTP 200
/api/revenue  no-key => HTTP 200
```

### 8.3 Publish contract probe (judge, wrong client ordinal supplied)

```text
P1 product_id=prod_1 ; is_first_product=True ; split 0.6/0.4 (client sent is_first_product=false)
P1 whop_product_id=prod_mock_<digest> ; whop_url=https://whop.com/checkout/plan_mock_<digest>
   == adapter values, not invented by the route
P1 status=live ; published=True ; created=True ; bio_link == assets.bio_link
P1 story_templates len=4 all str ; disclosure_in_story=True
P1 launch_captions len=3 all str ; disclosure_in_captions=True
P1 nested keys present=True ; missing=set()
P2 external id "prod_2" with client is_first_product=true -> product_id=prod_2
   is_first_product=False ; split 0.5/0.5
int id and "prod_1"/"prod_2" both accepted; repeat publish idempotent
WEBHOOK_STATUS 501 ; CODE webhook_next_cut ; sales before/after 0/0 ; NO_SALE_ROW_CREATED=True
```

After the judge ACCEPT, one non-blocking weakness was closed in `tests/test_stage3_api.py`: the flat-contract test now asserts that `"Paid partnership"` survives into both string arrays. The full suite was re-run and stayed green (`177 passed`, `PYTEST_EXIT=0`, `COMPILEALL_EXIT=0`).

### 8.4 Stage 3 residuals

| Residual | Owner action |
| --- | --- |
| `POST /api/whop/webhook` is a 501 `(Next)` stub | Add signature verification, event-idempotency table and sale/payout ledger in a later cut |
| Live `WhopClient.get_product` exercised only with monkeypatched transport | Run one official read against a Whop sandbox key |
| `is_first_product` in the publish response is server-derived, never the client's | Clients must read the response value; do not treat the request field as authoritative |
| `email_domain` is `null` when `EMAIL_FROM_DOMAIN` is unset | Configure a verified domain before enabling any send path |
| Mock `get_product` exposes no checkout/product URL by design | Use a live sandbox key to obtain real product URLs |

## 9. Credential node readiness (2026-11-19)

Empty credential nodes were prepared ahead of real values. No credential value was supplied or invented; every node is empty.

| File | Nodes added | Tracking |
| --- | --- | --- |
| `.env.example` | `META_DISCOVERY_TOKEN`, `META_DISCOVERY_IG_USER_ID`, `META_SCOPES`; reserved `GOOGLE_DOCS_CLIENT_ID/SECRET/REFRESH_TOKEN`, `PDF_SERVICE_API_KEY`, `PLAGIARISM_API_KEY`, `AI_DETECTION_API_KEY`; cross-reference to `backend/.env` for Whop | tracked template |
| `.env.local` | Same Meta, Resend, Stripe, AI and reserved nodes, all empty; existing local values preserved unchanged | gitignored |
| `backend/.env` (new) | `API_KEY`, `EMAIL_FROM_DOMAIN`, `WHOP_API_KEY`, `WHOP_ACCOUNT_ID` and the non-secret Whop settings | gitignored |
| `frontend/.env.local` (new) | `API_KEY` | gitignored |

`src/lib/env.ts` Zod probe before the fix: `empty: false`, `absent: true`, `value: true` — an empty node would have broken boot. The optional-string preprocessor now maps empty/whitespace-only values to `undefined`. `tests/env.test.ts` (3 tests) proves empty and whitespace values are unset while a real value is configured.

Gates re-run after the change: root `npm run verify` passed (`55 tests` in 6 files, production build with `.env.local` loaded); frontend typecheck and production build clean; backend `177 passed`, `COMPILEALL_EXIT=0`. No provider is enabled by a placeholder.
