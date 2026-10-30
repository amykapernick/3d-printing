import type { PageServerLoad, Actions } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { fail } from '@sveltejs/kit';
import type { Consumable, Settings } from '#lib/types';

export const load: PageServerLoad = async () => {
	const pb = await adminPb();
	const [consumables, settings] = await Promise.all([
		pb.collection('consumables').getFullList<Consumable>({ sort: 'name' }),
		pb.collection('settings').getFirstListItem<Settings>('')
	]);
	return { consumables, currency: settings.currency };
};

export const actions: Actions = {
	add: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required' });
		try {
			await pb.collection('consumables').create({
				name,
				unit_cost: Number(form.get('unit_cost') ?? 0),
				unit: String(form.get('unit') ?? 'each').trim() || 'each',
				stock_qty: Number(form.get('stock_qty') ?? 0),
				supplier: String(form.get('supplier') ?? '').trim()
			});
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { added: true };
	},
	delete: async ({ request }) => {
		const pb = await adminPb();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (id) await pb.collection('consumables').delete(id);
		return { deleted: true };
	}
};
