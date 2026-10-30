import type { PageServerLoad, Actions } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { fail } from '@sveltejs/kit';
import type { Settings } from '#lib/types';

export const load: PageServerLoad = async () => {
	const pb = await adminPb();
	const settings = await pb.collection('settings').getFirstListItem<Settings>('');
	return { settings };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const pb = await adminPb();
		const settings = await pb.collection('settings').getFirstListItem<Settings>('');
		const form = await request.formData();

		const num = (k: string) => Number(form.get(k) ?? 0);
		try {
			await pb.collection('settings').update(settings.id, {
				currency: String(form.get('currency') || 'AUD').toUpperCase(),
				platform_fee_pct: num('platform_fee_pct'),
				packaging_default_cost: num('packaging_default_cost')
			});
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { saved: true };
	}
};
