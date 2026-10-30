<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const currency = $derived(data.settings?.currency ?? 'AUD');
	const money = $derived(
		new Intl.NumberFormat(undefined, { style: 'currency', currency })
	);
</script>

<h1>Dashboard</h1>

<section aria-labelledby="status_heading">
	<h2 id="status_heading">Services</h2>
	<ul class="status_list">
		<li class="card" data-ok={data.health.pocketbase}>
			<span class="dot" aria-hidden="true"></span>
			PocketBase
			<span class="state">{data.health.pocketbase ? 'connected' : 'unreachable'}</span>
		</li>
		<li class="card" data-ok={data.health.spoolman}>
			<span class="dot" aria-hidden="true"></span>
			Spoolman
			<span class="state">{data.health.spoolman ? 'connected' : 'unreachable'}</span>
		</li>
	</ul>
</section>

<section aria-labelledby="stock_heading">
	<h2 id="stock_heading">Filament stock</h2>
	<ul class="stat_grid">
		<li class="card">
			<span class="stat">{data.stock.spools}</span>
			<span class="label">spools</span>
		</li>
		<li class="card">
			<span class="stat">{Math.round(data.stock.remainingG)} g</span>
			<span class="label">remaining</span>
		</li>
		<li class="card">
			<span class="stat">{money.format(data.stock.value)}</span>
			<span class="label">stock value</span>
		</li>
	</ul>
	{#if !data.health.spoolman}
		<p class="hint">Start Spoolman to see live stock. Add spools at its own UI on port 7912.</p>
	{/if}
</section>

<style>
	.status_list,
	.stat_grid {
		list-style: none;
		margin: 0 0 var(--space);
		padding: 0;
		display: grid;
		gap: var(--space);
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
	}

	.status_list li {
		display: flex;
		align-items: center;
		gap: 0.5em;
	}
	.dot {
		width: 0.75em;
		height: 0.75em;
		border-radius: 50%;
		background: var(--danger);
	}
	[data-ok='true'] .dot {
		background: var(--success);
	}
	.state {
		margin-left: auto;
		color: var(--muted);
		font-size: 0.9em;
	}

	.stat_grid .stat {
		display: block;
		font-size: 1.75rem;
		font-weight: 700;
	}
	.stat_grid .label {
		color: var(--muted);
	}
	.hint {
		color: var(--muted);
	}
</style>
