import type PocketBase from 'pocketbase';
import { listFilaments, listSpools, spoolCostPerGram, type SpoolmanFilament } from './spoolman';
import { resolveRequirement, cpgFor } from './requirements';
import type { ModelFilament, ModelConsumable, Consumable } from '#lib/types';

export interface Pricing {
	cpg: Map<number, number>; // Spoolman filament id -> cost per gram
	filaments: SpoolmanFilament[]; // for resolving general colour requirements
}

/** Cost/gram per filament + the filament list, for costing (incl. general requirements). */
export async function pricingContext(): Promise<Pricing> {
	const cpg = new Map<number, number>();
	let filaments: SpoolmanFilament[] = [];
	try {
		const [spools, fils] = await Promise.all([listSpools(), listFilaments()]);
		filaments = fils;
		for (const s of spools) {
			const c = spoolCostPerGram(s);
			if (c != null && s.filament?.id != null && !cpg.has(s.filament.id)) cpg.set(s.filament.id, c);
		}
	} catch {
		// Spoolman offline — costs resolve to 0
	}
	return { cpg, filaments };
}

export interface UnitCost {
	filament: number;
	consumables: number;
	total: number;
}

/** Per-item cost of a model: filament (usage × cost/g, purge excluded as plate wastage)
 *  plus consumables (qty × unit cost). General colour requirements use the cheapest
 *  matching in-stock filament's cost/g. */
export async function modelUnitCost(
	pb: PocketBase,
	modelId: string,
	pricing: Pricing
): Promise<UnitCost> {
	const [fils, cons] = await Promise.all([
		pb.collection('model_filaments').getFullList<ModelFilament>({ filter: `model="${modelId}"` }),
		pb
			.collection('model_consumables')
			.getFullList<ModelConsumable & { expand?: { consumable?: Consumable } }>({
				filter: `model="${modelId}"`,
				expand: 'consumable'
			})
	]);
	const filament = fils.reduce((sum, f) => {
		const c = cpgFor(resolveRequirement(f, pricing.filaments), pricing.cpg);
		return c != null ? sum + c * (f.usage ?? 0) : sum;
	}, 0);
	const consumables = cons.reduce(
		(sum, mc) => sum + (mc.qty ?? 0) * (mc.expand?.consumable?.unit_cost ?? 0),
		0
	);
	return { filament, consumables, total: filament + consumables };
}
