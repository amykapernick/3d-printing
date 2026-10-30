<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const money = $derived(
		new Intl.NumberFormat(undefined, { style: 'currency', currency: data.currency })
	);
</script>

<h1>Consumables</h1>
<p class="hint">
	Non-filament costs — magnets, packaging, screws, keyrings. These feed per-model and per-sale
	costing once a model references them.
</p>

<form method="POST" action="?/add" use:enhance class="card add_form">
	<label>Name<input name="name" required placeholder="10mm magnet" /></label>
	<label>Unit cost<input name="unit_cost" type="number" step="0.01" value="0" /></label>
	<label>Unit<input name="unit" value="each" /></label>
	<label>Stock qty<input name="stock_qty" type="number" step="1" value="0" /></label>
	<label>Supplier<input name="supplier" placeholder="optional" /></label>
	<button class="button" type="submit">Add</button>
	{#if form?.error}<span class="error" role="alert">{form.error}</span>{/if}
</form>

{#if data.consumables.length > 0}
	<ul class="items">
		{#each data.consumables as c (c.id)}
			<li class="card">
				<div class="meta">
					<strong>{c.name}</strong>
					<span class="sub">
						{money.format(c.unit_cost)} / {c.unit}
						{#if c.supplier}· {c.supplier}{/if}
						{#if c.stock_qty}· {c.stock_qty} in stock{/if}
					</span>
				</div>
				<form method="POST" action="?/delete" use:enhance>
					<input type="hidden" name="id" value={c.id} />
					<button class="button is_ghost" type="submit" aria-label="Delete {c.name}">✕</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.hint {
		color: var(--muted);
	}
	.add_form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.75rem;
		margin-bottom: var(--space);
	}
	.add_form label {
		display: grid;
		gap: 0.25em;
		font-weight: 600;
	}
	.add_form input {
		width: 10rem;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.items li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.sub {
		color: var(--muted);
		font-size: 0.9em;
	}
	.error {
		color: var(--danger);
	}
</style>
