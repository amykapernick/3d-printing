/// <reference path="../pb_data/types.d.ts" />

// A model is now made of one or more PLATES, each with its own capacity and measured
// times. One finished item = one run of every plate. Per plate we store the time for
// 1 copy, 2 copies, and a full plate (max_copies) — the app interpolates between those
// points (batching when copies exceed a plate's capacity). This supersedes the single
// model-level time/capacity fields.

migrate(
	(app) => {
		const modelsId = app.findCollectionByNameOrId('models').id;
		const plates = new Collection({
			type: 'base',
			name: 'model_plates',
			fields: [
				{
					type: 'relation',
					name: 'model',
					required: true,
					maxSelect: 1,
					cascadeDelete: true,
					collectionId: modelsId
				},
				{ type: 'number', name: 'position', min: 0 },
				{ type: 'number', name: 'max_copies', min: 1 },
				{ type: 'number', name: 'time_1', min: 0 }, // minutes, one copy
				{ type: 'number', name: 'time_2', min: 0 }, // minutes, two copies
				{ type: 'number', name: 'time_full', min: 0 }, // minutes, a full plate (max_copies)
				{ type: 'autodate', name: 'created', onCreate: true },
				{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_model_plates_model ON model_plates (model)']
		});
		app.save(plates);

		// drop the superseded model-level fields (now per-plate / derived)
		const models = app.findCollectionByNameOrId('models');
		for (const name of ['max_copies_per_plate', 'plates_required', 'total_time', 'time_per_plate']) {
			try {
				models.fields.removeByName(name);
			} catch (_) {
				/* already gone */
			}
		}
		app.save(models);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('model_plates'));
		} catch (_) {
			/* ignore */
		}
		const models = app.findCollectionByNameOrId('models');
		models.fields.add(new NumberField({ name: 'max_copies_per_plate', min: 1 }));
		models.fields.add(new NumberField({ name: 'plates_required', min: 1 }));
		models.fields.add(new NumberField({ name: 'total_time', min: 0 }));
		models.fields.add(new NumberField({ name: 'time_per_plate', min: 0 }));
		app.save(models);
	}
);
