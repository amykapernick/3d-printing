<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const money = $derived(
		new Intl.NumberFormat(undefined, { style: 'currency', currency: data.currency })
	);
	const pct = (v: number) => `${v.toFixed(0)}%`;
</script>

<h1>Sales</h1>
<p class="hint">
	Margin = sale price − (filament + consumables per item × qty) − packaging − shipping − fees.
	Costs resolve live from Spoolman. Personal prints never appear here.
</p>

<section class="summary" aria-label="Totals">
	<div class="card"><span class="n">{money.format(data.summary.revenue)}</span><span class="l">revenue</span></div>
	<div class="card"><span class="n">{money.format(data.summary.profit)}</span><span class="l">profit</span></div>
	<div class="card"><span class="n">{data.summary.units}</span><span class="l">units sold</span></div>
</section>

{#if data.etsy.configured}
	<section class="card etsy" aria-label="Etsy">
		<div class="etsy_status">
			<strong>Etsy</strong>
			{#if data.etsy.connected}
				<span class="ok">connected</span>
				{#if data.etsy.lastSync}<span class="sub">last sync {data.etsy.lastSync.slice(0, 16).replace('T', ' ')}</span>{/if}
			{:else}
				<span class="sub">not connected</span>
			{/if}
		</div>
		<div class="etsy_actions">
			{#if data.etsy.connected}
				<form method="POST" action="?/syncEtsy" use:enhance>
					<button class="button" type="submit">Sync now</button>
				</form>
				<a class="button is_ghost" href="/auth/etsy/start">Reconnect</a>
			{:else}
				<a class="button" href="/auth/etsy/start">Connect Etsy</a>
			{/if}
		</div>
		{#if form?.synced}<p class="ok" role="status">Imported {form.synced.imported}, skipped {form.synced.skipped}.</p>{/if}
	</section>
{/if}

<form method="POST" action="?/add" use:enhance class="card add">
	<h2>Record a sale</h2>
	<div class="grid">
		<label>Model
			<select name="model" required>
				<option value="">— pick —</option>
				{#each data.models as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
			</select>
		</label>
		<label>Qty<input name="qty" type="number" min="1" value="1" /></label>
		<label>Sale price<input name="price" type="number" step="0.01" /></label>
		<label>Fees<input name="fees" type="number" step="0.01" value="0" /></label>
		<label>Packaging<input name="packaging_cost" type="number" step="0.01" value={data.defaults.packaging} /></label>
		<label>Shipping<input name="shipping_cost" type="number" step="0.01" value="0" /></label>
		<label>Channel
			<select name="channel">
				<option value="direct">direct</option>
				<option value="etsy">etsy</option>
				<option value="market">market</option>
				<option value="other">other</option>
			</select>
		</label>
		<label>Date<input name="sold_at" type="date" /></label>
	</div>
	<div>
		<button class="button" type="submit">Add sale</button>
		{#if form?.error}<span class="error" role="alert">{form.error}</span>{/if}
	</div>
</form>

{#if data.summary.perModel.length > 0}
	<h2>By model</h2>
	<ul class="per_model">
		{#each data.summary.perModel as m (m.name)}
			<li class="card">
				<strong>{m.name}</strong>
				<span>{m.units} sold · {money.format(m.revenue)} · <span class="profit">{money.format(m.profit)} profit</span></span>
			</li>
		{/each}
	</ul>
{/if}

{#if data.rows.length > 0}
	<h2>All sales</h2>
	<table>
		<thead>
			<tr><th>Date</th><th>Model</th><th>Qty</th><th>Price</th><th>Cost</th><th>Profit</th><th>Margin</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.rows as { sale, margin } (sale.id)}
				<tr>
					<td>{sale.sold_at?.slice(0, 10) ?? ''}</td>
					<th scope="row">{sale.expand?.model?.name ?? 'model'} <span class="ch">{sale.channel}</span></th>
					<td>{sale.qty}</td>
					<td>{money.format(margin.revenue)}</td>
					<td>{money.format(margin.cost)}</td>
					<td class:neg={margin.profit < 0}>{money.format(margin.profit)}</td>
					<td class:neg={margin.marginPct < 0}>{pct(margin.marginPct)}</td>
					<td>
						<form method="POST" action="?/remove" use:enhance>
							<input type="hidden" name="id" value={sale.id} />
							<button class="button is_ghost small" type="submit" aria-label="Delete sale">✕</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.hint {
		color: var(--muted);
	}
	.summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: var(--space);
		margin-bottom: var(--space);
	}
	.summary .n {
		display: block;
		font-size: 1.6rem;
		font-weight: 700;
	}
	.summary .l {
		color: var(--muted);
	}
	.etsy {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: var(--space);
	}
	.etsy_status {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}
	.etsy_actions {
		display: flex;
		gap: 0.5rem;
	}
	.ok {
		color: var(--success);
	}
	.sub {
		color: var(--muted);
		font-size: 0.9em;
	}
	.add {
		margin-bottom: var(--space);
	}
	.add .grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.add label {
		display: grid;
		gap: 0.25em;
		font-weight: 600;
	}
	.per_model {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.per_model li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
	.profit {
		color: var(--success);
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 0.5rem;
		border-bottom: 1px solid var(--border);
		text-align: right;
	}
	thead th {
		color: var(--muted);
		font-size: 0.85em;
	}
	tbody th {
		text-align: left;
		font-weight: 600;
	}
	.ch {
		color: var(--muted);
		font-size: 0.8em;
	}
	.neg {
		color: var(--danger);
	}
	.small {
		padding: 0.1em 0.4em;
	}
</style>
