<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const sample = `name,vendor,material,color,weight,price,qty,date
Bambu PLA Basic Black,Bambu Lab,PLA,000000,1000,24.99,2,2026-09-01
Bambu PLA Matte Ivory,Bambu Lab,PLA,E8E3D8,1000,24.99,1,2026-09-01`;
</script>

<p class="back"><a href="/filaments">← Filaments</a></p>
<h1>Import spools</h1>
<p class="lead">Upload one or more <strong>Bambu invoice PDFs</strong> and/or paste a CSV. Bambu
	invoices are parsed automatically — filament lines only (printers, nozzles, AMS units are skipped),
	with the per-spool price taken after the refill/bundle discount.</p>

{#if !data.spoolmanUp}
	<p class="card">Spoolman is unreachable — start it before importing.</p>
{/if}

<section class="card guide">
	<h2>Format</h2>
	<p>
		One row per purchase. A header row names the columns (order doesn't matter). <strong>name</strong>
		is required; everything else is optional with sensible defaults.
	</p>
	<dl>
		<dt>name</dt><dd>filament name, e.g. <code>Bambu PLA Basic Black</code></dd>
		<dt>vendor</dt><dd>defaults to <code>Bambu Lab</code></dd>
		<dt>material</dt><dd>PLA / PETG / ABS… (inferred from the name if omitted)</dd>
		<dt>color</dt><dd>hex, with or without <code>#</code></dd>
		<dt>weight</dt><dd>net grams per spool (default 1000)</dd>
		<dt>price</dt><dd>price paid <em>per spool</em></dd>
		<dt>qty</dt><dd>number of spools in this purchase (default 1)</dd>
		<dt>date</dt><dd>purchase date (stored on each spool's note)</dd>
	</dl>
	<p class="muted">Vendors and filaments are reused if they already exist, so re-importing won't duplicate them (it will add spools).</p>
</section>

<form method="POST" action="?/import" use:enhance enctype="multipart/form-data" class="card import">
	<label>
		Bambu invoice PDFs and/or CSV files
		<input name="file" type="file" accept=".csv,text/csv,.pdf,application/pdf" multiple />
	</label>
	<label>
		…or paste CSV
		<textarea name="csv" rows="7" placeholder={sample}></textarea>
	</label>
	<div>
		<button class="button" type="submit" disabled={!data.spoolmanUp}>Import</button>
		{#if form?.error}<span class="error" role="alert">{form.error}</span>{/if}
	</div>
</form>

<section class="card backfill">
	<div>
		<strong>Missing colours?</strong>
		<span class="muted">Fill colour, density and temps on filaments that have none, from Spoolman's built-in catalog.</span>
	</div>
	<form method="POST" action="?/backfillColours" use:enhance>
		<button class="button is_ghost" type="submit" disabled={!data.spoolmanUp}>Backfill colours</button>
	</form>
</section>

{#if form?.backfill}
	<p class="result card" role="status">
		Updated <strong>{form.backfill.updated}</strong> filament{form.backfill.updated === 1 ? '' : 's'}{form.backfill.unmatched ? `, ${form.backfill.unmatched} had no catalog match` : ''}.
	</p>
{/if}

{#if form?.result}
	<section class="card result" role="status">
		<p>
			Created <strong>{form.result.spoolsCreated}</strong> spool{form.result.spoolsCreated === 1 ? '' : 's'}
			and <strong>{form.result.filamentsCreated}</strong> new filament{form.result.filamentsCreated === 1 ? '' : 's'}.
		</p>
		{#if form.result.sources.length > 0}
			<ul class="sources">
				{#each form.result.sources as s (s.name)}<li>{s.name}: {s.rows} line{s.rows === 1 ? '' : 's'}</li>{/each}
			</ul>
		{/if}
		{#if form.result.errors.length > 0}
			<p class="error">{form.result.errors.length} skipped:</p>
			<ul>
				{#each form.result.errors as e, idx (idx)}<li>{e.item}: {e.message}</li>{/each}
			</ul>
		{/if}
		<a class="button is_ghost" href="/filaments">View stock</a>
	</section>
{/if}

<style>
	.back a {
		color: var(--muted);
		text-decoration: none;
	}
	.lead {
		max-width: 44rem;
	}
	.sources {
		color: var(--muted);
		font-size: 0.9em;
		margin: 0.25rem 0;
	}
	.backfill {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: var(--space);
	}
	.backfill .muted {
		display: block;
		color: var(--muted);
		font-size: 0.9em;
	}
	.guide {
		margin-bottom: var(--space);
	}
	.guide dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem 1rem;
		margin: 0.5rem 0;
	}
	.guide dt {
		font-weight: 700;
		font-family: var(--mono);
	}
	.guide dd {
		margin: 0;
	}
	.muted {
		color: var(--muted);
	}
	.import {
		display: grid;
		gap: 0.75rem;
		margin-bottom: var(--space);
	}
	.import label {
		display: grid;
		gap: 0.25em;
		font-weight: 600;
	}
	textarea {
		font-family: var(--mono);
		font-size: 0.85em;
		width: 100%;
	}
	.result ul {
		margin: 0.25rem 0;
	}
	.error {
		color: var(--danger);
	}
</style>
