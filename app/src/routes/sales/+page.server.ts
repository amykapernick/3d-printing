import type { PageServerLoad, Actions } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { pricingContext, modelUnitCost } from '#lib/server/modelCost';
import { etsyConfigured, etsyStatus, syncReceipts } from '#lib/server/etsy';
import { margin } from '#lib/costing';
import { fail } from '@sveltejs/kit';
import type { Model, Sale, Settings } from '#lib/types';

type SaleRow = Sale & { expand?: { model?: Model } };

export const load: PageServerLoad = async () => {
	const pb = await adminPb();
	const [sales, models, settings] = await Promise.all([
		pb.collection('sales').getFullList<SaleRow>({ sort: '-sold_at', expand: 'model' }),
		pb.collection('models').getFullList<Model>({ sort: 'name' }),
		pb.collection('settings').getFirstListItem<Settings>('')
	]);

	const pricing = await pricingContext();
	const unitCostCache = new Map<string, { filament: number; consumables: number; total: number }>();
	const getUnit = async (modelId: string) => {
		if (!unitCostCache.has(modelId)) unitCostCache.set(modelId, await modelUnitCost(pb, modelId, pricing));
		return unitCostCache.get(modelId)!;
	};

	const rows = [];
	let totalRevenue = 0;
	let totalProfit = 0;
	let totalUnits = 0;
	const perModel = new Map<string, { name: string; units: number; revenue: number; profit: number }>();

	for (const sale of sales) {
		const unit = await getUnit(sale.model);
		const m = margin({
			salePrice: sale.price ?? 0,
			qty: sale.qty || 1,
			filamentCost: unit.filament,
			consumablesCost: unit.consumables,
			packaging: sale.packaging_cost ?? 0,
			shipping: sale.shipping_cost ?? 0,
			fees: sale.fees ?? 0
		});
		rows.push({ sale, margin: m });
		totalRevenue += m.revenue;
		totalProfit += m.profit;
		totalUnits += sale.qty || 1;

		const name = sale.expand?.model?.name ?? 'model';
		const agg = perModel.get(sale.model) ?? { name, units: 0, revenue: 0, profit: 0 };
		agg.units += sale.qty || 1;
		agg.revenue += m.revenue;
		agg.profit += m.profit;
		perModel.set(sale.model, agg);
	}

	return {
		rows,
		models,
		currency: settings.currency,
		etsy: { configured: etsyConfigured(), ...(await etsyStatus(pb)) },
		defaults: { fee_pct: settings.platform_fee_pct, packaging: settings.packaging_default_cost },
		summary: {
			revenue: totalRevenue,
			profit: totalProfit,
			units: totalUnits,
			perModel: [...perModel.values()].sort((a, b) => b.profit - a.profit)
		}
	};
};

const n = (form: FormData, k: string) => Number(form.get(k) ?? 0);

export const actions: Actions = {
	add: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const model = String(form.get('model') ?? '');
		if (!model) return fail(400, { error: 'Pick a model' });
		try {
			await pb.collection('sales').create({
				model,
				qty: n(form, 'qty') || 1,
				price: n(form, 'price'),
				fees: n(form, 'fees'),
				packaging_cost: n(form, 'packaging_cost'),
				shipping_cost: n(form, 'shipping_cost'),
				channel: String(form.get('channel') ?? 'direct'),
				sold_at: String(form.get('sold_at') || new Date().toISOString().slice(0, 10)),
				notes: String(form.get('notes') ?? '')
			});
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { saved: true };
	},

	remove: async ({ request }) => {
		const pb = await adminPb();
		const id = String((await request.formData()).get('id') ?? '');
		if (id) await pb.collection('sales').delete(id);
		return { saved: true };
	},

	syncEtsy: async () => {
		const pb = await adminPb();
		try {
			const result = await syncReceipts(pb);
			return { synced: result };
		} catch (e) {
			return fail(502, { error: `Etsy sync failed: ${(e as Error).message}` });
		}
	}
};
