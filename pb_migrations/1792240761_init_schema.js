/// <reference path="../pb_data/types.d.ts" />

// Initial schema for the 3D Print Manager.
//
// Spoolman owns filament/spool stock and cost, so there are no `filaments`/`spools`
// collections here — models reference a Spoolman filament by its numeric id.
//
// All collection rules are left null (superusers only). The SvelteKit server talks
// to PocketBase as a superuser; the browser never hits PocketBase directly.

migrate(
	(app) => {
		const created = { type: 'autodate', name: 'created', onCreate: true, onUpdate: false };
		const updated = { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true };

		// --- settings (business prefs; a single row) --------------------------------
		const settings = new Collection({
			type: 'base',
			name: 'settings',
			fields: [
				{ type: 'text', name: 'currency', required: true },
				{ type: 'number', name: 'platform_fee_pct', min: 0 },
				{ type: 'number', name: 'packaging_default_cost', min: 0 },
				created,
				updated
			]
		});
		app.save(settings);

		// seed the single settings row with sensible AUD defaults
		const settingsRow = new Record(settings, {
			currency: 'AUD',
			platform_fee_pct: 6.5,
			packaging_default_cost: 0
		});
		app.save(settingsRow);

		// --- models -----------------------------------------------------------------
		const models = new Collection({
			type: 'base',
			name: 'models',
			fields: [
				{ type: 'text', name: 'name', required: true },
				{ type: 'url', name: 'source_url' },
				{ type: 'file', name: 'file', maxSelect: 1, maxSize: 104857600 },
				{ type: 'editor', name: 'notes' },
				{ type: 'text', name: 'etsy_listing_id' },
				{ type: 'number', name: 'plate_time_min', min: 0 },
				created,
				updated
			],
			indexes: ['CREATE INDEX idx_models_name ON models (name)']
		});
		app.save(models);
		const modelsId = app.findCollectionByNameOrId('models').id;

		// --- consumables (magnets, packaging, hardware, …) --------------------------
		const consumables = new Collection({
			type: 'base',
			name: 'consumables',
			fields: [
				{ type: 'text', name: 'name', required: true },
				{ type: 'number', name: 'unit_cost', min: 0 },
				{ type: 'text', name: 'unit' },
				{ type: 'number', name: 'stock_qty', min: 0 },
				{ type: 'text', name: 'supplier' },
				created,
				updated
			]
		});
		app.save(consumables);
		const consumablesId = app.findCollectionByNameOrId('consumables').id;

		// --- model_filaments (per-model filament usage, referencing Spoolman) -------
		const modelFilaments = new Collection({
			type: 'base',
			name: 'model_filaments',
			fields: [
				{
					type: 'relation',
					name: 'model',
					required: true,
					maxSelect: 1,
					cascadeDelete: true,
					collectionId: modelsId
				},
				{ type: 'number', name: 'spoolman_filament_id', min: 0 },
				{ type: 'text', name: 'colour_label' },
				{ type: 'number', name: 'grams', min: 0 },
				{ type: 'number', name: 'purge_g', min: 0 },
				created,
				updated
			]
		});
		app.save(modelFilaments);

		// --- model_consumables ------------------------------------------------------
		const modelConsumables = new Collection({
			type: 'base',
			name: 'model_consumables',
			fields: [
				{
					type: 'relation',
					name: 'model',
					required: true,
					maxSelect: 1,
					cascadeDelete: true,
					collectionId: modelsId
				},
				{
					type: 'relation',
					name: 'consumable',
					required: true,
					maxSelect: 1,
					cascadeDelete: false,
					collectionId: consumablesId
				},
				{ type: 'number', name: 'qty', min: 0 },
				created,
				updated
			]
		});
		app.save(modelConsumables);

		// --- queue ------------------------------------------------------------------
		const queue = new Collection({
			type: 'base',
			name: 'queue',
			fields: [
				{
					type: 'relation',
					name: 'model',
					required: true,
					maxSelect: 1,
					cascadeDelete: true,
					collectionId: modelsId
				},
				{ type: 'number', name: 'copies_per_plate', min: 1 },
				{ type: 'number', name: 'plates', min: 1 },
				{ type: 'number', name: 'position', min: 0 },
				{
					type: 'select',
					name: 'status',
					maxSelect: 1,
					values: ['queued', 'printing', 'done', 'cancelled']
				},
				{ type: 'select', name: 'print_type', maxSelect: 1, values: ['personal', 'business'] },
				{ type: 'text', name: 'notes' },
				created,
				updated
			],
			indexes: ['CREATE INDEX idx_queue_position ON queue (position)']
		});
		app.save(queue);
		const queueId = app.findCollectionByNameOrId('queue').id;

		// --- print_jobs (actuals for a completed run) -------------------------------
		const printJobs = new Collection({
			type: 'base',
			name: 'print_jobs',
			fields: [
				{
					type: 'relation',
					name: 'model',
					required: true,
					maxSelect: 1,
					cascadeDelete: true,
					collectionId: modelsId
				},
				{
					type: 'relation',
					name: 'queue',
					maxSelect: 1,
					cascadeDelete: false,
					collectionId: queueId
				},
				{ type: 'date', name: 'started_at' },
				{ type: 'date', name: 'completed_at' },
				{ type: 'number', name: 'grams_used', min: 0 },
				{ type: 'number', name: 'print_minutes', min: 0 },
				{ type: 'select', name: 'print_type', maxSelect: 1, values: ['personal', 'business'] },
				{ type: 'text', name: 'notes' },
				created,
				updated
			]
		});
		app.save(printJobs);

		// --- sales ------------------------------------------------------------------
		const sales = new Collection({
			type: 'base',
			name: 'sales',
			fields: [
				{
					type: 'relation',
					name: 'model',
					required: true,
					maxSelect: 1,
					cascadeDelete: false,
					collectionId: modelsId
				},
				{ type: 'number', name: 'qty', min: 1 },
				{ type: 'number', name: 'price', min: 0 },
				{ type: 'number', name: 'fees', min: 0 },
				{ type: 'number', name: 'packaging_cost', min: 0 },
				{ type: 'number', name: 'shipping_cost', min: 0 },
				{
					type: 'select',
					name: 'channel',
					maxSelect: 1,
					values: ['etsy', 'direct', 'market', 'other']
				},
				{ type: 'date', name: 'sold_at' },
				{ type: 'text', name: 'etsy_receipt_id' },
				{ type: 'text', name: 'notes' },
				created,
				updated
			],
			indexes: ['CREATE INDEX idx_sales_sold_at ON sales (sold_at)']
		});
		app.save(sales);
	},
	(app) => {
		// rollback — drop in reverse dependency order
		for (const name of [
			'sales',
			'print_jobs',
			'queue',
			'model_consumables',
			'model_filaments',
			'consumables',
			'models',
			'settings'
		]) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {
				// already gone
			}
		}
	}
);
