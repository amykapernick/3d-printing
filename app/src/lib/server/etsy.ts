import { env } from 'node:process';
import crypto from 'node:crypto';
import type PocketBase from 'pocketbase';
import type { Model, Settings } from '#lib/types';

// Etsy Open API v3, OAuth 2.0 with PKCE (no client secret). Server-side only.
// Config via .env: ETSY_KEYSTRING (your app's keystring = client_id) and
// ETSY_SHOP_ID. The redirect URI defaults to <origin>/auth/etsy/callback and must
// be registered on your Etsy app; override with ETSY_REDIRECT_URI if needed.

const KEY = env.ETSY_KEYSTRING ?? '';
const SHOP = env.ETSY_SHOP_ID ?? '';
const SCOPES = 'listings_r shops_r transactions_r';

export const etsyConfigured = () => Boolean(KEY && SHOP);

export const redirectUri = (origin: string) =>
	env.ETSY_REDIRECT_URI || `${origin}/auth/etsy/callback`;

const b64url = (buf: Buffer) => buf.toString('base64url');

export function pkce() {
	const verifier = b64url(crypto.randomBytes(32));
	const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
	return { verifier, challenge };
}

export function authUrl(origin: string, state: string, challenge: string) {
	const p = new URLSearchParams({
		response_type: 'code',
		client_id: KEY,
		redirect_uri: redirectUri(origin),
		scope: SCOPES,
		state,
		code_challenge: challenge,
		code_challenge_method: 'S256'
	});
	return `https://www.etsy.com/oauth/connect?${p}`;
}

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
	const res = await fetch('https://api.etsy.com/v3/public/oauth/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body)
	});
	if (!res.ok) throw new Error(`Etsy token ${res.status}: ${await res.text()}`);
	return res.json() as Promise<TokenResponse>;
}

export const exchangeCode = (origin: string, code: string, verifier: string) =>
	tokenRequest({
		grant_type: 'authorization_code',
		client_id: KEY,
		redirect_uri: redirectUri(origin),
		code,
		code_verifier: verifier
	});

export const refreshTokens = (refreshToken: string) =>
	tokenRequest({ grant_type: 'refresh_token', client_id: KEY, refresh_token: refreshToken });

interface EtsyAuth {
	id: string;
	access_token: string;
	refresh_token: string;
	token_expiry: string;
	connected: boolean;
}

const authRow = (pb: PocketBase) => pb.collection('etsy_auth').getFirstListItem<EtsyAuth>('');

/** Returns a valid access token, refreshing and persisting if it's near expiry. */
async function validAccessToken(pb: PocketBase): Promise<string> {
	const row = await authRow(pb);
	if (!row.access_token) throw new Error('Etsy is not connected');
	const exp = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
	if (Date.now() < exp - 60_000) return row.access_token;
	const t = await refreshTokens(row.refresh_token);
	await pb.collection('etsy_auth').update(row.id, {
		access_token: t.access_token,
		refresh_token: t.refresh_token,
		token_expiry: new Date(Date.now() + t.expires_in * 1000).toISOString()
	});
	return t.access_token;
}

async function apiGet<T>(pb: PocketBase, path: string): Promise<T> {
	const token = await validAccessToken(pb);
	const res = await fetch(`https://api.etsy.com/v3/application${path}`, {
		headers: { 'x-api-key': KEY, Authorization: `Bearer ${token}` }
	});
	if (!res.ok) throw new Error(`Etsy ${res.status}: ${await res.text()}`);
	return res.json() as Promise<T>;
}

interface EtsyMoney {
	amount: number;
	divisor: number;
}
interface EtsyTransaction {
	listing_id: number;
	quantity: number;
	price: EtsyMoney;
}
interface EtsyReceipt {
	receipt_id: number;
	create_timestamp: number;
	transactions: EtsyTransaction[];
}

const money = (m: EtsyMoney | undefined) => (m && m.divisor ? m.amount / m.divisor : 0);

/** Pull recent paid receipts and create a `sales` row per transaction that maps to a
 *  model (by etsy_listing_id), skipping ones already imported (by receipt id). */
export async function syncReceipts(pb: PocketBase, limit = 100) {
	const [settings, models] = await Promise.all([
		pb.collection('settings').getFirstListItem<Settings>(''),
		pb.collection('models').getFullList<Model>({ filter: 'etsy_listing_id != ""' })
	]);
	const byListing = new Map<string, Model>();
	for (const m of models) if (m.etsy_listing_id) byListing.set(String(m.etsy_listing_id), m);

	const data = await apiGet<{ results: EtsyReceipt[] }>(
		pb,
		`/shops/${SHOP}/receipts?limit=${limit}&was_paid=true`
	);

	let imported = 0;
	let skipped = 0;
	for (const receipt of data.results ?? []) {
		for (const tx of receipt.transactions ?? []) {
			const model = byListing.get(String(tx.listing_id));
			if (!model) {
				skipped++;
				continue;
			}
			const existing = await pb
				.collection('sales')
				.getList(1, 1, { filter: `etsy_receipt_id="${receipt.receipt_id}" && model="${model.id}"` });
			if (existing.totalItems > 0) {
				skipped++;
				continue;
			}
			const price = money(tx.price) * (tx.quantity || 1);
			await pb.collection('sales').create({
				model: model.id,
				qty: tx.quantity || 1,
				price,
				// Etsy's exact per-order fees need the ledger API; estimate from the configured
				// platform fee % until that's wired up.
				fees: Math.round(price * ((settings.platform_fee_pct ?? 0) / 100) * 100) / 100,
				packaging_cost: settings.packaging_default_cost ?? 0,
				shipping_cost: 0,
				channel: 'etsy',
				sold_at: new Date(receipt.create_timestamp * 1000).toISOString(),
				etsy_receipt_id: String(receipt.receipt_id)
			});
			imported++;
		}
	}

	await pb.collection('etsy_auth').update((await authRow(pb)).id, {
		last_sync: new Date().toISOString()
	});
	return { imported, skipped };
}

export async function etsyStatus(pb: PocketBase) {
	try {
		const row = await authRow(pb);
		return { connected: Boolean(row.connected && row.access_token), lastSync: (row as EtsyAuth & { last_sync?: string }).last_sync ?? null };
	} catch {
		return { connected: false, lastSync: null };
	}
}
