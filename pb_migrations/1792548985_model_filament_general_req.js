/// <reference path="../pb_data/types.d.ts" />

// A model_filaments row can require either a *specific* Spoolman filament
// (spoolman_filament_id, as before) or a *general* colour: a colour family + optional
// shade + optional material, matched against in-stock filaments by their hex.
//   match        specific | general  (default specific)
//   req_family   colour family slug (red/orange/yellow/…)  — general only
//   req_shade    any | light | dark                        — general only
//   req_material optional material filter (e.g. PLA)       — general only

migrate(
	(app) => {
		const c = app.findCollectionByNameOrId('model_filaments');
		c.fields.add(
			new SelectField({ name: 'match', maxSelect: 1, values: ['specific', 'general'] })
		);
		c.fields.add(new TextField({ name: 'req_family' }));
		c.fields.add(
			new SelectField({ name: 'req_shade', maxSelect: 1, values: ['any', 'light', 'dark'] })
		);
		c.fields.add(new TextField({ name: 'req_material' }));
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId('model_filaments');
		for (const name of ['match', 'req_family', 'req_shade', 'req_material']) {
			try {
				c.fields.removeByName(name);
			} catch (_) {
				/* ignore */
			}
		}
		app.save(c);
	}
);
