import type { PageServerLoad } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { listSpools, spoolCostPerGram, spoolmanHealthy } from '#lib/server/spoolman';
import type { Settings } from '#lib/types';

export const load: PageServerLoad = async () => {
	let currency = 'AUD';
	try {
		const pb = await adminPb();
		const settings = await pb.collection('settings').getFirstListItem<Settings>('');
		currency = settings.currency;
	} catch {
		// fall back to default
	}

	const up = await spoolmanHealthy();
	if (!up) return { up, currency, spools: [] };

	const spools = await listSpools();
	const rows = spools.map((s) => ({
		id: s.id,
		name: s.filament?.name ?? `${s.filament?.vendor?.name ?? ''} ${s.filament?.material ?? ''}`.trim(),
		material: s.filament?.material ?? '',
		hex: s.filament?.color_hex ? `#${s.filament.color_hex.replace(/^#/, '')}` : null,
		remaining: Math.round(s.remaining_weight ?? 0),
		costPerGram: spoolCostPerGram(s),
		location: s.location ?? ''
	}));

	return { up, currency, spools: rows };
};
