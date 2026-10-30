#!/bin/sh
set -e

# Apply the committed migrations first (creates the schema + seed row), then
# upsert the superuser the SvelteKit server authenticates as, then serve.
/pb/pocketbase migrate up --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations

if [ -n "$POCKETBASE_ADMIN_EMAIL" ] && [ -n "$POCKETBASE_ADMIN_PASSWORD" ]; then
	/pb/pocketbase superuser upsert "$POCKETBASE_ADMIN_EMAIL" "$POCKETBASE_ADMIN_PASSWORD" \
		--dir=/pb/pb_data
fi

exec /pb/pocketbase serve \
	--http=0.0.0.0:8090 \
	--dir=/pb/pb_data \
	--migrationsDir=/pb/pb_migrations \
	--hooksDir=/pb/pb_hooks
