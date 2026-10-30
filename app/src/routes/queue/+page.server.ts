import type { PageServerLoad, Actions } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { listFilaments, listSpools, useSpool } from '#lib/server/spoolman';
import { resolveRequirement } from '#lib/server/requirements';
import { modelTime, plateRuns, filamentForCopies } from '#lib/costing';
import { fail } from '@sveltejs/kit';
import type { Model, ModelFilament, ModelPlate, QueueItem } from '#lib/types';

type QueueRow = QueueItem & { expand?: { model?: Model } };

export const load: PageServerLoad = async () => {
	const pb = await adminPb();
	const [items, models, allPlates] = await Promise.all([
		pb.collection('queue').getFullList<QueueRow>({ sort: 'position', expand: 'model' }),
		pb.collection('models').getFullList<Model>({ sort: 'name' }),
		pb.collection('model_plates').getFullList<ModelPlate>({})
	]);
	const platesByModel = new Map<string, ModelPlate[]>();
	for (const p of allPlates) {
		const list = platesByModel.get(p.model) ?? [];
		list.push(p);
		platesByModel.set(p.model, list);
	}
	const rows = items.map((item) => {
		const plates = platesByModel.get(item.model) ?? [];
		return {
			item,
			plates: plateRuns(plates, item.copies),
			estMin: Math.round(modelTime(plates, item.copies))
		};
	});
	return { rows, models };
};

const n = (form: FormData, k: string) => Number(form.get(k) ?? 0);

/** Filament a queue item consumes. `totalGrams` is for the print-job record; `reqs`
 *  lists each requirement's candidate Spoolman filament ids + grams (for deduction,
 *  handling both specific filaments and general colour requirements). */
async function filamentDemand(
	item: QueueRow,
	runs: number,
	spoolmanFilaments: Awaited<ReturnType<typeof listFilaments>>
) {
	const pb = await adminPb();
	const fils = await pb
		.collection('model_filaments')
		.getFullList<ModelFilament>({ filter: `model="${item.model}"` });
	let totalGrams = 0;
	const reqs: { candidateIds: number[]; grams: number }[] = [];
	for (const f of fils) {
		const grams = filamentForCopies(f.usage ?? 0, f.purge ?? 0, item.copies, runs);
		totalGrams += grams;
		reqs.push({ candidateIds: resolveRequirement(f, spoolmanFilaments).candidateIds, grams });
	}
	return { totalGrams, reqs };
}

export const actions: Actions = {
	add: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const model = String(form.get('model') ?? '');
		if (!model) return fail(400, { error: 'Pick a model' });
		const last = await pb.collection('queue').getList(1, 1, { sort: '-position' });
		await pb.collection('queue').create({
			model,
			copies: n(form, 'copies') || 1,
			position: (last.items[0]?.position ?? 0) + 1,
			status: 'queued',
			print_type: String(form.get('print_type') ?? 'business')
		});
		return { saved: true };
	},

	save: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		await pb.collection('queue').update(id, {
			copies: n(form, 'copies') || 1,
			print_type: String(form.get('print_type') ?? 'business'),
			status: String(form.get('status') ?? 'queued')
		});
		return { saved: true };
	},

	move: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const dir = String(form.get('dir') ?? '');
		const items = await pb.collection('queue').getFullList<QueueItem>({ sort: 'position' });
		const idx = items.findIndex((i) => i.id === id);
		const swap = dir === 'up' ? idx - 1 : idx + 1;
		if (idx < 0 || swap < 0 || swap >= items.length) return { saved: true };
		await pb.collection('queue').update(items[idx].id, { position: items[swap].position });
		await pb.collection('queue').update(items[swap].id, { position: items[idx].position });
		return { saved: true };
	},

	complete: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const item = await pb.collection('queue').getOne<QueueRow>(id, { expand: 'model' });
		const plates = await pb
			.collection('model_plates')
			.getFullList<ModelPlate>({ filter: `model="${item.model}"` });
		const runs = plateRuns(plates, item.copies);

		let spoolmanWarning = '';
		let totalGrams = 0;
		try {
			const fils = await listFilaments();
			const result = await filamentDemand(item, runs, fils);
			totalGrams = result.totalGrams;
			// Local remaining map so overlapping requirements (e.g. two "yellow") don't over-spend a spool.
			const spools = await listSpools();
			const remaining = new Map(spools.map((s) => [s.id, s.remaining_weight ?? 0]));
			const spoolsByFil = new Map<number, typeof spools>();
			for (const s of spools)
				if (s.filament?.id != null) {
					const list = spoolsByFil.get(s.filament.id) ?? [];
					list.push(s);
					spoolsByFil.set(s.filament.id, list);
				}
			for (const req of result.reqs) {
				let left = req.grams;
				const candidates = req.candidateIds
					.flatMap((fid) => spoolsByFil.get(fid) ?? [])
					.sort((a, b) => (remaining.get(a.id) ?? 0) - (remaining.get(b.id) ?? 0));
				for (const spool of candidates) {
					if (left <= 0) break;
					const avail = remaining.get(spool.id) ?? 0;
					const take = Math.min(left, avail);
					if (take > 0) {
						await useSpool(spool.id, take);
						remaining.set(spool.id, avail - take);
						left -= take;
					}
				}
				if (left > 0.01) spoolmanWarning = 'Some filament exceeded available stock.';
			}
		} catch {
			spoolmanWarning = 'Spoolman unreachable — stock not deducted.';
			// still record the job with best-effort grams
			totalGrams = (await filamentDemand(item, runs, []).catch(() => ({ totalGrams: 0 }))).totalGrams;
		}

		await pb.collection('print_jobs').create({
			model: item.model,
			queue: item.id,
			completed_at: new Date().toISOString(),
			usage: Math.round(totalGrams * 100) / 100,
			duration: Math.round(modelTime(plates, item.copies)),
			print_type: item.print_type
		});
		await pb.collection('queue').update(id, { status: 'done' });
		return { saved: true, warning: spoolmanWarning || undefined };
	},

	remove: async ({ request }) => {
		const pb = await adminPb();
		const id = String((await request.formData()).get('id') ?? '');
		if (id) await pb.collection('queue').delete(id);
		return { saved: true };
	}
};
