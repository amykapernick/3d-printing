import type { RequestHandler } from './$types';
import { adminPb } from '#lib/server/pocketbase';
import { error } from '@sveltejs/kit';
import type { Model } from '#lib/types';

// Stream a model's uploaded file through the app, since PocketBase file access is
// locked to superusers and the browser never holds that token.
export const GET: RequestHandler = async ({ params }) => {
	const pb = await adminPb();
	let model: Model;
	try {
		model = await pb.collection('models').getOne<Model>(params.id);
	} catch {
		throw error(404, 'Model not found');
	}
	if (!model.file) throw error(404, 'No file for this model');

	const token = await pb.files.getToken();
	const url = pb.files.getURL(model, model.file, { token });
	const res = await fetch(url);
	if (!res.ok || !res.body) throw error(502, 'Could not fetch file');

	return new Response(res.body, {
		headers: {
			'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
			'content-disposition': `attachment; filename="${model.file}"`
		}
	});
};
