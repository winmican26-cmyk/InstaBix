# VistaBix Postman collection

Local, credential-free requests for the FastAPI service at `http://localhost:8000`.

## Files

- `Vistabix.postman_collection.json` — all 13 Stage 1–3 endpoints, grouped by agent.
- `Vistabix.postman_environment.json` — variables (`baseUrl`, `apiKey`, ids, `niche`).

## Use

1. Start the backend: `cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`.
2. Import both JSON files into Postman and select the **VistaBix Local** environment.
3. Run requests in order: health → scout/search → creators approve → outreach send → products generate → products approve → whop publish → whop products → revenue/settings.

`apiKey` is empty by default. When the backend's `API_KEY` is configured, set the environment variable to the same server-side value; `X-API-Key` is sent on every `/api` request. `GET /health` needs no key.

## Safety notes

- `POST /api/outreach/send` only creates a `draft_needs_approval` row. It never contacts an email provider and never sends mail. A separate human approval step is required before any send path.
- `POST /api/whop/publish` accepts `is_first_product` for compatibility, but the stored product ordinal is authoritative for the 60/40 or 50/50 split. Mock mode is only available outside production; no URL is fabricated.
- `POST /api/whop/webhook` intentionally returns `501 webhook_next_cut` and creates no sale. Use `POST /api/revenue/sales` to create a manual sale locally.
- Never put real credentials in this collection or environment. Secrets belong in the gitignored `.env` files documented in the root `README.md`.
