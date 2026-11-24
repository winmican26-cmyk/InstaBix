# VistaBix — Verification Evidence Package

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
cd C:\Users\mican\Documents\VistaBix\backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m compileall -q app tests
```

- `pytest`: final lead re-gate **70 passed, 1 warning in 3.49s**; earlier producer re-gate **70 passed, 1 warning in 3.15s**.
- Warning: Starlette deprecation warning concerning `httpx`/`TestClient`; no test failure.
- `compileall`: no output.

### 2.2 Backend independent judge

```powershell
cd C:\Users\mican\Documents\VistaBix\backend
.\.venv\Scripts\python.exe -m pytest
```

- Re-run: **70 passed, 1 warning in 2.96s**.
- Targeted re-run of the 16 new tests: all passed.
- Judge confirmed no application source changes were needed.
- Residual: the exact combination `APP_ENV=production` with `WHOP_MOCK_MODE=false` was not parametrized in a test, but code inspection confirmed `disabled` mode and 503 fail-closed publishing.

### 2.3 Frontend producer re-gate

```powershell
cd C:\Users\mican\Documents\VistaBix\frontend
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
cd C:\Users\mican\Documents\VistaBix\frontend
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
cd C:\Users\mican\Documents\VistaBix
npm run verify
```

- Initial `npm run verify` failed because root ESLint and TypeScript globbed nested `frontend/` and `backend/.venv`.

Fixes, each bounded:

1. Added `frontend/**` and `backend/**` to root ESLint ignores.
2. Added `frontend` to root `tsconfig.json` exclude.
3. Added `scripts/build.mjs`, which forces `NODE_ENV=production` for the local Next CLI because this shell exports `NODE_ENV=development`.

Final re-run:

```powershell
cd C:\Users\mican\Documents\VistaBix
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
cd C:\Users\mican\Documents\VistaBix
git status --short --branch
git remote -v
git check-ignore -v backend/.venv backend/vistabix.db backend/__pycache__ reference/kit/App.tsx
```

- Documentation-time working tree: uncommitted on `main`; no remote was configured.
- Post-push state: clean `main` tracking `origin/main` at `9d74ad8`; remote `origin` is `https://github.com/winmican26-cmyk/VistaBix.git`.
- Ignore check: `backend/.venv`, `backend/vistabix.db`, `backend/__pycache__`, and `reference/kit/App.tsx` all confirmed ignored.
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
> vistabix@0.1.0 typecheck   (tsc --noEmit, clean)
> vistabix@0.1.0 lint        (eslint ., clean)
> vistabix@0.1.0 test
 Test Files  5 passed (5)
      Tests  52 passed (52)

> vistabix@0.1.0 build
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

- STAGE2-SCHEMA runtime CHECK dump (from `Base.metadata`, mirrored in real Postgres): `ck_products_split_bps_sum => split_creator_bps + split_platform_bps = 10000`; `ck_products_split_mirror_sum => split_creator + split_operator = 1.00`; `ck_products_branding => branding IN ('hybrid','creator_only','vistabix_only')`; `ck_creators_niche` with the 6 spec values; `ck_creators_status` with the 7 title-case values; `ck_products_status` with the 6 spec values; `ck_campaigns_current_step` and `ck_emails_step` in 1..3.
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
> vistabix@0.1.0 typecheck   (clean)
> vistabix@0.1.0 lint        (clean)
> vistabix@0.1.0 test        (5 files passed, 52 tests passed)
> vistabix@0.1.0 build       (production build succeeded)

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

## 10. Reference starter structure reconciliation (2026-11-19)

D18 in `DECISIONS.md` records the interpretation. The pasted blocks 5–6 were treated as legacy reference, not as a patch to copy.

| Reference item | Shipped state | Action |
| --- | --- | --- |
| `README.md`, `frontend/package.json`, `frontend/app/page.tsx` | Present | None |
| `backend/requirements.txt` | Present with newer pins; no `alembic`/`python-dotenv` needed | Not downgraded |
| `backend/.env.example` | Present with all production settings and safety rails | Kept; credential nodes added in section 9 |
| `backend/migrations/001_initial.sql` | `backend/migrations/0001_stage2.sql` is already the full six-table DDL | No duplicate created |
| `backend/app/{main,models,schemas,whop}.py`, `agents/agent1-4.py` | Present and production-grade; reference snippets are toy versions | Not replaced |
| `routers/{scout,outreach,products,revenue,settings}.py` | Routes live in the single accepted `main.py` registration point; `routers/whop.py` holds the audit endpoint | Deferred as a no-op refactor |
| `postman/` collection, environment, README | Missing | **Added** as VistaBix-branded files |

Validation:

```text
collection requests = 13 ; unique = 13
MISSING = [] ; EXTRA = []
ENV_VARS = apiKey, baseUrl, creatorId, niche, productId, productNumericId
COLLECTION_VALID = True
legacy-brand hits in postman/ = 0
```

The collection encodes the locked rules in request descriptions: drafts are never auto-sent, `is_first_product` is accepted but never trusted for splits, the webhook is a 501 stub, and no secrets belong in Postman.

## 11. Section 7 Whop reference audit (2026-11-19)

D19 in `DECISIONS.md` records the verdict. An independent read-only audit compared the pasted Section 7 code with the shipped backend; the audit changed no files and no production code change was warranted. Official Whop docs (`https://docs.whop.com/llms.txt`, `https://docs.whop.com/api-reference`) were fetched in parallel and confirm:

- Current API base `https://api.whop.com/api/v1`; sandbox `https://sandbox-api.whop.com/api/v1`.
- `Authorization: Bearer <API_KEY>` from the server only; pin a dated version with `Api-Version-Date`.
- Current API docs under `/api-reference/`; Legacy API under `/api-reference/legacy/`.

The pasted `https://api.whop.com/v5` is therefore a legacy path. Shipped `config.py:74-75` and `whop.py:323,398` already match the Current API; no edit was made.

| Pasted item | Verdict | Shipped evidence |
| --- | --- | --- |
| `WHOP_BASE = ".../v5"` | Rejected (locked conflict) | `config.py:74-75`, `whop.py:323,398`; v1 asserted in `test_agent4.py`, `test_stage3_helpers.py` |
| Module `API_KEY` / `COMPANY_ID` globals | Rejected | Injected `Settings` (`config.py:72-73`, `deps.py:24-25`); `WHOP_ACCOUNT_ID` alias |
| Client-bool `split_for` | Mirror only | Authoritative `split_bps_for` `whop.py:75`; stored ordinal `main.py:842-860,982-983`; 409 mismatch |
| `create_whop_product`, float price, mock id/URL | Rejected / aliased | `WhopClient.publish_product` `whop.py:653-774`; two-call product+variant `whop.py:719-751`; no `whop_mock_` id or `/mock/` URL in source |
| `calc_payouts(amount: float, ...)` | Superseded | `calc_payouts(gross_cents: int, ...)` `whop.py:80-115`, integer cents + Decimal half-up; `test_whop.py:8-55` |
| Forbidden brand text in description | Rejected | TOC-derived description `agent4.py:550-555`; structured metadata `agent4.py:561-566`; derived-pattern repo search 0 hits |
| `_demo_products`, dynamic class `P`, 400 gate | Rejected | Real `Product` row, 404 missing, 409 `publish_blocked` `main.py:953-980`; single route asserted `test_stage3_api.py:93-103` |
| Fabricated GET URL | Rejected | Mock projection without URL `whop.py:542-552`; live whitelist `whop.py:565-593` |
| 3 stories + 2 captions | Style difference, not a gap | 4 story + 3 caption strings (`agent4.py:226-258,300-344`; renderers `agent4.py:472-503`) plus 3 specs + 3 variations; accepted in §8.3 and D17 |
| `qualifies()`-based scout search | Aliased | Pure stored-row `search_creators` `agent1.py:447-502`; route `main.py:526-546` |

**Verdict:** no genuine functional gap and no atom required. Known residuals (`POST /api/whop/webhook` 501 stub, in-memory audit/notifications, sandbox verification) are deferred cuts already recorded in §8.4, not missing reference features. The forbidden brand token was never written; docs refer to it only as "the forbidden legacy brand".

## 12. Frontend starter and SQL migration reference audit (2026-11-19)

D20 in `DECISIONS.md` records the verdict. The pasted blocks 8–9 were treated as legacy reference, not a patch. The audit changed no files and no production code change was warranted.

| Pasted item | Verdict | Shipped evidence |
| --- | --- | --- |
| Reference package name, Next 14.2.0 / React 18.3.1, port 3000 | Rejected | `frontend/package.json:2,7-15` — VistaBix name, Next 16.4.6, React 19.3.1, port 3100, typecheck script |
| Toy page shell with three fetch comments | Superseded | `frontend/app/page.tsx:10-323` fetches health/scout/outreach/products/whop/revenue/settings in parallel; `Unreachable` guard at 325-342; empty states; no sample figures |
| `001_initial.sql` + `psql -f` runner | Aliased | `backend/migrations/0001_stage2.sql` is documentation DDL; `backend/app/migrate.py:1-8` applies idempotent additive migrations at runtime |
| Table set (six tables + settings) | Present | `0001_stage2.sql:8,52,70,116,141,173` — creators, campaigns, products, emails, sales, settings; indexes and CHECK constraints throughout |
| Niche CHECK list | Present (identical) | `0001_stage2.sql:37-40`; `config.py:16-23` |
| UUID primary keys | Rejected | `0001_stage2.sql:9,53,71` INTEGER PKs; integer ids in `models.py` |
| NUMERIC price/split authoritative | Rejected | `0001_stage2.sql:76-82` `price_cents`/`split_*_bps` authoritative, decimal mirrors with CHECK at 103-108; `calc_payouts` `whop.py:80-115` |
| `status DEFAULT 'Qualified'`, no CHECK | Rejected | `0001_stage2.sql:27,41-44` default `New` + locked seven-value CHECK; `config.py:29-37` |
| `calc_split(is_first BOOLEAN)` function | Rejected | No SQL function in shipped tree; ordinal derived `main.py:842-860`; mismatch → 409 `split_rule_mismatch`; split math `whop.py:66-115` |
| Six demo creators + one demo product seed | Rejected | Repo-wide search for the reference handles and product title found no shipped rows |
| `is_first_product BOOLEAN DEFAULT TRUE` as client authority | Constrained | Column retained as stored ordinal (`0001_stage2.sql:78`); publish ignores the request field (`main.py:982`) |

**Verdict:** no genuine functional gap and no atom required. The reference triggers and full 200-line DDL were not pasted and are not needed: CHECK constraints come from SQLAlchemy metadata and the additive migration runner.

## 13. Real creator self-registration (2026-11-19)

D21 in `DECISIONS.md` records the decisions; `TRACEABILITY.md` section 10 maps the surface. The user explicitly chose "register accounts instead of mockups", the role-gated creator portal, and honest unverified email state.

### 13.1 Atom graph and risk

| Atom | Risk | Boundary | Result |
| --- | --- | --- | --- |
| ACCESS-1 | High | `src/lib/auth/roles.ts`, `src/lib/auth/session.ts`, `src/app/onboarding/page.tsx`, `src/lib/actions/org.ts` | Creator role denied centrally in `getWorkspace()` (pages, actions, `/api/export/**`); the two entry points that used only `getSessionUser()`/`requireUser()` now reject creator-only sessions too, so `/onboarding` aggregates and owner-minting `createOrgAction` are unreachable; creator sessions redirect to `/creator` |
| SIGNUP-1 | High | `src/app/creator/**`, `src/lib/creator-signup.ts`, schema + `drizzle/0005` | Real transactional registration, scoped session, unverified state, applied contract |
| TESTS-1 | Medium | `tests/creator-signup.test.ts` | Validation, consent, password policy, role deny, applied state, high-risk source invariants |
| DOCS-1 | Low | D21, this section, traceability §10, README §7g | Decision and evidence recorded |

The producer deliberately did **not** only patch `(app)/layout.tsx`: four export routes call `getWorkspace()` directly, so the deny was placed in the shared resolver to fail closed everywhere.

### 13.2 Deterministic gates

```text
npm run typecheck   clean
npm test            7 files, 70 tests passed (was 6 files, 55 tests)
npm run lint        clean
npm run build       compiled successfully; /creator and /creator/signup listed as dynamic routes
git diff --check    clean
legacy-brand audit  derived_pattern_length=12; shipped_scope_files=231; forbidden_hits=0
```

No change was made under `backend/**` or `frontend/**`. No external credentials were used or required.

### 13.3 Independent judge verdict

First pass: **REQUEST-CHANGES**. The judge found two real authorization gaps that the centralized `getWorkspace()` deny did not cover: `/onboarding` read operator aggregates with only `getSessionUser()`, and `createOrgAction` used only `requireUser()` before inserting an `owner` membership — so a creator session could see operator data and mint itself an owner workspace. It also found `canAccessOperator()` was a blacklist and would fail open for an unknown runtime role.

Resolution: added the pure allowlist plus `hasOperatorMembership()` in `src/lib/auth/roles.ts`; both entry points now reject creator-only sessions; `setActiveOrg()` also rejects creator memberships. The judge's non-blocking notes were also fixed: the duplicate-handle pre-check now binds `app.org_id` through `withOrg()`, omitted `niche` is coerced before Zod, and the portal's no-linked-application state no longer links back to the signup page that would redirect it away. Tests grew from 66 to 70 to cover the allowlist and both entry-point guards.

Second pass: **ACCEPT**. The independent judge re-ran read-only typecheck/lint/diff checks, counted 70 `it()` cases across 7 files, and swept every remaining `getSessionUser()`/`requireUser()` site. Final table: all 14 checks PASS, including no creator access to operator data or owner self-elevation, fail-closed allowlist, transaction atomicity, honest unverified email, RLS-bound dedupe, portal isolation, schema/migration consistency and no mock data. `backend/**` and `frontend/**` remain untouched. The only residual observation is a non-blocking redirect loop for a role string that cannot exist under the current Postgres enum; it grants no access.

## 14. Postman, setup, and dashboard wireframe audit (2026-11-19)

D22 in `DECISIONS.md` records the verdict. Blocks 10–12 were treated as stale reference. No application code changed; the only changes are the four documentation records for this reconciliation.

| Pasted item | Verdict | Shipped evidence |
| --- | --- | --- |
| Legacy-branded Postman filenames and `base_url` | Rejected | `postman/README.md:5-14` names `Vistabix.postman_collection.json` / `Vistabix.postman_environment.json`, uses `baseUrl`, and documents the 13-request order; `postman/Vistabix.postman_environment.json:4-9` sets `baseUrl=http://localhost:8000` with empty `apiKey` and no secret |
| Claimed 14-request run with repeated scout/classify/publish variants | Superseded | A JSON parse of the shipped collection returned 13 requests; `TRACEABILITY.md:92-106` maps exactly the 13 D17 paths, including creator approval/list and the 501 webhook stub that the pasted run omits |
| Postman safety notes | Present | `postman/README.md:20-23` — draft-only outreach, server-derived split ordinal, no fabricated URL in mock mode, webhook 501, no credentials in the collection |
| `WHOP_COMPANY_ID`, `OPENAI_API_KEY`, `EMAIL_FROM_NAME` | Rejected | `backend/.env.example:22-37` and `backend/app/config.py:72-77` use `EMAIL_FROM_DOMAIN`, `WHOP_API_KEY`, `WHOP_ACCOUNT_ID` and the `/api/v1` base; `README.md:139,146-163` maps `ANTHROPIC_API_KEY` and the complete backend env contract |
| `psql $DATABASE_URL -f backend/migrations/001_initial.sql` | Rejected | `backend/migrations/0001_stage2.sql` is the authoritative six-table DDL; `backend/app/migrate.py:1-8` applies additive changes idempotently at runtime; `README.md:206` records both. No `001_initial.sql` exists in the tracked tree |
| Frontend on port 3000 | Rejected | `frontend/README.md:34,38-40` and `README.md:101-110` run the starter on 3100 so the root app can stay on 3000 |
| “Mock mode works without a key” as a universal rule | Constrained | `backend/.env.example:3-4,34-37` and `backend/app/config.py:103-115` select mock only outside production; a missing key in production disables publishing (503) rather than fabricating data |
| Publish curl using `prod_1` and expecting a URL plus `0.60` | Rejected as written | `backend/app/main.py:961-988` requires a real product row, `validate_publishable`, and `creator_approved`/`live` status, then ignores client `is_first_product`; `backend/tests/test_api.py:267-275` proves the unapproved path is 409 `publish_blocked`; `backend/tests/test_stage3_api.py:320-329` proves a later product returns a 50/50 split despite a client `true`; `backend/tests/test_stage3_helpers.py:176-193` proves mock get invents no URL, price or plan |
| Hard-coded scout/outreach/studio figures and example product word count | Rejected | `BUILD_PROMPT.md:13-18` lists those values on the hard-delete list; `AUDIT.md:20-30` maps each legacy presentation to real API/DB-backed behavior; `src/lib/db/queries.ts:27-92` computes creator/message/product/ledger stats from org-scoped rows; `src/app/(app)/dashboard/page.tsx:101,145-177,180-186,204-209` renders those rows with provenance and an explicit empty state |
| “Build Kit” tab | Rejected | `src/lib/constants.ts:6-30` defines the real navigation (Dashboard, Creators, Outreach, Product Studio, Revenue, Integrations, Audit log, Settings); no Build Kit route exists. `AUDIT.md:26` records the legacy view's replacement by the real schema, migrations and `/docs` |
| Client config banner with hard-coded niches, split, email and branding | Rejected | `backend/app/main.py:222-236` reports branding, niches, split payload, Whop mode, email domain and daily cap from server state; `frontend/app/page.tsx:296-318` renders those values from `/api/settings` and states that nothing there is hard-coded |
| Sequence days, open/reply rates, templates, cap and human approval | Real rows/gates only | `src/app/(app)/outreach/page.tsx:44,95,105,132,151,240-241` shows stored steps, stored caps, explicit approval blocks and suppression; `src/app/(app)/studio/page.tsx:47-48,58,122-123` disables generation without a provider and measures word counts on save instead of accepting an example value |

**Verdict:** no genuine functional gap, no atom and no production change. The shipped collection, setup docs, migration runner, publish gates and real-data dashboard already answer the pasted blocks under the stronger D01/D03/D05/D06/D08/D17/D19/D20 contract.

### 14.1 Deterministic gates

```text
npm run verify    typecheck clean; lint clean; 7 files / 70 tests passed; production build compiled successfully
backend pytest   177 passed, 1 warning in 12.33s (Starlette/httpx deprecation notice)
backend compileall clean
git diff --check  clean (only Git's LF-to-CRLF normalization warning on the four edited markdown files)
legacy-brand audit  derived_pattern_length=12; shipped_scope_files=231; forbidden_hits=0
```

`git status --short` shows only `DECISIONS.md`, `EVIDENCE.md`, `README.md` and `TRACEABILITY.md` modified. No file under `src/`, `backend/`, `frontend/`, `postman/`, `drizzle/` or `tests/` changed. No real credentials or live provider calls were used.

## 15. Final wiring and E2E verification (2026-11-19)

This closes the user's final request: click every visible control, then finish with repeatable E2E tests. No provider credentials were added; the missing credential nodes in `.env.local` remain intentionally empty for later completion.

### 15.1 Runtime restoration

- Docker Desktop was restarted; `vistabix-postgres` was started on `0.0.0.0:55432->5432/tcp` and reconnected with the app role (34 public tables).
- Backend: `uvicorn app.main:app --host 127.0.0.1 --port 8000`; `GET /health` returned HTTP 200 with `database:"ok"`, `whop.mode:"mock"`, `configured:false`.
- Root app: `npm run dev`; `GET /api/health` returned HTTP 200 with `database:"reachable"`.
- Login rate-limit rows were cleared before each E2E run so the single global login would not inherit earlier failed attempts.

### 15.2 E2E suite

```text
npm run e2e
Running 18 tests using 1 worker
1 skipped (opt-in configured-env spec)
17 passed (2.5m)
```

Scope and result:

- Public routes `/`, `/how-it-works`, `/for-creators`, `/apply`, `/creator/signup`, `/login`, `/legal/privacy`, `/legal/terms`: 7-18 visible controls clicked per route.
- Authenticated routes `/dashboard`, `/creators`, `/outreach`, `/studio`, `/revenue`, `/integrations`, `/audit`, `/settings`: 16-29 visible controls clicked per route.
- Selector: `button:visible, a:visible:not([href="#main"]), select:visible, input:visible`. This covers document-level sidebar, topbar, header and footer controls; the off-screen accessibility skip link is excluded because it is not clickable until focused.
- Every test asserted `expect(errors, ...).toEqual([])` for `pageerror` and console errors; no page errors were reported.
- Credential-gated API checks returned 503 for `/api/integrations/instagram/start`, `/api/checkout` and `/api/webhooks/instagram`; `/api/health` returned 200 with `database:"reachable"`.

An earlier independent judge found that the original `<main>`-scoped selector missed document-level controls. The selector was broadened as above and the full suite re-run green. Global setup was also made more deterministic by clicking the hydrated Sign in button rather than calling `requestSubmit()` inside `locator.evaluate()`, which could destroy the execution context on navigation. The judge's bounded re-review returned **ACCEPT**: the selector is a strict superset of the old one, the sole exclusion is the only `href="#main"` link (the intentionally off-screen skip link), no `role="button"`, `contenteditable` or used `Textarea` falls outside the selected tag types, and `/login` has exactly one matching Sign in submit control.

The opt-in inverse check `EXPECT_CONFIGURED=1 npx playwright test e2e/env-configured.spec.ts` passed earlier (`1 passed`, `4.3s`) against a temporary server supplied with fake values only as process env. It remained skipped in the final suite by design; `.env.local` was never populated with fake or real provider credentials.

### 15.3 Final deterministic gates

```text
npm run verify
  typecheck: clean
  lint:      clean
  test:      7 files / 76 tests passed
  build:     compiled successfully; 11/11 static pages generated

backend pytest (full suite): 188 passed, 1 known Starlette/httpx deprecation warning
git diff --check: clean (only Git's LF-to-CRLF normalization warnings on four edited TS files)
legacy-brand audit: 0 hits in 236 tracked/new files and 1,925 built files
```

No seeded demo rows, fabricated URLs, products or metrics were introduced. Integer cents and basis points remain authoritative; splits remain server-derived from the stored ordinal; approval, consent, suppression and fail-closed behavior were preserved.

## 16. Studio intelligence slice — Demand Gaps, Voice DNA, Buyer Panel (2026-11-19)

This closes the follow-up request to implement the genuinely additive V2.2 concepts: Demand Gap scoring, a locked Voice DNA profile, and an AI Test Buyer Panel. Duplicates were deliberately not rebuilt: qualification scoring, outreach, studio drafting, splits, ledger, audit, tenancy, roles, settings and the design system were left unchanged.

### 16.1 Atom register

| Atom | Goal | Success criteria | Risk | Generator verdict | Judge verdict |
| --- | --- | --- | --- | --- | --- |
| `SCHEMA-INTEL` | Add four org-scoped intelligence tables and RLS migration | Schema/migration column parity; forced RLS policy on all four; no seed rows | M | **PASS** — typecheck clean; migration reviewed | **ACCEPT** |
| `PURE-INTEL` | Deterministic scoring and validation helpers | 35 literal unit tests; no DB/SDK/Next imports | L | **PASS** — 35/35 tests green | **ACCEPT** |
| `AI-INTEL` | Three credential-gated Anthropic adapters | `aiConfigured` guard first; zod `safeParse`; bounded inputs; typed failure results | M | **PASS** — typecheck/lint clean | **ACCEPT** |
| `ACTIONS-INTEL` | Server actions, gates, loader | Auth + role + org transaction + audit + revalidate on every write; review gate server-side | M | **PASS** — 115/115 full unit suite green | **ACCEPT** |
| `UI-INTEL` | Three honest Studio panels | Stored values only; disabled states; no auto-publish; build green | M | **PASS** — typecheck/lint/build clean | **ACCEPT** |

### 16.2 Implementation boundaries

- Four new tables in `src/lib/db/schema.ts`: `demand_gaps`, `voice_dnas`, `buyer_panel_runs`, `buyer_objections` (root app now has 37 tables).
- `drizzle/0006_studio_intelligence.sql`: hand-authored additive migration. All four tables enable and force RLS and receive the same `tenant_isolation` policy as `0001_rls_and_grants.sql`. No journal/snapshot rewrite, no seed rows.
- Pure modules in `src/lib/analysis/`: demand scoring uses integer basis points with 4000/3000/3000 weights for request volume, buyer language and in-workspace competition; voice checks are normalized verbatim substring checks; buyer drafts must be 3–5 distinct personas with concrete fixes.
- `src/lib/ai/analysis.ts`: three server-only adapters using `env.AI_MODEL`, zod-validated JSON, bounded material and `{ ok: false }` failure returns. No API key was used; no live provider call was made.
- `src/lib/actions/analysis.ts`: five actions. Generation fails closed before any DB read; Voice DNA phrases must be grounded in real captions; regeneration clears the lock; the buyer panel requires a locked Voice DNA profile. Every successful write is audited.
- `src/lib/actions/studio.ts`: `submitForCreatorReviewAction` now blocks when a locked Voice DNA profile detects banned phrasing or when any buyer objection is still open. The check runs inside the transaction; no client flag can bypass it.
- `src/app/(app)/studio/[id]/page.tsx`: three stored-data panels with honest empty/disabled states and no publish automation.

### 16.3 Deterministic gates

```text
npm run verify
  typecheck: clean
  lint:      clean
  test:      11 files / 115 tests passed
  build:     compiled successfully; 11/11 static pages generated; /studio/[id] dynamic

npm run db:migrate
  → 0006_studio_intelligence.sql … applied
  Applied 1 migration(s).

Postgres read-only verification
  schema_migrations: 0006_studio_intelligence.sql present
  pg_class:  demand_gaps / voice_dnas / buyer_panel_runs / buyer_objections
             relrowsecurity=true, relforcerowsecurity=true
  pg_policies: tenant_isolation present on all four tables

npm run e2e
  Running 18 tests using 1 worker
  17 passed, 1 skipped (opt-in configured-env spec)

git diff --check: only Git LF-to-CRLF normalization warnings; no real whitespace errors
legacy-brand audit (judge): derived_pattern_length=12; 24 changed/new files scanned; forbidden_hits=0
```

The local migration was applied only after an explicit human approval gate. No production data was changed. `backend/**`, `frontend/**`, splits, ledger, branding, consent and outreach policy were untouched.

### 16.4 Independent judge verdict

**ACCEPT.** The independent read-only verifier checked schema/migration column parity, forced RLS and policies, fail-closed ordering in all adapters and actions, org scoping and audit calls, the server-side review gate, UI honesty, branding and untouched surfaces. It confirmed 35 new pure tests and zero forbidden-brand hits.

Residual observations, none blocking acceptance:

1. `evidenceIndexes` are bounded to the adapter's 12-caption maximum; if fewer captions are supplied, out-of-range indexes are discarded by the action before persistence, so no invalid evidence id is saved.
2. The buyer-panel lock check and its later write use separate transactions; a concurrent regeneration could race, but the same role gate limits impact.
3. `countBuyerLanguage` uses a fixed English phrase list; other languages score lower without being fabricated.
4. AI adapters and DB actions have no mocked behavioral tests; invariants are covered by pure tests and source-text regression guards.
5. Code and migration 0006 must ship together because `getProductDetail` and the submit gate now query the new tables unconditionally.

### 16.5 Human gate

The user explicitly approved applying migration `0006_studio_intelligence.sql` to the local Postgres before runtime/E2E verification. No commit or deployment was performed.

## 17. Weekly unlock paywall — BILL-00..06 (2026-11-23/24)

D23 in `DECISIONS.md` authorizes the feature. Six squash-merged PRs (#22–#27) cover the decision record, schema/RLS, quota core, Pro checkout route, subscription webhook and UI. BILL-06 is PR #28 and adds the focused E2E smoke and this durable record. Counts marked "carried forward" come from the earlier atoms in this session chain; they were not re-derived from those commits by BILL-06.

### 17.1 Compact atom register

| Atom | Producer verdict | Independent judge verdict |
| --- | --- | --- |
| BILL-00 | PASS — decision D23 and atom plan recorded | ACCEPT (prior atom in this session chain) |
| BILL-01 | PASS — unlock/entitlement tables, `0010` migration + down, forced RLS | ACCEPT (prior atom in this session chain) |
| BILL-02 | PASS — UTC ISO week, 10/org/week, idempotent unlock, Pro bypass | ACCEPT (prior atom in this session chain) |
| BILL-03 | PASS — $29/month Checkout route, fail-closed entitlement lookup | ACCEPT (prior atom in this session chain) |
| BILL-04 | PASS — Stripe webhook signature, idempotency, activation/renewal/cancellation, audit | ACCEPT (prior atom in this session chain) |
| BILL-05 | PASS — quota banner, detail teaser, unlock action, upgrade CTA | ACCEPT (prior atom in this session chain) |
| BILL-06 | PASS — 2 focused Playwright tests passed; `npm run verify` green | **ACCEPT** — independent re-review after the REQUEST-CHANGES corrections; see §17.4 |

### 17.2 Exact commands and results from this session

```text
git log --oneline -6
e1f259b feat: gate full creator detail behind weekly unlock or Pro (#27)
73273ca feat: activate Pro entitlement from Stripe subscription webhooks (#26)
0d75ca7 feat: add 29 dollar monthly Pro subscription checkout (#25)
087c8a2 feat: add server-side weekly creator unlock quota (#24)
54e0f1c feat: add org-scoped unlock and entitlement tables with RLS (#23)
a587bb7 docs: record weekly unlock quota and Pro subscription decision (D23) (#22)

verify counts carried forward from this session chain:
after BILL-03: 28 test files / 225 tests
after BILL-05: 32 test files / 270 tests
BILL-06 re-run: 32 test files / 270 tests (below)
```

Focused paywall smoke (container `instabix-postgres` was already running; Playwright reused/started the dev server via `playwright.config.ts`):

```text
npx playwright test e2e/paywall.spec.ts
[WebServer] ⚠ Warning: Next.js ignored pnpm-lock.yaml in C:\Users\mican because it is outside the current Git repository (C:\Users\mican\Documents\InstaBix).
[WebServer]  To use this directory, set `turbopack.root` in your Next.js config.

Running 2 tests using 1 worker

[WebServer] (node:7976) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
  ok 1 [chromium] › e2e\paywall.spec.ts:112:3 › weekly unlock paywall › teaser then unlock reveals full creator detail (5.5s)
  ok 2 [chromium] › e2e\paywall.spec.ts:152:3 › weekly unlock paywall › zero remaining shows upgrade CTA instead of unlock (2.1s)

  2 passed (18.1s)
```

The first focused run was `2 skipped`: a prerequisite probe showed the seed owner has one `owner` membership but `CREATOR_COUNT 0`, so the locked-creator link could not exist. No database reset or re-seed was performed. The spec now creates short-lived creators with a dedicated `e2e_paywall_` username prefix via the admin `pg.Client`, fills the 10-creator quota fixture when the workspace has fewer, and deletes those rows plus all seed-org `creator_unlocks` in `finally`. Only `SEED_EMAIL` and `DATABASE_URL_ADMIN` are read from `.env.local`/env; no secret value is printed or stored. No Stripe request, checkout submission or charge occurred.

```text
npm run verify
> vistabix@0.1.0 typecheck   tsc --noEmit        clean
> vistabix@0.1.0 lint        eslint .            3 warnings, 0 errors
    src\app\(app)\integrations\page.tsx:27:10 'FileText' unused
    src\app\(app)\integrations\page.tsx:27:20 'ShieldCheck' unused
    src\app\(marketing)\legal\dsr\page.tsx:2:8 'Link' unused
> vistabix@0.1.0 test        vitest run
 Test Files  32 passed (32)
      Tests  270 passed (270)
   Duration  5.97s
> vistabix@0.1.0 build       node scripts/build.mjs
✓ Compiled successfully in 4.1s
✓ Generating static pages using 15 workers (13/13) in 852ms
```

Both required gates passed. `git status` before edits was clean on `main` tracking `origin/main`; no commit, push, PR, merge, seed, deploy or production change was made by BILL-06.

### 17.3 Residual items

| Residual | Status |
| --- | --- |
| No live Stripe charge or test-mode subscription purchase | Unchanged; no secret key was available or used |
| No production deploy | Unchanged; all work local |
| 9 known failures in `e2e/wiring.spec.ts` / `e2e/env-configured.spec.ts` | Pending a separate atom; full `npm run e2e` deliberately not run for BILL-06 |
| PLAN bounded next steps #3–#6 and #7–#8 | Status unchanged (credentials/app-review prerequisites) |
| Three pre-existing ESLint unused-import warnings | Non-blocking; `npm run verify` exits 0 |
| BILL-06 independent judge verdict | ACCEPT after REQUEST-CHANGES corrections; recorded in §17.4 and §17.5 |

### 17.4 Judge REQUEST-CHANGES corrections (BILL-06 producer)

The independent judge returned REQUEST-CHANGES. All corrections are confined to the three allowed files; no source, other test file, commit, push, merge, deploy or charge resulted.

1. Test A ("teaser then unlock reveals full creator detail") now carries the same role prerequisite as Test B: `test.skip(context?.role !== "owner" && context?.role !== "admin", "Seed user is not an owner/admin of the workspace")`, because `unlockCreatorAction` permits only owners/admins.
2. Both tests now guard the admin URL before any `pg.Client` is created: `new URL(adminUrl).hostname` (brackets normalized) must be exactly `localhost`, `127.0.0.1` or `::1`; malformed URLs and every other hostname skip with `"DATABASE_URL_ADMIN must point at a local/disposable database"`. The current URL's hostname `localhost` on port `55432` passes. No credential or full connection URL is printed or logged; only that benign local host/port is noted here.
3. Fixture cleanup now uses `starts_with(username, $1)` with the exact `e2e_paywall_` prefix instead of SQL `LIKE` with a `%` wildcard, so `_` cannot act as a wildcard and match unrelated rows. Cleanup remains limited to that prefix plus the explicit fixture UUIDs deleted in each `finally`.
4. Credential-scope clarification: this spec itself consumes only `SEED_EMAIL` and `DATABASE_URL_ADMIN`. Playwright's existing `e2e/global-setup.ts` separately reads `SEED_PASSWORD` to perform the one shared login and write `test-results/auth-state.json`; the spec never reads or prints that value.
5. `PLAN.md` stale lines were corrected: the policy no longer says no milestone is marked Done, and M7 now records the focused Playwright paywall smoke while keeping Lighthouse/load/performance CI gaps and the 9 known wiring failures as a separate atom.

The judge row in §17.1 and the pending-judge residual row in §17.3 are intentionally unchanged: this producer does not self-certify an ACCEPT; the lead appends the verdict after re-review. Exact re-run command output is recorded in §17.5.

### 17.5 Post-correction validation (exact output)

```text
npx playwright test e2e/paywall.spec.ts
[WebServer] ⚠ Warning: Next.js ignored pnpm-lock.yaml in C:\Users\mican because it is outside the current Git repository (C:\Users\mican\Documents\InstaBix).
[WebServer]  To use this directory, set `turbopack.root` in your Next.js config.

Running 2 tests using 1 worker

[WebServer] (node:18328) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
  ok 1 [chromium] › e2e\paywall.spec.ts:124:3 › weekly unlock paywall › teaser then unlock reveals full creator detail (5.6s)
  ok 2 [chromium] › e2e\paywall.spec.ts:166:3 › weekly unlock paywall › zero remaining shows upgrade CTA instead of unlock (2.8s)

  2 passed (23.3s)

npm run verify
> typecheck  tsc --noEmit                       clean
> lint       eslint .                           3 warnings, 0 errors
    src\app\(app)\integrations\page.tsx:27:10 'FileText' unused
    src\app\(app)\integrations\page.tsx:27:20 'ShieldCheck' unused
    src\app\(marketing)\legal\dsr\page.tsx:2:8 'Link' unused
> test       vitest run
 Test Files  32 passed (32)
      Tests  270 passed (270)
   Start at  10:41:33
   Duration  6.52s
> build      node scripts/build.mjs
✓ Compiled successfully in 1771ms
✓ Generating static pages using 15 workers (13/13) in 816ms
```

Both required gates pass after the corrections. No Stripe call, checkout submission, charge, commit, push, merge or deploy occurred.

### 17.6 Lead integration record

- Independent judge verdict after the corrections: **ACCEPT** (all seven re-review items satisfied; no out-of-bound changes).
- Integration PR: #28 (`docs/bill-06-paywall-evidence`). Risk: Medium (E2E + docs). Merge decision follows the standing verified-PR workflow; no payment, schema, auth or deploy gate is waived by this atom.

## 18. E2E-01 — full Playwright suite green (2026-11-24)

| Atom | Goal | Risk | Producer verdict | Judge verdict |
| --- | --- | --- | --- | --- |
| `E2E-01` | Make the full `npm run e2e` suite pass by fixing wiring-test cookie-banner and env assumptions only | Medium (E2E + env assertions) | **PASS (logic + flagged full-suite run)** — 19 passed / 1 skipped with `--trace off --timeout 60000`; plain unflagged run blocked by host ENOSPC; `npm run verify` green | **ACCEPT** — after REQUEST-CHANGES docs corrections; human gate approved the environment-only residual |

### 18.1 Verified failures and root causes (before the fix)

The lead's re-run immediately before this atom produced **10 failures / 1 skipped / 9 passed**:

- Seven public-route tests failed with `Control "Apply" ... locator.click: Timeout 5000ms exceeded` (and the same for `/apply` "registering lets you track your application" and `/login` "Back to site"). Playwright error context showed a client-rendered fixed `aside[aria-label="Cookie and Privacy Preferences"]` with `Only Essential` / `Accept All` buttons covering the bottom/footer controls. `src/components/brand/cookie-banner.tsx` renders that banner in a `useEffect` after hydration and stores consent in `localStorage` under `vistabix_cookie_consent_v1`; the wiring suite never dismissed it, so it intercepted clicks.
- `/creators` failed with `console: Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES` and `ENOSPC` while writing Playwright traces.
- `/integrations` failed with `Control "Audit log" ... Timeout 5000ms exceeded`; the same overlay was the cause.
- The fail-closed test received `303` from `/api/integrations/instagram/start` while expecting `503`, because local `.env.local` has Meta credentials configured. The assertion hard-coded the *unconfigured* environment shape.

Disk pressure was traced to generated `test-results/` and `.next/dev/cache/turbopack`; before this atom the lead removed those generated directories (~663 MB free).

### 18.2 Fixes (test-only)

Only `e2e/wiring.spec.ts` changed:

1. `gotoRoute()` now calls a new `dismissCookieBanner(page)` after every `page.goto` and after `main` becomes visible. It looks up `page.getByRole("button", { name: "Only Essential" })`, clicks it when visible, and never clicks `Accept All`. Because the banner hydrates after `domcontentloaded`, the first navigation on each page allows a short visible wait; consent is then persisted in `localStorage`, so later navigations on the same page only need a cheap visibility check. The existing "click every visible control, assert no page errors" loop and selector are unchanged.
2. The fail-closed test is now env-aware. It reads **only** `META_APP_ID`, `META_APP_SECRET` and `STRIPE_SECRET_KEY` as presence booleans, from `process.env` (falling back to `dotenv.parse` of `.env.local`); no value is printed, logged or stored. All API requests use `maxRedirects: 0`.
   - `/api/integrations/instagram/start`: unconfigured Meta → 503 with `not configured`; configured → 303 with `location` containing `https://www.instagram.com/oauth/authorize`. No redirect is followed.
   - `/api/checkout`: form post `{ productId: "not-a-uuid" }`; unconfigured Stripe → 503 `not configured`, configured → 400 `Unknown product`. The invalid UUID is rejected before any lookup, Stripe session creation or redirect.
   - `/api/webhooks/instagram`: unsigned empty POST; unconfigured secret → 503 `META_APP_SECRET is not configured`, configured → 401 `Signature verification failed`. No event can be stored on either path.
   - `/api/health` still asserts 200 and `database: "reachable"`.

No application source, `playwright.config.ts`, other test files, package files or migrations were modified.

### 18.3 Environment constraint and exact validation outputs

The machine's `C:` drive stayed nearly full throughout this atom. Plain `npm run e2e` was run four times after removing only `test-results/` and `.next/` before each run; every assertion passed, but background Turbopack cache writes emitted `ENOSPC` / `ERR_INSUFFICIENT_RESOURCES`, which crashed a worker in one run, broke the dev server in another, and pushed the 23-control `/audit` test past the config's 30 s default timeout in two runs (best plain result: **18 passed / 1 skipped / 1 failed**, the sole failure being `/audit` timing out with no assertion error). No config or source file was changed to work around this; the final green run only disables Playwright trace artifacts and raises the runner timeout via CLI flags.

Final green command (exact):

```powershell
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue test-results, .next
npm run e2e -- --trace off --timeout 60000
```

```text
> vistabix@0.1.0 e2e
> playwright test --trace off --timeout 60000

[WebServer] ⚠ Warning: Next.js ignored pnpm-lock.yaml in C:\Users\mican because it is outside the current Git repository (C:\Users\mican\Documents\InstaBix).
[WebServer]  To use this directory, set `turbopack.root` in your Next.js config.
[WebServer]

Running 20 tests using 1 worker

  -   1 [chromium] › e2e\env-configured.spec.ts:14:3 › configured env states › integrations page shows configured providers
[WebServer] (node:31460) DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.
[WebServer] (Use `node --trace-deprecation ...` to show where the warning was created)
  ok  2 [chromium] › e2e\paywall.spec.ts:124:3 › weekly unlock paywall › teaser then unlock reveals full creator detail (4.5s)
  ok  3 [chromium] › e2e\paywall.spec.ts:166:3 › weekly unlock paywall › zero remaining shows upgrade CTA instead of unlock (1.4s)
  ok  4 [chromium] › e2e\wiring.spec.ts:144:5 › public routes › every control on / is wired without a page error (22.1s)
  ok  5 [chromium] › e2e\wiring.spec.ts:144:5 › public routes › every control on /how-it-works is wired without a page error (14.7s)
  ok  6 [chromium] › e2e\wiring.spec.ts:144:5 › public routes › every control on /for-creators is wired without a page error (20.4s)
  ok  7 [chromium] › e2e\wiring.spec.ts:144:5 › public routes › every control on /apply is wired without a page error (3.5s)
  ok  8 [chromium] › e2e\wiring.spec.ts:144:5 › public routes › every control on /creator/signup is wired without a page error (3.3s)
  ok  9 [chromium] › e2e\wiring.spec.ts:144:5 › public routes › every control on /login is wired without a page error (2.2s)
  ok 10 [chromium] › e2e\wiring.spec.ts:144:5 › public routes › every control on /legal/privacy is wired without a page error (22.9s)
  ok 11 [chromium] › e2e\wiring.spec.ts:144:5 › public routes › every control on /legal/terms is wired without a page error (19.5s)
  ok 12 [chromium] › e2e\wiring.spec.ts:157:5 › authenticated routes › every control on /dashboard is wired without a page error (15.4s)
  ok 13 [chromium] › e2e\wiring.spec.ts:157:5 › authenticated routes › every control on /creators is wired without a page error (20.5s)
  ok 14 [chromium] › e2e\wiring.spec.ts:157:5 › authenticated routes › every control on /outreach is wired without a page error (13.7s)
  ok 15 [chromium] › e2e\wiring.spec.ts:157:5 › authenticated routes › every control on /studio is wired without a page error (7.3s)
  ok 16 [chromium] › e2e\wiring.spec.ts:157:5 › authenticated routes › every control on /revenue is wired without a page error (8.5s)
  ok 17 [chromium] › e2e\wiring.spec.ts:157:5 › authenticated routes › every control on /integrations is wired without a page error (9.6s)
  ok 18 [chromium] › e2e\wiring.spec.ts:157:5 › authenticated routes › every control on /audit is wired without a page error (31.7s)
  ok 19 [chromium] › e2e\wiring.spec.ts:157:5 › authenticated routes › every control on /settings is wired without a page error (17.1s)
  ok 20 [chromium] › e2e\wiring.spec.ts:165:3 › authenticated routes › credential-gated endpoints respond according to local env configuration (1.1s)

  1 skipped
  19 passed (4.2m)
```

(The suite also emitted its normal per-control `console.log` lines and several harmless `[WebServer] ⨯ Error: The destination stream errored while writing data.` warnings from the disk-constrained dev server; no page/console error assertion failed.)

Second gate, exact command `npm run verify`, ending-to-end output (ANSI colour codes stripped, per-test stdout logs condensed where noted):

```text
> vistabix@0.1.0 verify
> npm run typecheck && npm run lint && npm run test && npm run build

> vistabix@0.1.0 typecheck
> tsc --noEmit

> vistabix@0.1.0 lint
> eslint .

C:\Users\mican\Documents\InstaBix\src\app\(app)\integrations\page.tsx
  27:10  warning  'FileText' is defined but never used. Allowed unused vars must match /^_/u     @typescript-eslint/no-unused-vars
  27:20  warning  'ShieldCheck' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars

C:\Users\mican\Documents\InstaBix\src\app\(marketing)\legal\dsr\page.tsx
  2:8  warning  'Link' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars

✖ 3 problems (0 errors, 3 warnings)

> vistabix@0.1.0 test
> vitest run

 Test Files  32 passed (32)
      Tests  270 passed (270)
   Duration  4.82s

> vistabix@0.1.0 build
> node scripts/build.mjs

▲ Next.js 16.4.6 (Turbopack)
- Environments: .env.local
✓ Compiled successfully in 6.6s
  Running TypeScript ...
  Finished TypeScript in 12.9s ...
✓ Generating static pages using 15 workers (13/13) in 542ms
```

Both required gates exited 0. The build route table was emitted in full by the command (13 static pages; all API and app routes listed) and is not repeated here.

### 18.4 Scope and safety confirmation

- Files changed: `e2e/wiring.spec.ts`, `PLAN.md`, `EVIDENCE.md` only.
- No file under `src/**`, `playwright.config.ts`, `e2e/paywall.spec.ts`, `e2e/env-configured.spec.ts`, `package.json` or `drizzle/` was touched. No commit, push, PR, merge, seed, deploy or migration was performed.
- No Meta OAuth flow was followed and no Stripe Checkout session or charge was created: the Instagram request used `maxRedirects: 0`, checkout used an invalid UUID, and the webhook POST was unsigned with an empty body. No webhook event could be stored.
- No credential value was printed, stored or invented. Only the presence of three named env keys was probed; the local `.env.local` was left exactly as found.
- Generated `test-results/` and `.next/` were removed before runs to relieve disk pressure; nothing else was deleted.

### 18.5 Judge verdict and human gate

- Initial verdict: **REQUEST-CHANGES** — code was sound, but PLAN/EVIDENCE overstated plain `npm run e2e` and success criterion 3 was not literally met.
- Final verdict after docs-only corrections: **ACCEPT** — the flagged full-suite result and host ENOSPC residual are stated accurately, §18.3 history is intact, `git diff --check` is clean apart from Git's LF→CRLF warning, and no out-of-bound files changed.
- Human gate: the user explicitly approved accepting the flagged green run as an environment-only residual on 2026-11-24. No payment, schema, auth or deploy gate was waived.

### 18.6 Lead integration record

- Integration PR: #29 (`test/e2e-wiring-fixes`). Files integrated: `e2e/wiring.spec.ts`, `PLAN.md`, `EVIDENCE.md` only.
- Residual: plain unflagged `npm run e2e` remains blocked on this host by Turbopack ENOSPC and the 30s default timeout; the accepted evidence is the flagged run `--trace off --timeout 60000` (19 passed / 1 skipped) plus `npm run verify` exit 0. No `playwright.config.ts` or application source was changed to mask it.
