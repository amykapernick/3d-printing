/// <reference path="../pb_data/types.d.ts" />

// Hourly Etsy import. PocketBase can't reach Spoolman/Etsy logic directly, so it
// pokes the app's own sync endpoint, which does the work. Only runs when the
// APP_INTERNAL_URL env var is set (e.g. http://app:3000 in docker-compose).
cronAdd('etsy-sync', '0 * * * *', () => {
	const url = $os.getenv('APP_INTERNAL_URL');
	const secret = $os.getenv('CRON_SECRET');
	if (!url) return;
	try {
		$http.send({
			url: url + '/api/etsy/sync',
			method: 'POST',
			headers: { 'x-cron-secret': secret },
			timeout: 120
		});
	} catch (e) {
		console.log('etsy-sync failed:', e);
	}
});
