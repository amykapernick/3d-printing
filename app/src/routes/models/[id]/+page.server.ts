import type { PageServerLoad, Actions } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import {
	listFilaments,
	listSpools,
	spoolCostPerGram,
	listVendors,
	createVendor,
	createFilament,
	externalLibraryLabels,
	externalMaterials,
	findCatalogByLabel,
	catalogLabel
} from '#lib/server/spoolman';
import { resolveRequirement, cpgFor } from '#lib/server/requirements';
import { modelTime } from '#lib/costing';
import { familyHex } from '#lib/colour';
import { error, fail, redirect } from '@sveltejs/kit';

const normHex = (h: string | null | undefined) => (h ? `#${h.replace(/^#/, '')}` : null);
import type { Model, ModelFilament, ModelPlate, ModelConsumable, Consumable, Settings } from '#lib/types';

export const load: PageServerLoad = async ({ params }) => {
	const pb = await adminPb();
	let model: Model;
	try {
		model = await pb.collection('models').getOne<Model>(params.id);
	} catch {
		throw error(404, 'Model not found');
	}

	const [filaments, plates, modelConsumables, consumables, settings] = await Promise.all([
		pb.collection('model_filaments').getFullList<ModelFilament>({ filter: `model="${params.id}"` }),
		pb.collection('model_plates').getFullList<ModelPlate>({ filter: `model="${params.id}"`, sort: 'position' }),
		pb
			.collection('model_consumables')
			.getFullList<ModelConsumable & { expand?: { consumable?: Consumable } }>({
				filter: `model="${params.id}"`,
				expand: 'consumable'
			}),
		pb.collection('consumables').getFullList<Consumable>({ sort: 'name' }),
		pb.collection('settings').getFirstListItem<Settings>('')
	]);

	// Spoolman filaments for the specific-filament dropdown + cost/stock lookups.
	let spoolmanFilaments: { id: number; label: string; costPerGram: number | null }[] = [];
	let fils: Awaited<ReturnType<typeof listFilaments>> = [];
	const cpg = new Map<number, number>();
	const stock = new Map<number, number>();
	const filHex = new Map<number, string | null>();
	try {
		const [f, spools] = await Promise.all([listFilaments(), listSpools()]);
		fils = f;
		for (const x of fils) filHex.set(x.id, normHex(x.color_hex));
		for (const s of spools) {
			if (s.filament?.id == null) continue;
			const c = spoolCostPerGram(s);
			if (c != null && !cpg.has(s.filament.id)) cpg.set(s.filament.id, c);
			stock.set(s.filament.id, (stock.get(s.filament.id) ?? 0) + (s.remaining_weight ?? 0));
		}
		spoolmanFilaments = fils.map((x) => ({
			id: x.id,
			label: x.name ?? (`${x.vendor?.name ?? ''} ${x.material ?? ''}`.trim() || `#${x.id}`),
			costPerGram: cpg.get(x.id) ?? null
		}));
	} catch {
		// Spoolman offline — editing still works, cost/availability just won't resolve
	}

	// Autocomplete sources: filaments (owned + full Spoolman catalog) and materials.
	let libraryLabels: string[] = [];
	let materials: string[] = [];
	try {
		libraryLabels = [
			...new Set([...spoolmanFilaments.map((f) => f.label), ...(await externalLibraryLabels())])
		].sort((a, b) => a.localeCompare(b));
		materials = [
			...new Set([
				...fils.map((f) => f.material).filter((m): m is string => Boolean(m)),
				...(await externalMaterials())
			])
		].sort((a, b) => a.localeCompare(b));
	} catch {
		libraryLabels = spoolmanFilaments.map((f) => f.label);
	}

	// Per-row resolution (handles both specific + general colour requirements).
	const rows = filaments.map((f) => {
		const resolved = resolveRequirement(f, fils);
		const availableG = resolved.candidateIds.reduce((s, id) => s + (stock.get(id) ?? 0), 0);
		const hex =
			f.match === 'general'
				? f.req_family
					? familyHex(f.req_family)
					: null
				: (filHex.get(f.spoolman_filament_id) ?? null);
		return {
			...f,
			matchCount: resolved.candidateIds.length,
			availableG: Math.round(availableG),
			hex
		};
	});

	const filamentCost = filaments.reduce((sum, f) => {
		const c = cpgFor(resolveRequirement(f, fils), cpg);
		return c != null ? sum + c * ((f.usage ?? 0) + (f.purge ?? 0)) : sum;
	}, 0);
	const consumablesCost = modelConsumables.reduce(
		(sum, mc) => sum + (mc.qty ?? 0) * (mc.expand?.consumable?.unit_cost ?? 0),
		0
	);

	return {
		model,
		filaments: rows,
		plates,
		modelConsumables,
		consumables,
		spoolmanFilaments,
		libraryLabels,
		materials,
		currency: settings.currency,
		cost: { filament: filamentCost, consumables: consumablesCost, total: filamentCost + consumablesCost },
		time: { perItem: Math.round(modelTime(plates, 1)) } // minutes for one finished item
	};
};

const n = (form: FormData, k: string) => Number(form.get(k) ?? 0);

const labelOf = (f: { id: number; name?: string; vendor?: { name?: string }; material?: string }) =>
	f.name ?? (`${f.vendor?.name ?? ''} ${f.material ?? ''}`.trim() || `#${f.id}`);

/** Resolve a typed filament label to a Spoolman id: an owned filament, or a catalog
 *  entry registered on the fly (0 spools). Returns 0 if blank/unmatched. */
async function resolveSpoolId(
	typed: string,
	owned?: Awaited<ReturnType<typeof listFilaments>>
): Promise<number> {
	const t = typed.trim();
	if (!t) return 0;
	const fils = owned ?? (await listFilaments().catch(() => []));
	const o = fils.find((x) => labelOf(x).toLowerCase() === t.toLowerCase());
	if (o) return o.id;
	const cat = await findCatalogByLabel(t).catch(() => null);
	if (!cat) return 0;
	const vendors = await listVendors().catch(() => []);
	const vendor =
		vendors.find((v) => v.name.toLowerCase() === cat.manufacturer.toLowerCase()) ??
		(await createVendor(cat.manufacturer));
	const created = await createFilament({
		name: catalogLabel(cat),
		vendor_id: vendor.id,
		material: cat.material,
		density: cat.density,
		diameter: 1.75,
		color_hex: cat.color_hex || undefined,
		weight: cat.weight,
		spool_weight: cat.spool_weight,
		settings_extruder_temp: cat.extruder_temp,
		settings_bed_temp: cat.bed_temp,
		external_id: cat.id
	});
	return created.id;
}

export const actions: Actions = {
	updateModel: async ({ request, params }) => {
		const pb = await adminPb();
		const form = await request.formData();
		try {
			const data = new FormData();
			data.set('name', String(form.get('name') ?? '').trim());
			data.set('source_url', String(form.get('source_url') ?? ''));
			data.set('notes', String(form.get('notes') ?? ''));
			const file = form.get('file');
			if (file instanceof File && file.size > 0) data.set('file', file);
			await pb.collection('models').update(params.id, data);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { saved: true };
	},

	saveFilament: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const match = String(form.get('match') ?? 'specific') === 'general' ? 'general' : 'specific';

		const spoolId = match === 'specific' ? await resolveSpoolId(String(form.get('spoolman_filament') ?? '')) : 0;

		const payload = {
			match,
			spoolman_filament_id: spoolId,
			req_family: match === 'general' ? String(form.get('req_family') ?? '') : '',
			req_shade: match === 'general' ? String(form.get('req_shade') ?? 'any') : 'any',
			req_material: match === 'general' ? String(form.get('req_material') ?? '').trim() : '',
			colour_label: String(form.get('colour_label') ?? ''),
			usage: n(form, 'usage'),
			purge: n(form, 'purge')
		};
		if (id) await pb.collection('model_filaments').update(id, payload);
		else await pb.collection('model_filaments').create({ ...payload, model: form.get('model') });
		return { saved: true };
	},

	// Save every filament row at once (parallel arrays, one per row, aligned by index).
	saveFilaments: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const ids = form.getAll('row_id').map(String);
		const matches = form.getAll('row_match').map(String);
		const labels = form.getAll('row_spoolman_filament').map(String);
		const fams = form.getAll('row_req_family').map(String);
		const shades = form.getAll('row_req_shade').map(String);
		const mats = form.getAll('row_req_material').map(String);
		const clabels = form.getAll('row_colour_label').map(String);
		const usages = form.getAll('row_usage');
		const purges = form.getAll('row_purge');
		const owned = await listFilaments().catch(() => []);
		for (let i = 0; i < ids.length; i++) {
			const match = matches[i] === 'general' ? 'general' : 'specific';
			const spoolId = match === 'specific' ? await resolveSpoolId(labels[i] ?? '', owned) : 0;
			await pb.collection('model_filaments').update(ids[i], {
				match,
				spoolman_filament_id: spoolId,
				req_family: match === 'general' ? String(fams[i] ?? '') : '',
				req_shade: match === 'general' ? String(shades[i] ?? 'any') || 'any' : 'any',
				req_material: match === 'general' ? String(mats[i] ?? '').trim() : '',
				colour_label: String(clabels[i] ?? ''),
				usage: Number(usages[i]) || 0,
				purge: Number(purges[i]) || 0
			});
		}
		return { saved: true };
	},

	bulkAddFilaments: async ({ request, params }) => {
		const pb = await adminPb();
		const text = String((await request.formData()).get('bulk') ?? '');
		let added = 0;
		for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
			// "label, grams, purge" — comma or whitespace separated; purge optional.
			const m = line.match(/^(.*?)[\s,]+([\d.]+)(?:[\s,]+([\d.]+))?\s*$/);
			if (!m) continue;
			await pb.collection('model_filaments').create({
				model: params.id,
				match: 'specific',
				spoolman_filament_id: 0,
				req_shade: 'any',
				colour_label: m[1].trim(),
				usage: Number(m[2]) || 0,
				purge: Number(m[3] ?? 0) || 0
			});
			added++;
		}
		return { bulkAdded: added };
	},

	deleteFilament: async ({ request }) => {
		const pb = await adminPb();
		const id = String((await request.formData()).get('id') ?? '');
		if (id) await pb.collection('model_filaments').delete(id);
		return { saved: true };
	},

	savePlate: async ({ request, params }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const payload = {
			max_copies: n(form, 'max_copies') || 1,
			time_1: n(form, 'time_1'),
			time_2: n(form, 'time_2'),
			time_full: n(form, 'time_full')
		};
		if (id) {
			await pb.collection('model_plates').update(id, payload);
		} else {
			const last = await pb
				.collection('model_plates')
				.getList(1, 1, { sort: '-position', filter: `model="${params.id}"` });
			await pb
				.collection('model_plates')
				.create({ ...payload, model: params.id, position: (last.items[0]?.position ?? 0) + 1 });
		}
		return { saved: true };
	},

	// Save every plate row at once (parallel arrays by index).
	savePlates: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const ids = form.getAll('pl_id').map(String);
		const maxs = form.getAll('pl_max');
		const t1 = form.getAll('pl_t1');
		const t2 = form.getAll('pl_t2');
		const tf = form.getAll('pl_tf');
		for (let i = 0; i < ids.length; i++) {
			await pb.collection('model_plates').update(ids[i], {
				max_copies: Number(maxs[i]) || 1,
				time_1: Number(t1[i]) || 0,
				time_2: Number(t2[i]) || 0,
				time_full: Number(tf[i]) || 0
			});
		}
		return { saved: true };
	},

	deletePlate: async ({ request }) => {
		const pb = await adminPb();
		const id = String((await request.formData()).get('id') ?? '');
		if (id) await pb.collection('model_plates').delete(id);
		return { saved: true };
	},

	addConsumable: async ({ request, params }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const consumable = String(form.get('consumable') ?? '');
		if (!consumable) return fail(400, { error: 'Pick a consumable' });
		await pb.collection('model_consumables').create({
			model: params.id,
			consumable,
			qty: n(form, 'qty') || 1
		});
		return { saved: true };
	},

	deleteConsumable: async ({ request }) => {
		const pb = await adminPb();
		const id = String((await request.formData()).get('id') ?? '');
		if (id) await pb.collection('model_consumables').delete(id);
		return { saved: true };
	},

	enqueue: async ({ request, params }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const last = await pb
			.collection('queue')
			.getList(1, 1, { sort: '-position', filter: 'status="queued"' });
		const position = (last.items[0]?.position ?? 0) + 1;
		await pb.collection('queue').create({
			model: params.id,
			copies: n(form, 'copies') || 1,
			position,
			status: 'queued',
			print_type: String(form.get('print_type') ?? 'business')
		});
		throw redirect(303, '/queue');
	},

	duplicate: async ({ params }) => {
		const pb = await adminPb();
		const src = await pb.collection('models').getOne<Model>(params.id);
		const copy = await pb.collection('models').create({
			name: `${src.name} (copy)`,
			source_url: src.source_url ?? '',
			notes: src.notes ?? ''
			// file + etsy_listing_id intentionally not copied
		});
		const [fils, plates, cons] = await Promise.all([
			pb.collection('model_filaments').getFullList<ModelFilament>({ filter: `model="${params.id}"` }),
			pb.collection('model_plates').getFullList<ModelPlate>({ filter: `model="${params.id}"` }),
			pb.collection('model_consumables').getFullList<ModelConsumable>({ filter: `model="${params.id}"` })
		]);
		for (const f of fils)
			await pb.collection('model_filaments').create({
				model: copy.id,
				match: f.match,
				spoolman_filament_id: f.spoolman_filament_id,
				req_family: f.req_family ?? '',
				req_shade: f.req_shade ?? 'any',
				req_material: f.req_material ?? '',
				colour_label: f.colour_label ?? '',
				usage: f.usage,
				purge: f.purge
			});
		for (const p of plates)
			await pb.collection('model_plates').create({
				model: copy.id,
				position: p.position,
				max_copies: p.max_copies,
				time_1: p.time_1,
				time_2: p.time_2,
				time_full: p.time_full
			});
		for (const c of cons)
			await pb.collection('model_consumables').create({ model: copy.id, consumable: c.consumable, qty: c.qty });
		throw redirect(303, `/models/${copy.id}`);
	},

	deleteModel: async ({ params }) => {
		const pb = await adminPb();
		await pb.collection('models').delete(params.id);
		throw redirect(303, '/models');
	}
};
