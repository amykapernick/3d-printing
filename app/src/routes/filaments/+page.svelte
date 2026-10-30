<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const money = $derived(
		new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: data.currency,
			maximumFractionDigits: 4
		})
	);
</script>

<div class="head">
	<h1>Filaments</h1>
	<a class="button is_ghost" href="/filaments/import">Import from CSV</a>
</div>
<p class="hint">
	Stock is managed in <a href="http://localhost:7912" target="_blank" rel="noreferrer">Spoolman</a>.
	This is a live read-only view.
</p>

{#if !data.up}
	<p class="card">Spoolman is unreachable. Start it and reload.</p>
{:else if data.spools.length === 0}
	<p class="card">No spools yet — add some in Spoolman.</p>
{:else}
	<ul class="spools">
		{#each data.spools as spool (spool.id)}
			<li class="card">
				<span
					class="swatch"
					style="--swatch: {spool.hex ?? 'var(--border)'}"
					aria-hidden="true"
				></span>
				<div class="meta">
					<strong>{spool.name || 'Unnamed filament'}</strong>
					<span class="sub">{spool.material}{spool.location ? ` · ${spool.location}` : ''}</span>
				</div>
				<span class="remaining">{spool.remaining} g</span>
				<span class="cpg">
					{spool.costPerGram != null ? `${money.format(spool.costPerGram)}/g` : '—'}
				</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.hint {
		color: var(--muted);
	}
	.spools {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space);
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
	}
	.spools li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.75rem;
	}
	.swatch {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--swatch);
		border: 1px solid var(--border);
	}
	.meta {
		display: grid;
	}
	.sub {
		color: var(--muted);
		font-size: 0.9em;
	}
	.remaining {
		font-weight: 700;
	}
	.cpg {
		grid-column: 2 / -1;
		color: var(--muted);
		font-size: 0.9em;
	}
</style>
