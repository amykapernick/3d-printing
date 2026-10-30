/// <reference path="../pb_data/types.d.ts" />

// Units are the app's defaults (grams, minutes), so drop them from field names;
// the UI shows the unit in its labels instead. Spoolman's own fields are untouched.
//   model_filaments.grams     -> usage
//   model_filaments.purge_g   -> purge
//   print_jobs.grams_used     -> usage
//   print_jobs.print_minutes  -> duration
//   models.total_time_min     -> total_time
//   models.time_per_plate_min -> time_per_plate

const RENAMES = {
	model_filaments: { grams: 'usage', purge_g: 'purge' },
	print_jobs: { grams_used: 'usage', print_minutes: 'duration' },
	models: { total_time_min: 'total_time', time_per_plate_min: 'time_per_plate' }
};

function apply(app, map) {
	for (const [collectionName, renames] of Object.entries(map)) {
		const collection = app.findCollectionByNameOrId(collectionName);
		for (const [from, to] of Object.entries(renames)) {
			const field = collection.fields.getByName(from);
			if (field) field.name = to;
		}
		app.save(collection);
	}
}

migrate(
	(app) => apply(app, RENAMES),
	(app) => {
		// reverse the map for rollback
		const reversed = {};
		for (const [c, renames] of Object.entries(RENAMES)) {
			reversed[c] = {};
			for (const [from, to] of Object.entries(renames)) reversed[c][to] = from;
		}
		apply(app, reversed);
	}
);
