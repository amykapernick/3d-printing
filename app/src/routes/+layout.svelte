<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const links = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/printer', label: 'Printers' },
		{ href: '/filaments', label: 'Filaments' },
		{ href: '/models', label: 'Models' },
		{ href: '/queue', label: 'Queue' },
		{ href: '/orders', label: 'Orders' },
		{ href: '/sales', label: 'Sales' },
		{ href: '/consumables', label: 'Consumables' },
		{ href: '/settings', label: 'Settings' }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<header class="site_header">
	<a href="/" class="brand">
		<img src="/icon.svg" alt="" width="28" height="28" />
		<span>Print Manager</span>
	</a>
	<nav aria-label="Primary">
		<ul>
			{#each links as link (link.href)}
				<li>
					<a href={link.href} aria-current={isActive(link.href) ? 'page' : undefined}>
						{link.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
</header>

<main>
	{@render children()}
</main>

<style>
	.site_header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space);
		padding: 0.75rem var(--space);
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
		font-weight: 700;
		text-decoration: none;
	}

	nav ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	nav a {
		text-decoration: none;
		color: var(--muted);
		padding: 0.25em 0;
		border-bottom: 2px solid transparent;
	}
	nav a:hover {
		color: var(--ink);
	}
	nav a[aria-current='page'] {
		color: var(--ink);
		border-bottom-color: var(--accent);
	}

	main {
		max-width: var(--maxw);
		margin-inline: auto;
		padding: var(--space);
	}
</style>
