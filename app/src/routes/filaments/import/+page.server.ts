import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { parseCsv } from '#lib/csv';
import { parseBambuInvoice, pdfToText } from '#lib/server/bambuInvoice';
import {
	spoolmanHealthy,
	listVendors,
	listFilaments,
	listSpools,
	createVendor,
	createFilament,
	createSpool,
	updateFilament,
	listExternalFilaments,
	matchExternal,
	type SpoolmanFilament,
	type ExternalFilament
} from '#lib/server/spoolman';

export const load: PageServerLoad = async () => ({ spoolmanUp: await spoolmanHealthy() });

const DENSITY: Record<string, number> = {
	PLA: 1.24,
	PETG: 1.27,
	ABS: 1.04,
	ASA: 1.07,
	TPU: 1.21,
	PC: 1.2,
	PA: 1.15,
	PVA: 1.23
};

interface ImportRow {
	name: string;
	vendor: string;
	material: string;
	colorHex?: string;
	weight: number;
	spoolWeight: number;
	price: number;
	qty: number;
	note?: string;
	lot?: string;
}

const inferMaterial = (name: string) =>
	Object.keys(DENSITY).find((m) => name.toUpperCase().includes(m)) ?? 'PLA';

const pick = (row: Record<string, string>, ...keys: string[]) => {
	for (const k of keys) if (row[k]) return row[k];
	return '';
};

function csvToRows(text: string): ImportRow[] {
	return parseCsv(text).map((row) => {
		const name = pick(row, 'name', 'filament', 'product');
		const material = pick(row, 'material', 'type') || inferMaterial(name);
		return {
			name,
			vendor: pick(row, 'vendor', 'brand') || 'Bambu Lab',
			material,
			colorHex: pick(row, 'color_hex', 'color', 'colour').replace(/^#/, '') || undefined,
			weight: Number(pick(row, 'weight', 'grams')) || 1000,
			spoolWeight: Number(pick(row, 'spool_weight')) || 250,
			price: Number(pick(row, 'price', 'cost', 'price_paid')) || 0,
			qty: Math.max(1, Math.floor(Number(pick(row, 'qty', 'quantity')) || 1)),
			note: pick(row, 'date', 'purchased', 'purchase_date', 'ordered'),
			lot: pick(row, 'lot', 'lot_nr', 'batch')
		};
	});
}

function invoiceToRows(text: string): { rows: ImportRow[]; order: string } {
	const parsed = parseBambuInvoice(text);
	const rows = parsed.rows.map((r) => ({
		name: r.name,
		vendor: 'Bambu Lab',
		material: r.material,
		colorHex: undefined,
		weight: r.weight,
		// Refills ship without a reusable spool; full spools weigh ~250g empty.
		spoolWeight: /refill/i.test(r.type) ? 0 : 250,
		price: r.pricePer,
		qty: r.qty,
		note: `Bambu order ${parsed.order}${r.date ? `, ${r.date}` : ''}`,
		lot: parsed.order
	}));
	return { rows, order: parsed.order };
}

export const actions: Actions = {
	import: async ({ request }) => {
		const form = await request.formData();
		const csvText = String(form.get('csv') ?? '').trim();
		const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
		if (!csvText && files.length === 0) return fail(400, { error: 'Paste CSV or choose a file first' });
		if (!(await spoolmanHealthy())) return fail(502, { error: 'Spoolman is unreachable' });

		// Cache existing vendors/filaments/spools to dedupe, plus ones created this run.
		const vendors = await listVendors();
		const vendorByName = new Map(vendors.map((v) => [v.name.toLowerCase(), v]));
		const filKey = (vendorId: number, name: string) => `${vendorId}::${name.toLowerCase()}`;
		const filByKey = new Map<string, SpoolmanFilament>();
		for (const f of await listFilaments())
			if (f.vendor?.id != null && f.name) filByKey.set(filKey(f.vendor.id, f.name), f);
		// order numbers already imported (stored as each spool's lot number)
		const importedOrders = new Set(
			(await listSpools({ allowArchived: true })).map((s) => s.lot_nr).filter(Boolean)
		);
		let catalog: ExternalFilament[] = [];
		try {
			catalog = await listExternalFilaments();
		} catch {
			// catalog unavailable — colours just won't be auto-filled
		}

		const rows: ImportRow[] = [];
		const sources: { name: string; rows: number }[] = [];

		if (csvText) {
			const r = csvToRows(csvText);
			rows.push(...r);
			sources.push({ name: 'pasted CSV', rows: r.length });
		}

		for (const f of files) {
			try {
				if (f.name.toLowerCase().endsWith('.pdf')) {
					const { rows: r, order } = invoiceToRows(pdfToText(Buffer.from(await f.arrayBuffer())));
					if (order && importedOrders.has(order)) {
						sources.push({ name: `${f.name} — already imported, skipped`, rows: 0 });
						continue;
					}
					rows.push(...r);
					sources.push({ name: `${f.name} (order ${order || '?'})`, rows: r.length });
				} else {
					const r = csvToRows(await f.text());
					rows.push(...r);
					sources.push({ name: f.name, rows: r.length });
				}
			} catch (e) {
				return fail(400, { error: `${f.name}: ${(e as Error).message}` });
			}
		}

		if (rows.length === 0) {
			return { result: { filamentsCreated: 0, spoolsCreated: 0, errors: [], sources } };
		}

		let filamentsCreated = 0;
		let spoolsCreated = 0;
		const errors: { item: string; message: string }[] = [];

		for (const row of rows) {
			try {
				if (!row.name) throw new Error('missing filament name');
				let vendor = vendorByName.get(row.vendor.toLowerCase());
				if (!vendor) {
					vendor = await createVendor(row.vendor);
					vendorByName.set(row.vendor.toLowerCase(), vendor);
				}
				let filament = filByKey.get(filKey(vendor.id, row.name));
				if (!filament) {
					// enrich from the bundled catalog (colour/density/temps) when not given
					const ext = row.colorHex ? null : matchExternal(catalog, row.material, row.name);
					filament = await createFilament({
						name: row.name,
						vendor_id: vendor.id,
						material: row.material,
						density: ext?.density ?? DENSITY[row.material.toUpperCase()] ?? 1.24,
						diameter: 1.75,
						color_hex: row.colorHex || ext?.color_hex || undefined,
						weight: row.weight,
						spool_weight: ext?.spool_weight ?? row.spoolWeight
					});
					filByKey.set(filKey(vendor.id, row.name), filament);
					filamentsCreated++;
				}
				for (let q = 0; q < row.qty; q++) {
					await createSpool({
						filament_id: filament.id,
						price: row.price,
						initial_weight: row.weight,
						lot_nr: row.lot || undefined,
						comment: row.note || undefined
					});
					spoolsCreated++;
				}
			} catch (e) {
				errors.push({ item: row.name || '(unnamed)', message: (e as Error).message });
			}
		}

		return { result: { filamentsCreated, spoolsCreated, errors, sources } };
	},

	// Fill in colour (and density/temps) on existing filaments by matching the bundled catalog.
	backfillColours: async () => {
		if (!(await spoolmanHealthy())) return fail(502, { error: 'Spoolman is unreachable' });
		const [filaments, catalog] = await Promise.all([listFilaments(), listExternalFilaments()]);
		let updated = 0;
		let unmatched = 0;
		for (const f of filaments) {
			if (f.color_hex || !f.name) continue;
			const ext = matchExternal(catalog, f.material ?? '', f.name);
			if (!ext?.color_hex) {
				unmatched++;
				continue;
			}
			await updateFilament(f.id, {
				color_hex: ext.color_hex,
				density: ext.density,
				spool_weight: ext.spool_weight,
				settings_extruder_temp: ext.extruder_temp,
				settings_bed_temp: ext.bed_temp,
				external_id: ext.id
			});
			updated++;
		}
		return { backfill: { updated, unmatched } };
	}
};
