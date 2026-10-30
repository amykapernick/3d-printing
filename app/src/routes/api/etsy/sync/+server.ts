import type { RequestHandler } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { syncReceipts } from '#lib/server/etsy';
import { error, json } from '@sveltejs/kit';
import { env } from 'node:process';

// Cron-callable Etsy import. If CRON_SECRET is set, callers must send a matching
// `x-cron-secret` header (the PocketBase cron hook does). Left open when unset (local).
export const POST: RequestHandler = async ({ request }) => {
	const secret = env.CRON_SECRET;
	if (secret && request.headers.get('x-cron-secret') !== secret) throw error(401, 'Unauthorized');
	const pb = await adminPb();
	try {
		return json(await syncReceipts(pb));
	} catch (e) {
		throw error(502, (e as Error).message);
	}
};
