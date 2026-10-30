import type { PageServerLoad, Actions } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { parseThreeMf, aggregateBySlot } from '#lib/server/threemf';
import { listFilaments, listSpools } from '#lib/server/spoolman';
import { resolveRequirement } from '#lib/server/requirements';
import { modelTime } from '#lib/costing';
import { familyHex, matchPct } from '#lib/colour';
import { fail, redirect } from '@sveltejs/kit';
import type { Model, ModelFilament, ModelPlate, ModelConsumable, Consumable } from '#lib/types';

const normHex = (h: string | null | undefined) => (h ? `#${h.replace(/^#/, '')}` : null);

type MC = ModelConsumable & { expand?: { consumable?: Consumable } };

export const load: PageServerLoad = async () => {
	const pb = await adminPb();
	const [models, allFilaments, allPlates, allConsumables, consumables] = await Promise.all([
		pb.collection('models').getFullList<Model>({ sort: 'name' }),
		pb.collection('model_filaments').getFullList<ModelFilament>({}),
		pb.collection('model_plates').getFullList<ModelPlate>({}),
		pb.collection('model_consumables').getFullList<MC>({ expand: 'consumable' }),
		pb.collection('consumables').getFullList<Consumable>({ sort: 'name' })
	]);

	const byModel = new Map<string, ModelFilament[]>();
	for (const f of allFilaments) {
		const list = byModel.get(f.model) ?? [];
		list.push(f);
		byModel.set(f.model, list);
	}
	const platesByModel = new Map<string, ModelPlate[]>();
	for (const p of allPlates) {
		const list = platesByModel.get(p.model) ?? [];
		list.push(p);
		platesByModel.set(p.model, list);
	}
	const consByModel = new Map<string, MC[]>();
	for (const mc of allConsumables) {
		const list = consByModel.get(mc.model) ?? [];
		list.push(mc);
		consByModel.set(mc.model, list);
	}

	// Spoolman filaments: name, hex, remaining stock.
	const fil = new Map<number, { label: string; hex: string | null; remaining: number }>();
	let spoolmanUp = true;
	let fils: Awaited<ReturnType<typeof listFilaments>> = [];
	try {
		const [f, spools] = await Promise.all([listFilaments(), listSpools()]);
		fils = f;
		for (const x of fils)
			fil.set(x.id, {
				label: x.name ?? (`${x.vendor?.name ?? ''} ${x.material ?? ''}`.trim() || `#${x.id}`),
				hex: normHex(x.color_hex),
				remaining: 0
			});
		for (const s of spools) {
			const id = s.filament?.id;
			if (id != null && fil.has(id)) fil.get(id)!.remaining += s.remaining_weight ?? 0;
		}
	} catch {
		spoolmanUp = false;
	}

	// In-stock filaments, for suggesting alternatives by colour match.
	const inStock = [...fil.entries()]
		.filter(([, v]) => v.remaining > 0 && v.hex)
		.map(([id, v]) => ({ id, ...v }));

	const usedFilaments = new Map<number, string>();
	const rows = models.map((m) => {
		const modelFils = byModel.get(m.id) ?? [];
		const candidateIds = new Set<number>();
		let hasUnmapped = false;
		let printable = modelFils.length > 0;

		const needs = modelFils.map((row) => {
			const r = resolveRequirement(row, fils);
			const usage = row.usage ?? 0;
			const availableG = r.candidateIds.reduce((s, id) => s + (fil.get(id)?.remaining ?? 0), 0);
			const available = r.candidateIds.length > 0 && availableG >= usage;
			if (r.candidateIds.length === 0) hasUnmapped = true;
			if (!available) printable = false;
			for (const id of r.candidateIds) candidateIds.add(id);

			const general = row.match === 'general';
			const hex = general
				? row.req_family
					? familyHex(row.req_family)
					: null
				: (fil.get(row.spoolman_filament_id)?.hex ?? null);

			const alternatives = inStock
				.filter((a) => !r.candidateIds.includes(a.id))
				.map((a) => ({ label: a.label, hex: a.hex, pct: matchPct(hex, a.hex), remaining: Math.round(a.remaining) }))
				.sort((x, y) => y.pct - x.pct)
				.slice(0, 5);

			return {
				label: r.label,
				hex,
				general,
				available,
				availableG: Math.round(availableG),
				usage,
				alternatives
			};
		});

		const filamentIds = [...candidateIds];
		for (const id of filamentIds) usedFilaments.set(id, fil.get(id)?.label ?? `#${id}`);

		// Consumables: count + whether each is in stock (stock_qty ≥ qty needed).
		const mcs = consByModel.get(m.id) ?? [];
		const cons = mcs.map((mc) => {
			const qty = mc.qty ?? 0;
			const have = mc.expand?.consumable?.stock_qty ?? 0;
			return { name: mc.expand?.consumable?.name ?? 'removed', qty, have, ok: have >= qty };
		});

		return {
			id: m.id,
			name: m.name,
			total_time: Math.round(modelTime(platesByModel.get(m.id) ?? [], 1)),
			filamentCount: modelFils.length,
			filamentIds,
			needs,
			consumableCount: cons.length,
			consumablesOk: cons.every((c) => c.ok),
			consumablesInfo: cons.map((c) => `${c.name} ${c.have}/${c.qty}`).join(', '),
			hasUnmapped,
			printable,
			hasFile: Boolean(m.file)
		};
	});

	const filterFilaments = [...usedFilaments.entries()]
		.map(([id, label]) => ({ id, label }))
		.sort((a, b) => a.label.localeCompare(b.label));

	return { rows, filterFilaments, consumables, spoolmanUp };
};

export const actions: Actions = {
	// Bulk-add selected models to the queue with a shared copies count + type.
	queueSelected: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const ids = form.getAll('selected').map(String).filter(Boolean);
		if (ids.length === 0) return fail(400, { error: 'Select at least one model' });
		const copies = Number(form.get('copies')) || 1;
		const print_type = String(form.get('print_type') ?? 'business');
		let pos = (await pb.collection('queue').getList(1, 1, { sort: '-position' })).items[0]?.position ?? 0;
		for (const model of ids) {
			pos++;
			await pb.collection('queue').create({ model, copies, position: pos, status: 'queued', print_type });
		}
		throw redirect(303, '/queue');
	},

	create: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required' });

		const data = new FormData();
		data.set('name', name);
		data.set('source_url', String(form.get('source_url') ?? ''));
		data.set('notes', String(form.get('notes') ?? ''));

		const file = form.get('file');
		let parsed: ReturnType<typeof parseThreeMf> | null = null;
		if (file instanceof File && file.size > 0) {
			data.set('file', file);
			if (file.name.toLowerCase().endsWith('.3mf')) {
				try {
					parsed = parseThreeMf(new Uint8Array(await file.arrayBuffer()));
				} catch {
					// not a parseable 3mf — keep the file, skip auto-fill
				}
			}
		}

		let modelId: string;
		try {
			const model = await pb.collection('models').create(data);
			modelId = model.id;
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}

		// Plates entered in the modal (parallel arrays by row).
		const num = (v: FormDataEntryValue) => Number(v) || 0;
		const pMax = form.getAll('plate_max_copies');
		const pT1 = form.getAll('plate_time_1');
		const pT2 = form.getAll('plate_time_2');
		const pTf = form.getAll('plate_time_full');
		let manualPlates = 0;
		for (let i = 0; i < pMax.length; i++) {
			const max = num(pMax[i]);
			const t1 = num(pT1[i]);
			const t2 = num(pT2[i]);
			const tf = num(pTf[i]);
			if (!max && !t1 && !t2 && !tf) continue; // skip blank rows
			await pb.collection('model_plates').create({
				model: modelId,
				position: manualPlates + 1,
				max_copies: max || 1,
				time_1: t1,
				time_2: t2,
				time_full: tf
			});
			manualPlates++;
		}

		// Filaments entered in the modal as a bulk textarea: "label, usage, purge" per line.
		let manualFils = 0;
		for (const line of String(form.get('fil_bulk') ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
			const mm = line.match(/^(.*?)[\s,]+([\d.]+)(?:[\s,]+([\d.]+))?\s*$/);
			if (!mm) continue;
			await pb.collection('model_filaments').create({
				model: modelId,
				match: 'specific',
				spoolman_filament_id: 0,
				req_shade: 'any',
				colour_label: mm[1].trim(),
				usage: Number(mm[2]) || 0,
				purge: Number(mm[3] ?? 0) || 0
			});
			manualFils++;
		}

		// Consumables chosen in the modal (existing consumable + qty).
		const mcId = form.getAll('mc_consumable');
		const mcQty = form.getAll('mc_qty');
		for (let i = 0; i < mcId.length; i++) {
			const consumable = String(mcId[i] ?? '');
			if (!consumable) continue;
			await pb.collection('model_consumables').create({
				model: modelId,
				consumable,
				qty: num(mcQty[i]) || 1
			});
		}

		// Fall back to the sliced .3mf for any section the user left empty.
		if (parsed && manualPlates === 0) {
			for (let i = 0; i < parsed.plates.length; i++) {
				const min = Math.round(parsed.plates[i].predictionSec / 60);
				await pb.collection('model_plates').create({
					model: modelId,
					position: i + 1,
					max_copies: 1,
					time_1: min,
					time_2: min,
					time_full: min
				});
			}
		}
		if (parsed && manualFils === 0) {
			const slots = aggregateBySlot(parsed);
			const purgePer = slots.length ? parsed.flushG / slots.length : 0;
			for (const s of slots) {
				await pb.collection('model_filaments').create({
					model: modelId,
					spoolman_filament_id: 0,
					colour_label: `${s.type} ${s.color}`.trim(),
					usage: Math.round(s.usedG * 100) / 100,
					purge: Math.round(purgePer * 100) / 100
				});
			}
		}

		throw redirect(303, `/models/${modelId}`);
	}
};
