import type { PageServerLoad } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { listSpools, spoolmanHealthy, spoolCostPerGram } from '#lib/server/spoolman';
import type { Settings } from '#lib/types';

export const load: PageServerLoad = async () => {
	let settings: Settings | null = null;
	let pbUp = false;
	try {
		const pb = await adminPb();
		settings = await pb.collection('settings').getFirstListItem<Settings>('');
		pbUp = true;
	} catch {
		pbUp = false;
	}

	const spoolmanUp = await spoolmanHealthy();
	let stock = { spools: 0, remainingG: 0, value: 0 };
	if (spoolmanUp) {
		try {
			const spools = await listSpools();
			for (const s of spools) {
				stock.spools += 1;
				stock.remainingG += s.remaining_weight ?? 0;
				const cpg = spoolCostPerGram(s);
				if (cpg != null) stock.value += cpg * (s.remaining_weight ?? 0);
			}
		} catch {
			// leave zeroed
		}
	}

	return {
		settings,
		health: { pocketbase: pbUp, spoolman: spoolmanUp },
		stock
	};
};
