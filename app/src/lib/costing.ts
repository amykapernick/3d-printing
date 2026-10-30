// Pure costing helpers — no I/O, so they can be unit-tested and reused on both
// the server and the client. All money is in the configured currency's major unit.
// Electricity is deliberately not costed (solar).

/**
 * Filament saved by printing N copies on one plate instead of N separate plates:
 * each separate plate pays the purge/prime waste once, a shared plate pays it once total.
 */
export function wastageSaved(copies: number, purgePerPlateG: number): number {
	if (copies <= 1) return 0;
	return (copies - 1) * purgePerPlateG;
}

export interface MarginInput {
	salePrice: number;
	qty: number;
	filamentCost: number; // for one item
	consumablesCost: number; // for one item
	packaging: number; // per order
	shipping: number; // per order
	fees: number; // actual platform fees for the order
}

export interface MarginResult {
	revenue: number;
	cost: number;
	profit: number;
	marginPct: number;
	profitPerItem: number;
}

/** Margin for a sale of `qty` items. Per-item costs scale by qty; order costs don't. */
export function margin(input: MarginInput): MarginResult {
	const perItem = input.filamentCost + input.consumablesCost;
	const cost = perItem * input.qty + input.packaging + input.shipping + input.fees;
	const revenue = input.salePrice;
	const profit = revenue - cost;
	return {
		revenue,
		cost,
		profit,
		marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
		profitPerItem: input.qty > 0 ? profit / input.qty : 0
	};
}

// A model's plate with measured times at 1 / 2 / full (max_copies) copies.
export interface PlateTimes {
	max_copies: number;
	time_1: number;
	time_2: number;
	time_full: number;
}

/** Minutes for `c` copies on a single run of a plate (c ≤ max_copies), interpolating
 *  between the measured 1 / 2 / full points. */
function plateRunTime(p: PlateTimes, c: number): number {
	const t1 = p.time_1 || 0;
	const t2 = p.time_2 || t1;
	const tf = p.time_full || t2 || t1;
	const max = Math.max(1, p.max_copies || 1);
	if (c <= 1) return t1 || tf;
	if (c >= max) return tf;
	if (c <= 2) return t2;
	if (max <= 2) return tf;
	return t2 + ((tf - t2) * (c - 2)) / (max - 2); // linear between (2, t2) and (max, tf)
}

/** Minutes to make `copies` finished items from one plate, batching up to its capacity. */
export function plateTime(p: PlateTimes, copies: number): number {
	const max = Math.max(1, p.max_copies || 1);
	const fullRuns = Math.floor(copies / max);
	const rem = copies % max;
	return fullRuns * plateRunTime(p, max) + (rem > 0 ? plateRunTime(p, rem) : 0);
}

/** Total estimated minutes for the whole model (sum of its plates). */
export function modelTime(plates: PlateTimes[], copies: number): number {
	return plates.reduce((sum, p) => sum + plateTime(p, copies), 0);
}

/** Total plate-runs across all plates for `copies` items (for purge accounting). */
export function plateRuns(plates: PlateTimes[], copies: number): number {
	if (plates.length === 0) return 1;
	return plates.reduce((sum, p) => sum + Math.ceil((copies || 1) / Math.max(1, p.max_copies || 1)), 0);
}

/** Grams of one filament for `copies`: usage scales with copies, purge once per plate-run. */
export function filamentForCopies(
	gramsPerCopy: number,
	purgePerPlate: number,
	copies: number,
	runs: number
): number {
	return (gramsPerCopy || 0) * (copies || 1) + (purgePerPlate || 0) * runs;
}

/** Round grams up to whole rolls of the given roll size (for the order list). */
export function rollsNeeded(gramsShort: number, rollWeightG: number): number {
	if (gramsShort <= 0 || rollWeightG <= 0) return 0;
	return Math.ceil(gramsShort / rollWeightG);
}
