/// <reference path="../pb_data/types.d.ts" />

// Richer plate/time modelling on `models`, and a copies-based `queue`.
//   models: drop the single `plate_time_min`; add plate capacity + time breakdown.
//   queue:  replace copies_per_plate + plates with a single total `copies`
//           (plates are derived from the model's max_copies_per_plate).

migrate(
	(app) => {
		const models = app.findCollectionByNameOrId('models');
		try {
			models.fields.removeByName('plate_time_min');
		} catch (_) {
			/* already gone */
		}
		models.fields.add(new NumberField({ name: 'max_copies_per_plate', min: 1 }));
		models.fields.add(new NumberField({ name: 'plates_required', min: 1 }));
		models.fields.add(new NumberField({ name: 'total_time_min', min: 0 }));
		models.fields.add(new NumberField({ name: 'time_per_plate_min', min: 0 }));
		app.save(models);

		const queue = app.findCollectionByNameOrId('queue');
		queue.fields.add(new NumberField({ name: 'copies', min: 1 }));
		for (const name of ['copies_per_plate', 'plates']) {
			try {
				queue.fields.removeByName(name);
			} catch (_) {
				/* already gone */
			}
		}
		app.save(queue);
	},
	(app) => {
		const models = app.findCollectionByNameOrId('models');
		for (const name of ['max_copies_per_plate', 'plates_required', 'total_time_min', 'time_per_plate_min']) {
			try {
				models.fields.removeByName(name);
			} catch (_) {
				/* ignore */
			}
		}
		models.fields.add(new NumberField({ name: 'plate_time_min', min: 0 }));
		app.save(models);

		const queue = app.findCollectionByNameOrId('queue');
		try {
			queue.fields.removeByName('copies');
		} catch (_) {
			/* ignore */
		}
		queue.fields.add(new NumberField({ name: 'copies_per_plate', min: 1 }));
		queue.fields.add(new NumberField({ name: 'plates', min: 1 }));
		app.save(queue);
	}
);
