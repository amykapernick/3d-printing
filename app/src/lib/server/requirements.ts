import { matchesGeneral, type ColourFamily, type GeneralReq, type Shade } from '#lib/colour';
import type { ModelFilament } from '#lib/types';
import type { SpoolmanFilament } from './spoolman';

// Resolve a model_filaments requirement (specific filament OR general colour) into the
// set of Spoolman filaments that can satisfy it, plus a human label and a grouping key.

export interface ResolvedReq {
	candidateIds: number[];
	label: string;
	key: string; // groups identical requirements across models (for the order list)
}

export function resolveRequirement(
	row: Pick<
		ModelFilament,
		'match' | 'spoolman_filament_id' | 'req_family' | 'req_shade' | 'req_material' | 'colour_label'
	>,
	filaments: SpoolmanFilament[]
): ResolvedReq {
	if (row.match === 'general' && row.req_family) {
		const req: GeneralReq = {
			family: row.req_family as ColourFamily,
			shade: (row.req_shade ?? 'any') as Shade,
			material: row.req_material || undefined
		};
		const candidateIds = filaments
			.filter((f) => matchesGeneral(req, { color_hex: f.color_hex, material: f.material }))
			.map((f) => f.id);
		const shade = req.shade && req.shade !== 'any' ? `${req.shade} ` : '';
		const label = `${shade}${req.family}${req.material ? ` ${req.material}` : ''}`.trim();
		return { candidateIds, label, key: `gen:${req.family}:${req.shade}:${req.material ?? ''}` };
	}
	// specific
	const id = row.spoolman_filament_id;
	const f = filaments.find((x) => x.id === id);
	return {
		candidateIds: id ? [id] : [],
		label: f?.name ?? row.colour_label ?? (id ? `#${id}` : 'unmapped'),
		key: `fil:${id}`
	};
}

/** Total available grams across a requirement's candidate filaments. */
export const stockFor = (r: ResolvedReq, stockByFil: Map<number, number>) =>
	r.candidateIds.reduce((sum, id) => sum + (stockByFil.get(id) ?? 0), 0);

/** Representative cost/gram for a requirement — the cheapest matching in-stock filament. */
export function cpgFor(r: ResolvedReq, cpgByFil: Map<number, number>): number | null {
	const vals = r.candidateIds
		.map((id) => cpgByFil.get(id))
		.filter((v): v is number => v != null);
	return vals.length ? Math.min(...vals) : null;
}
