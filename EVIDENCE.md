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
