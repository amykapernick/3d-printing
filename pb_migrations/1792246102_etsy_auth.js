/// <reference path="../pb_data/types.d.ts" />

// Etsy OAuth token store (a single row). Kept separate from `settings` because it
// holds secrets the app manages, not user-editable business config.
// Timestamp is after the schema migration so it applies in order.

migrate(
	(app) => {
		const etsy = new Collection({
			type: 'base',
			name: 'etsy_auth',
			fields: [
				{ type: 'text', name: 'access_token' },
				{ type: 'text', name: 'refresh_token' },
				{ type: 'date', name: 'token_expiry' },
				{ type: 'text', name: 'code_verifier' }, // transient, during the OAuth handshake
				{ type: 'text', name: 'oauth_state' }, // transient, CSRF guard
				{ type: 'bool', name: 'connected' },
				{ type: 'date', name: 'last_sync' },
				{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
				{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
			]
		});
		app.save(etsy);
		// single row the app always updates
		app.save(new Record(etsy, { connected: false }));
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('etsy_auth'));
		} catch (_) {
			// already gone
		}
	}
);
