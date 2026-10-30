import type { RequestHandler } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { etsyConfigured, pkce, authUrl } from '#lib/server/etsy';
import { error, redirect } from '@sveltejs/kit';
import crypto from 'node:crypto';

// Begin the Etsy OAuth handshake: stash a PKCE verifier + CSRF state, then bounce to Etsy.
export const GET: RequestHandler = async ({ url }) => {
	if (!etsyConfigured()) throw error(400, 'Etsy is not configured (set ETSY_KEYSTRING + ETSY_SHOP_ID)');
	const pb = await adminPb();
	const { verifier, challenge } = pkce();
	const state = crypto.randomUUID();
	const row = await pb.collection('etsy_auth').getFirstListItem('');
	await pb.collection('etsy_auth').update(row.id, { code_verifier: verifier, oauth_state: state });
	throw redirect(302, authUrl(url.origin, state, challenge));
};
