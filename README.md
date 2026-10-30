# 3D Print Manager

A self-contained, cloneable PWA to manage 3D printing (Bambu P1S + AMS): filament
stock and cost, a print queue, per-item sales costing, and personal vs. business
print tracking. SvelteKit + PocketBase, with [Spoolman](https://github.com/Donkie/Spoolman)
bundled for filament stock. No Tailwind — modern CSS, accessible by default.

See [`SPEC.md`](./SPEC.md) for the original brief.

## Features

- **Dashboard** — service health + filament stock summary (live from Spoolman).
- **Printer** — live print status + AMS slots via Home Assistant (ha-bambulab).
- **Filaments** — live read-only view of Spoolman stock, cost per gram; bulk-import
  spools from **Bambu invoice PDFs** (parsed automatically) or a CSV, with per-spool
  prices. Re-importing an invoice is a no-op (idempotent by order number).
- **Models** — library with `.3mf` upload that auto-fills filament usage + print time;
  map sliced slots to Spoolman filaments; attach consumables; live per-plate cost.
- **Queue** — ordered print queue, personal vs. business tagging; completing a print
  records a job and deducts stock from Spoolman (multi-copy purge maths included).
- **Order list** — filament the queue needs beyond stock, rounded up to whole rolls.
- **Consumables** — magnets, packaging, hardware folded into model + sale cost.
- **Sales** — per-item margin (filament + consumables + packaging + shipping + fees)
  vs. price; totals and per-model breakdown; optional Etsy import.

## Run it

One command brings up the whole bundle:

```sh
cp .env.example .env     # then edit the admin password
docker-compose up --build
```

| Service    | URL                          | What it is                          |
| ---------- | ---------------------------- | ----------------------------------- |
| App (PWA)  | http://localhost:3000        | The SvelteKit front end             |
| PocketBase | http://localhost:8090/\_/    | App data + admin UI                 |
| Spoolman   | http://localhost:7912        | Filament/spool stock + cost         |

`make up` / `make down` / `make logs` wrap the same thing. The bundle is designed
to move to a Pi/device/cloud later with no changes — only `.env` differs per host.

### Raspberry Pi deployment (arm64)

Use a 64-bit Pi (Pi 4/5, Raspberry Pi OS 64-bit — `uname -m` should say `aarch64`).
Rather than build on the Pi (the SvelteKit build is memory-hungry and slow there),
cross-build the images on your dev machine and ship them over SSH:

```sh
make pi-setup     # one-time: QEMU + a buildx builder
make pi-deploy    # build arm64 images, copy + start the stack
make pi-service   # install the systemd unit (start on every boot)
```

- The Pi target defaults to `pi@raspberrypi.local` using the `~/.ssh/id_ed25519`
  key; override `PI`, `PI_KEY` or `PI_DIR` to change the host, identity or path
  (default `~/docker/3d-print-management`), either per command (`make pi-deploy PI=me@10.0.0.5`)
  or once in a git-ignored `deploy.mk` (e.g. `PI = me@10.0.0.5`). `.env` is **not** copied — create it once on
  the Pi (`cp .env.example .env`, set the admin password) since it holds secrets.
- `pi-deploy` only transfers the two cross-built image tarballs + run config
  (`docker-compose.yml`, `pb_migrations/`, `pb_hooks/`); Spoolman is pulled straight
  from its registry on the Pi (already multi-arch). It never touches `pb_data/`.
- `pi-service` installs [`systemd/3d-print-management.service`](./systemd/3d-print-management.service),
  which runs `docker compose up` on boot. Manage it with
  `sudo systemctl {status,restart,stop} 3d-print-management` and read logs with
  `journalctl -u 3d-print-management -f`.

> SD cards wear out under constant writes — for an always-on Pi, put Docker's
> data-root (or at least `pb_data/` and the Spoolman volume) on an SSD/USB drive.

### Local development (hot reload)

```sh
make dev     # backends in Docker, SvelteKit dev server with hot reload
```

This runs Spoolman + PocketBase in Docker and the app via `npm run dev`. The app
defaults to `localhost` backends, so no extra config is needed.

## Architecture

Three bundled services:

- **Spoolman** owns all filament/spool/vendor stock and cost-per-gram. The app reads
  it live over Spoolman's REST API (`/api/v1`) — stock is never duplicated in
  PocketBase. (A Home Assistant / ha-bambulab auto-deduct hook comes in a later phase.)
- **PocketBase** (pinned, committed JS migrations) holds app-specific data only:
  models, the queue, consumables, print jobs, and sales. Collection rules are locked
  to superusers; the SvelteKit **server** authenticates as a superuser, so tokens and
  backend URLs never reach the browser.
- **App** — SvelteKit with `adapter-node` (server-side rendering, so Spoolman/HA
  credentials stay server-side) and a built-in service worker + manifest for the PWA.

### Data model (PocketBase)

| Collection          | Purpose                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `settings`          | Business config: currency, platform fee %, default packaging cost |
| `models`            | Model library: name, source URL, `.3mf` file, notes               |
| `model_filaments`   | Per-model filament usage; references a Spoolman filament by id     |
| `consumables`       | Magnets, packaging, hardware — unit cost + optional stock          |
| `model_consumables` | Which consumables a model needs, and how many                     |
| `queue`             | Print queue; `print_type` tags each item **personal** or **business** |
| `print_jobs`        | Actuals for a completed run (grams, time), also `print_type`-tagged   |
| `sales`             | Per-sale price, fees, packaging/shipping, channel, Etsy receipt id |

Electricity is deliberately **not** costed (solar).

## Integrations (optional)

Both degrade gracefully when their env vars are blank — the UI just shows a
"not configured" state. Set them in `.env` (see `.env.example` for details):

**Home Assistant** (live printer + AMS, `/printer`): needs `HA_URL` and `HA_TOKEN`
(a long-lived access token). Built against ha-bambulab's documented entity shapes;
entity ids are matched heuristically rather than hard-coded to a device name.

**Etsy** (sales import): needs `ETSY_KEYSTRING` and `ETSY_SHOP_ID` from a registered
Etsy app. Connect from the Sales page (OAuth 2.0 + PKCE, no client secret). Receipts
map to models by `etsy_listing_id`; fees are estimated from the platform-fee % until
the ledger API is wired up. Set `CRON_SECRET` to enable the hourly PocketBase cron
that syncs automatically; otherwise sync manually from the Sales page. The OAuth
redirect URI defaults to `<app-origin>/auth/etsy/callback` and must be registered on
your Etsy app (override via `ETSY_REDIRECT_URI`).

## Notes

- Service URLs and secrets live in `.env` (infrastructure); business defaults live in
  the `settings` collection (editable in the app).
- `pb_data/` (PocketBase data) and the `spoolman_data` volume are local and git-ignored;
  the schema lives in [`pb_migrations/`](./pb_migrations) as committed migrations, so a
  fresh clone rebuilds the schema on first run.
- The default admin login is `admin@example.com` / `changeme-please` — **change the
  password in `.env`** before exposing this anywhere.
