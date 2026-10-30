# CLAUDE.md — context for AI agents working on this repo

A self-contained, cloneable PWA to manage Bambu 3D printing: filament stock & cost,
a print queue, per-item sales costing, personal-vs-business tracking, live printer
status via Home Assistant, and Etsy sales import. See `README.md` for the user-facing
version and `SPEC.md` for the original brief. **No Tailwind** — modern CSS only.

## Architecture

Three services, bundled via `docker-compose.yml` (one `docker-compose up` runs all):

- **`app/`** — SvelteKit (`@sveltejs/adapter-node`, SSR). The **only** thing the browser
  talks to. All credentials (PocketBase superuser, Spoolman URL, HA token, Etsy tokens)
  live server-side; load functions / actions / `+server.ts` endpoints proxy everything.
- **`pocketbase/`** — PocketBase **pinned to 0.40.5** (`pocketbase/Dockerfile`), schema as
  committed JS migrations in `pb_migrations/`. Holds app data only. Collection rules are
  locked to superusers; the app authenticates as a superuser using `.env` creds.
- **Spoolman** (`ghcr.io/donkie/spoolman`, named volume) — **owns all filament/spool/vendor
  stock and cost**. The app reads/writes it over its REST API (`/api/v1`). Filament stock
  is never duplicated in PocketBase; models reference a Spoolman filament by numeric id
  (`model_filaments.spoolman_filament_id`).

Data flow: browser → app (SvelteKit server) → PocketBase + Spoolman + Home Assistant + Etsy.

## Running

```sh
cp .env.example .env            # set admin password + (optional) HA/Etsy creds
docker-compose up --build       # or: make up    → app :3000, pocketbase :8090, spoolman :7912
make dev                        # backends in Docker + `npm run dev` hot reload
```

`pb_data/` and the Spoolman volume are git-ignored; the schema lives in `pb_migrations/`,
so a fresh clone rebuilds it on first run. `*.pdf` is git-ignored (invoices hold PII).

In `app/`: `npm run check` (svelte-check — keep it clean), `npm run build`.

## Layout

- `app/src/routes/` — pages: `/` dashboard, `/printer`, `/filaments` (+`/import`), `/models`
  (+`/[id]`, +`/[id]/file` download proxy), `/queue`, `/orders`, `/sales`, `/consumables`,
  `/settings`; Etsy OAuth at `/auth/etsy/{start,callback}`, cron endpoint `/api/etsy/sync`.
- `app/src/lib/server/` — `pocketbase.ts` (superuser client), `spoolman.ts`, `ha.ts`,
  `etsy.ts`, `bambuInvoice.ts` (PDF→rows), `threemf.ts` (`.3mf` parse), `modelCost.ts`.
- `app/src/lib/` — `costing.ts` (pure maths), `csv.ts`, `types.ts` (mirror the DB).
- `pb_migrations/` committed schema · `pb_hooks/etsy_sync.pb.js` hourly Etsy cron.

## Data model (PocketBase collections)

`settings` (singleton: currency, platform_fee_pct, packaging_default_cost) · `models`
(name, source_url, file, notes, etsy_listing_id) · `model_plates` (per plate: max_copies +
measured times `time_1`/`time_2`/`time_full`; one item = one run of every plate)
· `model_filaments` (model, usage, purge, and a requirement: either `match=specific` +
`spoolman_filament_id`, or `match=general` + `req_family`/`req_shade`/`req_material`) · `consumables` +
`model_consumables` (magnets/packaging/hardware) · `queue` (model, copies, position, status,
print_type) · `print_jobs` (model, usage, duration, print_type) · `sales` (model, qty, price,
fees, packaging_cost, shipping_cost, channel, etsy_receipt_id) · `etsy_auth` (OAuth tokens).

## Conventions & gotchas (READ before editing — these bit us)

**SvelteKit 3.x renamed its virtual modules** (this is SvelteKit **3**, not 2):
- `$lib/*` → **`#lib/*`** (package.json `imports`). TS needs the `paths` mapping in
  `app/tsconfig.json` to resolve it (Vite resolves it via the imports map).
- Runtime env: in **server-only** modules read `import { env } from 'node:process'` —
  **not** `$env/dynamic/private` (gone). Keeps Docker runtime config un-inlined.
- Service worker: `$app/service-worker` (the typed `self`) + `$app/manifest`
  (`immutable`/`assets`/`prerendered`) + `$app/env` (`version`). There is no `$service-worker`.
- `$app/state`, `$app/forms`, `$app/navigation` keep their names.
- No `svelte.config.js` — adapter/compiler/csrf config is inline in `vite.config.ts`.
- `app/tsconfig.json` must `exclude` `src/service-worker.ts` or sync won't emit the tsconfig.

**adapter-node@6**: dropped the `ORIGIN` env and defaults the derived origin protocol to
`https`, which made SvelteKit's CSRF check reject every form over http. This app has **no
user auth** (server holds the only creds, trusted LAN), so CSRF origin-check is disabled via
`csrf: { trustedOrigins: ['*'] }` in `vite.config.ts`. `BODY_SIZE_LIMIT` is raised in
docker-compose for `.3mf`/PDF uploads.

**PocketBase migrations**: user migration timestamps **must sort after the built-in system
migrations** (latest ~`1778828400`) or they run mid-bootstrap and get silently clobbered —
use `date +%s` for new ones. The entrypoint runs `migrate up` explicitly before
`superuser upsert`. **Do not test the PB API with the harness `curl`** — it injects
`Content-Type: application/json` on GETs and PB misroutes them as creates (400); use `node`
fetch or the app (its SDK is fetch-based). To inspect `pb_data/data.db`, use Node's
`node:sqlite`, copying `.db`+`-wal`+`-shm` to a writable dir first (files are root-owned).

**Project decisions:**
- **No units in DB field names** (`usage`, `purge`, `duration`, `time_1`/`time_2`/`time_full`
  — all grams/minutes by default); units live in **UI labels** only.
  Spoolman's own fields (`weight`, `remaining_weight`, …) keep their names.
- **Electricity is not costed** (solar).
- **`print_type` (personal/business) is on `queue` + `print_jobs`, never on `models`** — a
  model is tagged each time it's queued.
- A model is made of **plates** (`model_plates`); one finished item = one run of every plate.
  Each plate stores `max_copies` + measured times at 1/2/full copies. Time for N copies
  interpolates between those points per plate and batches when N exceeds a plate's capacity
  (`plateTime`/`modelTime` in `costing.ts`) — **not** a linear/proportional estimate.
- Multi-copy filament: usage scales with copies, **purge once per plate-run**
  (`filamentForCopies` + `plateRuns` in `costing.ts`).
- `.3mf` parsing (`threemf.ts`) auto-fills usage (reliable, from `slice_info.config`) and
  print time/plates; purge is an **estimate** from `flush_volumes_matrix` (PLA density, split
  evenly across slots). Only runs on initial upload.
- Filament colours/density are enriched from Spoolman's bundled catalog (`/api/v1/external/filament`);
  the import page has a "Backfill colours" action.
- A model filament row requires **either** a specific Spoolman filament **or** a general colour
  (family + optional shade/material). `lib/colour.ts` classifies a hex into a family/shade;
  `lib/server/requirements.ts` (`resolveRequirement`) turns a row into candidate Spoolman
  filament ids + label + grouping key — used by deduction, orders, printable, and costing so
  general requirements participate everywhere. General requirements need filament colours set
  (run "Backfill colours" so the classifier has hexes to work with).

## Integrations

- **Home Assistant** (`ha.ts`, `/printer`): ha-bambulab. Entities matched by stable suffix
  (`_print_status`, `_ams_tray_N`, …); **multi-printer** — one `PrinterInfo` per device base
  (e.g. `garage_x1c`). Needs `HA_URL` + `HA_TOKEN`.
- **Etsy** (`etsy.ts`): Open API v3, OAuth 2.0 + PKCE (no client secret). Connect from
  `/sales`. Receipts map to models by `etsy_listing_id`; fees estimated from platform_fee_pct
  (ledger API not yet wired). Needs `ETSY_KEYSTRING` + `ETSY_SHOP_ID`; `CRON_SECRET` enables
  the hourly `pb_hooks` cron. All env vars documented in `.env.example`.

## Deferred / roadmap

- **Per-printer queue routing** — a `printers` collection, assigning queue items to a specific
  machine, per-printer settings, dashboard per printer. (The live *view* is already multi-printer.)
- **MakerWorld bulk-add from URLs** — only name (from URL slug) + source link are feasible;
  MakerWorld is behind Cloudflare so titles/images/`.3mf` can't be fetched server-side.
- **Etsy actual per-order fees** from the payment-ledger API (currently estimated).
