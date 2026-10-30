import type { PageServerLoad } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { listFilaments, listSpools, spoolCostPerGram } from '#lib/server/spoolman';
import { resolveRequirement } from '#lib/server/requirements';
import { rollsNeeded, filamentForCopies, plateRuns } from '#lib/costing';
import type { Model, ModelFilament, ModelPlate, QueueItem, Settings } from '#lib/types';

export const load: PageServerLoad = async () => {
	const pb = await adminPb();
	const settings = await pb.collection('settings').getFirstListItem<Settings>('');

	const queued = await pb
		.collection('queue')
		.getFullList<QueueItem & { expand?: { model?: Model } }>({
			filter: 'status="queued" || status="printing"',
			expand: 'model'
		});

	let spoolmanUp = true;
	let fils: Awaited<ReturnType<typeof listFilaments>> = [];
	const availByFil = new Map<number, number>();
	const cpgByFil = new Map<number, number>();
	try {
		const spools = await listSpools();
		fils = await listFilaments();
		for (const s of spools) {
			if (s.filament?.id == null) continue;
			availByFil.set(s.filament.id, (availByFil.get(s.filament.id) ?? 0) + (s.remaining_weight ?? 0));
			const c = spoolCostPerGram(s);
			if (c != null && !cpgByFil.has(s.filament.id)) cpgByFil.set(s.filament.id, c);
		}
	} catch {
		spoolmanUp = false;
	}

	// Accumulate demand per requirement (specific filament or general colour spec).
	const demand = new Map<string, { label: string; grams: number; candidateIds: number[]; general: boolean }>();
	let unmappedDemand = false;
	for (const item of queued) {
		const [rows, plates] = await Promise.all([
			pb.collection('model_filaments').getFullList<ModelFilament>({ filter: `model="${item.model}"` }),
			pb.collection('model_plates').getFullList<ModelPlate>({ filter: `model="${item.model}"` })
		]);
		const runs = plateRuns(plates, item.copies);
		for (const row of rows) {
			const grams = filamentForCopies(row.usage ?? 0, row.purge ?? 0, item.copies, runs);
			const r = resolveRequirement(row, fils);
			if (r.candidateIds.length === 0) {
				unmappedDemand = true;
				continue;
			}
			const entry = demand.get(r.key) ?? {
				label: r.label,
				grams: 0,
				candidateIds: r.candidateIds,
				general: r.key.startsWith('gen:')
			};
			entry.grams += grams;
			demand.set(r.key, entry);
		}
	}

	const rows = [...demand.entries()].map(([key, d]) => {
		const availableG = d.candidateIds.reduce((s, id) => s + (availByFil.get(id) ?? 0), 0);
		const shortfallG = Math.max(0, d.grams - availableG);
		const specificFil = !d.general && d.candidateIds.length === 1 ? fils.find((f) => f.id === d.candidateIds[0]) : null;
		const rollWeightG = specificFil?.weight ?? 1000;
		const rolls = rollsNeeded(shortfallG, rollWeightG);
		const cpgs = d.candidateIds.map((id) => cpgByFil.get(id)).filter((v): v is number => v != null);
		const cpg = cpgs.length ? Math.min(...cpgs) : null;
		const pricePerRoll = specificFil?.price ?? (cpg != null ? cpg * rollWeightG : 0);
		return {
			key,
			name: d.label,
			hex: specificFil?.color_hex ? `#${specificFil.color_hex.replace(/^#/, '')}` : null,
			general: d.general,
			demandG: Math.round(d.grams),
			availableG: Math.round(availableG),
			shortfallG: Math.round(shortfallG),
			rolls,
			rollWeightG,
			estCost: pricePerRoll ? Math.round(rolls * pricePerRoll * 100) / 100 : null,
			flag: availableG <= 0 ? 'out' : availableG < d.grams ? 'low' : 'ok'
		};
	});
	rows.sort((a, b) => b.shortfallG - a.shortfallG);

	return { rows, spoolmanUp, unmappedDemand, currency: settings.currency };
};
