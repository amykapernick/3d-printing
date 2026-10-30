import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// This is an unauthenticated, self-hosted single-user app on a trusted LAN/device,
			// served over plain http on varying hostnames. adapter-node assumes https when
			// deriving the origin, so the CSRF origin check rejects every form. With no user
			// session to protect, the check adds no real security here — trust all origins.
			csrf: { trustedOrigins: ['*'] }
		})
	]
});
