import { env } from 'node:process';

// Spoolman is the source of truth for filament/spool stock and cost-per-gram.
// It exposes a REST API at /api/v1. We only ever talk to it server-side so the
// browser never needs to know where Spoolman lives.
const base = (env.SPOOLMAN_URL || 'http://127.0.0.1:7912').replace(/\/$/, '');
const api = `${base}/api/v1`;

export interface SpoolmanVendor {
	id: number;
	name: string;
}

export interface SpoolmanFilament {
	id: number;
	name?: string;
	vendor?: SpoolmanVendor;
	material?: string;
	color_hex?: string;
	price?: number;
	density?: number;
	weight?: number; // net filament weight of a full spool, grams
	spool_weight?: number; // empty spool weight, grams
}

export interface SpoolmanSpool {
	id: number;
	filament: SpoolmanFilament;
	remaining_weight?: number; // grams
	used_weight?: number; // grams
	initial_weight?: number; // grams
	price?: number; // price paid for this spool
	location?: string;
	lot_nr?: string;
	archived?: boolean;
}

async function spoolmanFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${api}${path}`, {
		...init,
		headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
	});
	if (!res.ok) {
		throw new Error(`Spoolman ${res.status} ${res.statusText} on ${path}`);
	}
	return res.json() as Promise<T>;
}

export const listFilaments = () => spoolmanFetch<SpoolmanFilament[]>('/filament');

export const listSpools = (opts: { allowArchived?: boolean } = {}) =>
	spoolmanFetch<SpoolmanSpool[]>(`/spool?allow_archived=${opts.allowArchived ? 'true' : 'false'}`);

export const getFilament = (id: number) => spoolmanFetch<SpoolmanFilament>(`/filament/${id}`);

/** Spools of a given filament, most-used-last so we consume the oldest/most-depleted first. */
export async function spoolsForFilament(filamentId: number): Promise<SpoolmanSpool[]> {
	const all = await listSpools();
	return all
		.filter((s) => s.filament?.id === filamentId && !s.archived)
		.sort((a, b) => (a.remaining_weight ?? 0) - (b.remaining_weight ?? 0));
}

/** Deduct `grams` of use from a spool (Spoolman tracks remaining/used weight). */
export const useSpool = (spoolId: number, grams: number) =>
	spoolmanFetch<SpoolmanSpool>(`/spool/${spoolId}/use`, {
		method: 'PUT',
		body: JSON.stringify({ use_weight: grams })
	});

// --- writes used by the CSV purchase importer -------------------------------
export const listVendors = () => spoolmanFetch<SpoolmanVendor[]>('/vendor');

export const createVendor = (name: string) =>
	spoolmanFetch<SpoolmanVendor>('/vendor', { method: 'POST', body: JSON.stringify({ name }) });

export interface NewFilament {
	name: string;
	vendor_id: number;
	material?: string;
	density?: number;
	diameter?: number;
	color_hex?: string;
	weight?: number;
	spool_weight?: number;
	settings_extruder_temp?: number;
	settings_bed_temp?: number;
	external_id?: string;
}
export const createFilament = (data: NewFilament) =>
	spoolmanFetch<SpoolmanFilament>('/filament', { method: 'POST', body: JSON.stringify(data) });

export interface NewSpool {
	filament_id: number;
	price?: number;
	initial_weight?: number;
	first_used?: string | null;
	lot_nr?: string;
	comment?: string;
}
export const createSpool = (data: NewSpool) =>
	spoolmanFetch<SpoolmanSpool>('/spool', { method: 'POST', body: JSON.stringify(data) });

export interface FilamentPatch {
	color_hex?: string;
	density?: number;
	spool_weight?: number;
	settings_extruder_temp?: number;
	settings_bed_temp?: number;
	external_id?: string;
}
export const updateFilament = (id: number, patch: FilamentPatch) =>
	spoolmanFetch<SpoolmanFilament>(`/filament/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(patch)
	});

// Spoolman bundles a catalog (SpoolmanDB) of known filaments, including Bambu Lab,
// each with a colour hex / density / temps. Used to enrich imported filaments.
export interface ExternalFilament {
	id: string;
	manufacturer: string;
	name: string;
	material: string;
	density?: number;
	diameter?: number;
	weight?: number;
	spool_weight?: number;
	color_hex?: string | null;
	extruder_temp?: number;
	bed_temp?: number;
}
export const listExternalFilaments = () =>
	spoolmanFetch<ExternalFilament[]>('/external/filament');

// The external catalog (SpoolmanDB) is ~8k entries and rarely changes, so cache it.
let _catalog: { at: number; data: ExternalFilament[] } | null = null;
async function externalCatalog(): Promise<ExternalFilament[]> {
	if (_catalog && Date.now() - _catalog.at < 10 * 60 * 1000) return _catalog.data;
	try {
		_catalog = { at: Date.now(), data: await listExternalFilaments() };
	} catch {
		_catalog = _catalog ?? { at: Date.now(), data: [] };
	}
	return _catalog.data;
}

export const catalogLabel = (e: ExternalFilament) =>
	`${e.manufacturer} ${e.material} ${e.name}`.replace(/\s+/g, ' ').trim();

/** De-duped labels for every 1.75mm filament in the catalog (for the autocomplete). */
export async function externalLibraryLabels(): Promise<string[]> {
	const set = new Set<string>();
	for (const e of await externalCatalog()) {
		if (e.diameter != null && e.diameter !== 1.75) continue;
		const l = catalogLabel(e);
		if (l) set.add(l);
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}

/** Distinct material names across the catalog (PLA, PETG, ABS, …), for the material autocomplete. */
export async function externalMaterials(): Promise<string[]> {
	const set = new Set<string>();
	for (const e of await externalCatalog()) if (e.material) set.add(e.material);
	return [...set].sort((a, b) => a.localeCompare(b));
}

export async function findCatalogByLabel(label: string): Promise<ExternalFilament | null> {
	const t = label.toLowerCase();
	return (
		(await externalCatalog()).find(
			(e) => catalogLabel(e).toLowerCase() === t && (e.diameter == null || e.diameter === 1.75)
		) ?? null
	);
}

/**
 * Best catalog match for a (material, colour-name) pair. The catalog's `name` is the
 * colour (e.g. "Matte Ash Gray"); a filament's full name ("PLA Matte Matte Ash Gray")
 * ends with it, so we match the longest catalog name that's a suffix of `fullName`,
 * preferring same-material entries.
 */
export function matchExternal(
	entries: ExternalFilament[],
	material: string,
	fullName: string
): ExternalFilament | null {
	const lname = fullName.toLowerCase();
	const lmat = material.toLowerCase();
	const candidates = entries
		.filter((e) => e.manufacturer === 'Bambu Lab' && e.color_hex)
		.filter((e) => lname.endsWith(e.name.toLowerCase()))
		.sort((a, b) => b.name.length - a.name.length);
	return (
		candidates.find((e) => e.material.toLowerCase() === lmat) ?? candidates[0] ?? null
	);
}

/** True if Spoolman answers. Used by the dashboard/health check. */
export async function spoolmanHealthy(): Promise<boolean> {
	try {
		const res = await fetch(`${base}/api/v1/info`);
		return res.ok;
	} catch {
		return false;
	}
}

/** Cost per gram for a spool, derived from what was actually paid. */
export function spoolCostPerGram(spool: SpoolmanSpool): number | null {
	const total = spool.initial_weight ?? spool.filament?.weight;
	const price = spool.price ?? spool.filament?.price;
	if (!total || price == null) return null;
	return price / total;
}
