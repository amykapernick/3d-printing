# 3D Print Manager PWA: Project Spec

Standalone, cloneable PWA to manage 3D printing (Bambu P1S + AMS), track filament stock and cost, plan a print queue, and track per-item cost/income for sales.

## Stack and constraints
- SvelteKit (not Next.js), PocketBase backend, PWA
- **No Tailwind** (non-negotiable). Modern CSS, accessible by default (WCAG, keyboard, focus, contrast)
- Cloneable: PocketBase schema as committed migrations; all personal config (HA URL/token, currency, electricity rate, platform fee %) in a `settings` collection or env vars; `docker-compose.yml` for a working copy
- Prefers JSON/GraphQL snippets over large document dumps when discussing changes

## Goals
1. **Printer status and filament**: live print status and AMS slot contents (material, colour, remaining %) via Home Assistant (ha-bambulab integration). No public Bambu filament-library API exists. Remaining % is only reliable for RFID Bambu spools, so real stock is tracked in-app.
2. **Filament stock and cost**: per-spool price paid, initial grams, remaining grams, supplier, purchase date. Deduct grams on print completion (from sliced file usage); allow manual correction by weighing. Dashboard: total spent, total used, cost per gram by colour.
3. **Order list**: per filament, queued grams minus remaining stock across spools, rounded up to whole rolls, estimated cost from last price paid; flag low/out of stock.
4. **Models and queue**: model name, source link, actual file, notes, filament colours and grams required, planned order.
5. **Multi-copy and wastage**: copies per plate estimate; wastage saved = (N x single-plate purge/prime waste) minus one multi-copy plate's waste. Import grams used and purge/flush weight from sliced `.3mf` metadata.
6. **Sales**: cost per item (filament at actual spool cost per gram, electricity x print time, packaging, platform fees) vs sale price; margin per item and per plate; sold counts and income per model.
7. **Etsy (later phase)**: Etsy Open API v3 (OAuth 2.0, read scopes for transactions/listings) polled via PocketBase cron to import receipts into `sales`; `etsy_listing_id` on models maps line items; actual fees from payment data; new orders can add to the queue. Fallback: Etsy sales CSV import. Verify current API access rules and webhook availability.

## Open decision: Spoolman
Option A (leaning): build spools in-app, self-contained and cloneable.
Option B: use Spoolman for stock (REST API, filament DB, QR labels, possible ha-bambulab auto-deduct; verify current docs), with the PWA reading from it. Cost: extra service to run and bundle, data split across two systems.

## Draft schema
```json
{
  "settings": ["currency", "electricity_rate_kwh", "printer_watts", "platform_fee_pct", "ha_url", "ha_token"],
  "filaments": ["brand", "material", "colour_name", "hex", "roll_weight_g"],
  "spools": ["filament", "purchased_at", "supplier", "price_paid", "initial_g", "remaining_g", "ams_slot?"],
  "models": ["name", "source_url", "file", "notes", "etsy_listing_id?"],
  "model_filaments": ["model", "filament", "grams", "purge_g"],
  "queue": ["model", "copies_per_plate", "position", "status", "actual_g"],
  "sales": ["model", "qty", "price", "fees", "sold_at", "etsy_receipt_id?"]
}
```

## Suggested build order
1. Project scaffold, PocketBase migrations, settings
2. Filaments, spools, queue, order list
3. Home Assistant feed (printer status, AMS slot mapping, print-complete deduction)
4. `.3mf` import, wastage and multi-copy maths
5. Costing and sales, margin views
6. Etsy sync (or CSV import)
