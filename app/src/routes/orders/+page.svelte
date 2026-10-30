<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const money = $derived(
		new Intl.NumberFormat(undefined, { style: 'currency', currency: data.currency })
	);
	const toOrder = $derived(data.rows.filter((r) => r.rolls > 0));
</script>

<h1>Order list</h1>
<p class="hint">Filament the current queue needs beyond what's in stock, rounded up to whole rolls.</p>

{#if !data.spoolmanUp}
	<p class="card">Spoolman is unreachable — can't compare against stock.</p>
{:else}
	{#if data.unmappedDemand}
		<p class="warn">Some queued filaments aren't mapped to a Spoolman filament yet — those are excluded.</p>
	{/if}
	{#if data.rows.length === 0}
		<p class="hint">Nothing queued needs filament.</p>
	{:else}
		<table>
			<thead>
				<tr><th>Filament</th><th>Need</th><th>In stock</th><th>Short</th><th>Rolls</th><th>Est. cost</th></tr>
			</thead>
			<tbody>
				{#each data.rows as r (r.key)}
					<tr data-flag={r.flag}>
						<th scope="row">
							<span class="swatch" style="--s: {r.hex ?? 'var(--border)'}"></span>
							{r.name}
						</th>
						<td>{r.demandG} g</td>
						<td>{r.availableG} g</td>
						<td>{r.shortfallG > 0 ? `${r.shortfallG} g` : '—'}</td>
						<td>{r.rolls > 0 ? `${r.rolls} × ${r.rollWeightG}g` : '—'}</td>
						<td>{r.rolls > 0 && r.estCost != null ? money.format(r.estCost) : '—'}</td>
					</tr>
				{/each}
			</tbody>
			{#if toOrder.length > 0}
				<tfoot>
					<tr>
						<th scope="row" colspan="5">Estimated total to order</th>
						<td>{money.format(toOrder.reduce((s, r) => s + (r.estCost ?? 0), 0))}</td>
					</tr>
				</tfoot>
			{/if}
		</table>
	{/if}
{/if}

<style>
	.hint {
		color: var(--muted);
	}
	.warn {
		color: var(--accent);
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		text-align: left;
		padding: 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	td {
		text-align: right;
	}
	thead th {
		color: var(--muted);
		font-size: 0.85em;
	}
	tbody th {
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.swatch {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: var(--s);
		border: 1px solid var(--border);
	}
	tr[data-flag='out'] td,
	tr[data-flag='out'] th {
		color: var(--danger);
	}
	tfoot td,
	tfoot th {
		font-weight: 700;
		border-bottom: none;
	}
</style>
