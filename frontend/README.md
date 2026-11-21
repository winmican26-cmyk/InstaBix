# VistaBix frontend starter

A small, standalone Next.js App Router dashboard that reads from the existing
VistaBix FastAPI backend. It is additive: it does not import from or modify the
root application, and it runs on port **3100** so the root app can stay on 3000.

## What it shows

- Backend health (status, database, environment, version, auth requirement)
- Creator pipeline from `GET /api/scout` and outreach from `GET /api/outreach`
- Products from `GET /api/products`
- Revenue summary and recent sales from `GET /api/revenue`
- Whop adapter status from `GET /api/whop` (mode, configured, mock, publish
  ready — never credentials)
- Locked settings from `GET /api/settings` (branding value and split rules, both
  reported by the backend rather than hard-coded)

Every displayed figure comes from an API response. If `/api/health` cannot be
read, the page renders an explicit **Backend unreachable** state and no numbers.
Empty backend arrays render explicit states such as **No creators yet**,
**No products yet**, and **No sales recorded yet**. A failed individual endpoint
renders a "could not load …" message for that card only.

## Setup

From this directory:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3100`.

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `next dev -p 3100` | Development server on port 3100 |
| `build` | `node scripts/build.mjs` | Production build; forces `NODE_ENV=production` |
| `start` | `next start -p 3100` | Production server on port 3100 |
| `typecheck` | `tsc --noEmit` | TypeScript check |

## Environment

| Variable | Scope | Default | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | server-side fetch target | `http://localhost:8000` | Base URL of the FastAPI service |
| `API_KEY` | server only | unset | Sent as `X-API-Key` when set; never exposed with `NEXT_PUBLIC_` |

The API client is a `server-only` module used by an async Server Component.
Requests run per request (`connection()` plus `dynamic = "force-dynamic"`), so
the API key is never bundled into client JavaScript.

## Notes for Next.js 16

- Turbopack is the default; no deprecated `next lint` or `--turbopack` flags are used.
- `next.config.ts` uses only supported options; no `middleware`,
  `serverRuntimeConfig`, or `images.domains` configuration.
- `next-env.d.ts` is generated/managed by Next.js and ignored by Git.
