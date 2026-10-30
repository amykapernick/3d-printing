import type { RequestHandler } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { exchangeCode } from '#lib/server/etsy';
import { error, redirect } from '@sveltejs/kit';

// Etsy redirects here with ?code & ?state. Verify state, exchange the code for tokens, store them.
export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const pb = await adminPb();
	const row = await pb.collection('etsy_auth').getFirstListItem<{ id: string; oauth_state: string; code_verifier: string }>('');

	if (!code || !state || state !== row.oauth_state) throw error(400, 'Invalid OAuth state');

	const t = await exchangeCode(url.origin, code, row.code_verifier);
	await pb.collection('etsy_auth').update(row.id, {
		access_token: t.access_token,
		refresh_token: t.refresh_token,
		token_expiry: new Date(Date.now() + t.expires_in * 1000).toISOString(),
		connected: true,
		code_verifier: '',
		oauth_state: ''
	});
	throw redirect(303, '/sales?etsy=connected');
};
