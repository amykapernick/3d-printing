import PocketBase from 'pocketbase';
import { env } from 'node:process';

// Single shared client. PocketBase collection rules are locked to superusers only,
// so the SvelteKit server authenticates as a superuser on behalf of the single user.
// Tokens and the PocketBase URL never reach the browser. This is a server-only module,
// so it reads process.env directly — runtime config (e.g. in Docker) is never inlined.
const pb = new PocketBase(env.POCKETBASE_URL || 'http://127.0.0.1:8090');
pb.autoCancellation(false);

/** Returns an authenticated PocketBase client, re-authenticating if the token has lapsed. */
export async function adminPb(): Promise<PocketBase> {
	if (!pb.authStore.isValid) {
		await pb
			.collection('_superusers')
			.authWithPassword(
				env.POCKETBASE_ADMIN_EMAIL || 'admin@example.com',
				env.POCKETBASE_ADMIN_PASSWORD || 'changeme-please'
			);
	}
	return pb;
}
