import type { PageServerLoad } from './$types';
import { haSnapshot } from '#lib/server/ha';

export const load: PageServerLoad = async () => {
	return { ha: await haSnapshot() };
};
