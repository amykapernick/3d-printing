/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { self } from '$app/service-worker';
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';

// Precache the app shell and static assets. `version` changes each build, so
// stale caches are cleaned up on activate.
const CACHE = `cache-${version}`;
const PRECACHE = [...immutable, ...assets, ...prerendered].map((entry) => entry.path);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return; // don't cache cross-origin

	// Cache-first for precached assets; network-first for everything else so data
	// stays fresh, falling back to cache when offline.
	if (PRECACHE.includes(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
		return;
	}

	event.respondWith(
		fetch(request)
			.then((response) => {
				if (response.ok) {
					const copy = response.clone();
					caches.open(CACHE).then((cache) => cache.put(request, copy));
				}
				return response;
			})
			.catch(() => caches.match(request).then((cached) => cached ?? Promise.reject()))
	);
});
