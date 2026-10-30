<script lang="ts">
	import { enhance } from '$app/forms';
	import { FAMILIES } from '#lib/colour';
	import FilamentRow from './FilamentRow.svelte';
	import PlateRow from './PlateRow.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// blank template for the "add a filament" row (no id ⇒ the component renders an add form)
	const newRow = { match: 'specific', spoolman_filament_id: 0, req_shade: 'any', colour_label: '' };
	const newPlate = { max_copies: 1 };

	let addDialog: HTMLDialogElement;
	let bulkDialog: HTMLDialogElement;
	const currentLabel = (f: { spoolman_filament_id: number }) =>
		data.spoolmanFilaments.find((s) => s.id === f.spoolman_filament_id)?.label ?? '';
	const availText = (f: { match: string; matchCount: number; availableG: number; spoolman_filament_id: number }) =>
		f.match === 'general'
			? `${f.matchCount} match${f.matchCount === 1 ? '' : 'es'} · ${f.availableG} g`
			: f.spoolman_filament_id
				? `${f.availableG} g in stock`
				: '';
	const fmtTime = (min: number) => {
		if (!min) return '—';
		const h = Math.floor(min / 60);
		const m = Math.round(min % 60);
		return h ? `${h}h ${m}m` : `${m}m`;
	};
	const money = $derived(
		new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: data.currency,
			maximumFractionDigits: 2
		})
	);
</script>

<p class="back"><a href="/models">← Models</a></p>
<div class="title_row">
	<h1>{data.model.name}</h1>
	<form method="POST" action="?/duplicate" use:enhance>
		<button class="button is_ghost" type="submit">Duplicate model</button>
	</form>
</div>

<section class="cost card" aria-label="Estimated cost">
	<div><span class="n">{money.format(data.cost.filament)}</span><span class="l">filament</span></div>
	<div><span class="n">{money.format(data.cost.consumables)}</span><span class="l">consumables</span></div>
	<div class="total"><span class="n">{money.format(data.cost.total)}</span><span class="l">per plate</span></div>
</section>

<div class="cols">
	<section aria-labelledby="details_h">
		<h2 id="details_h">Details</h2>
		<form
			method="POST"
			action="?/updateModel"
			use:enhance={() => async ({ update }) => update({ reset: false })}
			enctype="multipart/form-data"
			class="card stack"
		>
			<label>Name<input name="name" value={data.model.name} required /></label>
			<label>Source URL<input name="source_url" type="url" value={data.model.source_url ?? ''} /></label>
			<label>
				Sliced file (.3mf)
				<input name="file" type="file" accept=".3mf,.stl,model/3mf" />
				{#if data.model.file}
					<small class="muted">Current: {data.model.file} — choosing a new file replaces it.</small>
				{/if}
			</label>
			<label>Notes<textarea name="notes" rows="3">{data.model.notes ?? ''}</textarea></label>
			<div>
				<button class="button" type="submit">Save</button>
				{#if data.model.file}
					<a class="button is_ghost" href="/models/{data.model.id}/file" download>
						Download file
					</a>
				{/if}
			</div>
		</form>

		<h2>Plates</h2>
		<p class="muted">
			One finished item = one run of every plate. Enter measured times at 1 / 2 / full copies;
			in-between counts are interpolated. Model time for one item: <strong>{fmtTime(data.time.perItem)}</strong>.
		</p>
		{#if data.plates.length > 0}
			<form
				method="POST"
				action="?/savePlates"
				use:enhance={() => async ({ update }) => update({ reset: false })}
				class="card savef"
			>
				{#each data.plates as p (p.id)}
					<div class="editrow plate">
						<input type="hidden" name="pl_id" value={p.id} />
						<span class="pos">Plate {p.position}</span>
						<label>Max copies<input class="num" name="pl_max" type="number" min="1" value={p.max_copies ?? 1} /></label>
						<label>Time @1<input class="num" name="pl_t1" type="number" min="0" value={p.time_1 ?? ''} /></label>
						<label>Time @2<input class="num" name="pl_t2" type="number" min="0" value={p.time_2 ?? ''} /></label>
						<label>Time @full<input class="num" name="pl_tf" type="number" min="0" value={p.time_full ?? ''} /></label>
						<button class="button is_ghost del" type="submit" formaction="?/deletePlate" name="id" value={p.id} aria-label="Delete plate">✕</button>
					</div>
				{/each}
				<div class="saverow">
					<button class="button" type="submit">Save all plates</button>
					{#if form?.saved}<span class="ok">Saved</span>{/if}
				</div>
			</form>
		{/if}
		<div class="card addplate">
			<h3>Add a plate</h3>
			<PlateRow p={newPlate} model={data.model.id} />
		</div>

		<h2>Add to queue</h2>
		<form method="POST" action="?/enqueue" use:enhance class="card queue_form">
			<label>Copies<input name="copies" type="number" min="1" value="1" /></label>
			<label>
				Type
				<select name="print_type">
					<option value="business">business</option>
					<option value="personal">personal</option>
				</select>
			</label>
			<button class="button" type="submit">Queue it</button>
		</form>
	</section>

	<section aria-labelledby="fil_h">
		<h2 id="fil_h">Filaments</h2>

		<!-- shared autocomplete source for the "specific filament" inputs -->
		<datalist id="spoolman_filaments">
			{#each data.libraryLabels as label (label)}<option value={label}></option>{/each}
		</datalist>
		<datalist id="materials">
			{#each data.materials as m (m)}<option value={m}></option>{/each}
		</datalist>

		{#if data.filaments.length > 0}
			<form
				method="POST"
				action="?/saveFilaments"
				use:enhance={() => async ({ update }) => update({ reset: false })}
				class="card savef"
			>
				{#each data.filaments as f (f.id)}
					<div class="editrow">
						<input type="hidden" name="row_id" value={f.id} />
						<select class="mode" name="row_match">
							<option value="specific" selected={f.match !== 'general'}>specific</option>
							<option value="general" selected={f.match === 'general'}>any colour</option>
						</select>
						<span class="specfields">
							<span class="swatch" style="--s: {f.hex ?? 'var(--border)'}"></span>
							<input name="row_spoolman_filament" list="spoolman_filaments" value={currentLabel(f)} placeholder="filament…" />
						</span>
						<span class="genfields">
							<select name="row_req_family">
								{#each FAMILIES as fam (fam)}<option value={fam} selected={f.req_family === fam}>{fam}</option>{/each}
							</select>
							<select name="row_req_shade">
								<option value="any" selected={(f.req_shade ?? 'any') === 'any'}>any</option>
								<option value="light" selected={f.req_shade === 'light'}>light</option>
								<option value="dark" selected={f.req_shade === 'dark'}>dark</option>
							</select>
							<input name="row_req_material" list="materials" value={f.req_material ?? ''} placeholder="material" />
						</span>
						<input class="lbl" name="row_colour_label" value={f.colour_label ?? ''} placeholder="label" />
						<input class="num" name="row_usage" type="number" step="0.01" value={f.usage ?? ''} title="usage (g)" />
						<input class="num" name="row_purge" type="number" step="0.01" value={f.purge ?? ''} title="purge (g)" />
						<span class="avail">{availText(f)}</span>
						<button class="button is_ghost del" type="submit" formaction="?/deleteFilament" name="id" value={f.id} aria-label="Delete filament">✕</button>
					</div>
				{/each}
				<div class="saverow">
					<button class="button" type="submit">Save all filaments</button>
					{#if form?.saved}<span class="ok">Saved</span>{/if}
				</div>
			</form>
		{:else}
			<p class="muted">No filaments yet.</p>
		{/if}

		<div class="addbar">
			<button class="button is_ghost" type="button" onclick={() => addDialog.showModal()}>+ Add filament</button>
			<button class="button is_ghost" type="button" onclick={() => bulkDialog.showModal()}>Bulk add</button>
		</div>

		<dialog bind:this={addDialog} class="fdialog">
			<h3>Add a filament</h3>
			<FilamentRow f={newRow} model={data.model.id} spoolmanFilaments={data.spoolmanFilaments} {money} />
			<button class="button is_ghost" type="button" onclick={() => addDialog.close()}>Close</button>
		</dialog>

		<dialog bind:this={bulkDialog} class="fdialog">
			<form method="POST" action="?/bulkAddFilaments" use:enhance class="bulk">
				<h3>Bulk add filaments</h3>
				<p class="muted">One per line: <code>label, usage g, purge g</code> (comma or space separated; purge optional). Added unmapped — map them after.</p>
				<textarea name="bulk" rows="5" placeholder="PLA black, 24, 2&#10;PETG red, 15, 1"></textarea>
				<div class="actions">
					<button class="button" type="submit">Bulk add</button>
					<button class="button is_ghost" type="button" onclick={() => bulkDialog.close()}>Close</button>
					{#if form?.bulkAdded != null}<span class="ok">Added {form.bulkAdded}</span>{/if}
				</div>
			</form>
		</dialog>

		<h2>Consumables</h2>
		<ul class="rows">
			{#each data.modelConsumables as mc (mc.id)}
				<li class="card consumable_row">
					<span>{mc.expand?.consumable?.name ?? 'removed'} × {mc.qty}</span>
					<form method="POST" action="?/deleteConsumable" use:enhance>
						<input type="hidden" name="id" value={mc.id} />
						<button class="button is_ghost" type="submit" aria-label="Remove consumable">✕</button>
					</form>
				</li>
			{/each}
		</ul>
		<form method="POST" action="?/addConsumable" use:enhance class="card add_row">
			<select name="consumable">
				<option value="">— pick —</option>
				{#each data.consumables as c (c.id)}
					<option value={c.id}>{c.name}</option>
				{/each}
			</select>
			<input name="qty" type="number" min="1" value="1" />
			<button class="button" type="submit">Add</button>
		</form>
	</section>
</div>

<form method="POST" action="?/deleteModel" use:enhance class="danger_zone">
	<button class="button is_ghost danger" type="submit">Delete model</button>
</form>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

<style>
	.back a {
		color: var(--muted);
		text-decoration: none;
	}
	.cost {
		display: flex;
		flex-wrap: wrap;
		gap: 2rem;
		margin-bottom: var(--space);
	}
	.cost .n {
		display: block;
		font-size: 1.4rem;
		font-weight: 700;
	}
	.cost .l {
		color: var(--muted);
		font-size: 0.85em;
	}
	.cost .total .n {
		color: var(--accent);
	}
	.cols {
		display: grid;
		gap: var(--space);
		grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
		align-items: start;
	}
	.stack {
		display: grid;
		gap: 0.75rem;
		margin-bottom: var(--space);
	}
	.stack label,
	.queue_form label {
		display: grid;
		gap: 0.25em;
		font-weight: 600;
	}
	.muted {
		color: var(--muted);
	}
	.title_row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.title_row h1 {
		margin: 0;
	}
	.queue_form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.75rem;
	}
	.queue_form input,
	.queue_form select {
		width: 8rem;
	}
	.rows {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.add_row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: var(--space);
	}
	.consumable_row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.danger_zone {
		margin-top: 2rem;
	}
	.danger {
		--button_ink: var(--danger);
		border-color: var(--danger);
	}
	.error {
		color: var(--danger);
	}
	.savef {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.editrow {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	.editrow .mode {
		width: 7.5rem;
	}
	.specfields {
		display: flex;
		align-items: center;
		gap: 0.4em;
		flex: 1;
		min-width: 12rem;
	}
	.specfields input {
		flex: 1;
	}
	.genfields {
		display: none;
		align-items: center;
		gap: 0.4em;
		flex: 1;
		min-width: 12rem;
	}
	/* toggle specific/general field groups from the row's mode <select> (no JS) */
	.editrow:has(.mode option[value='general']:checked) .genfields {
		display: flex;
	}
	.editrow:has(.mode option[value='general']:checked) .specfields {
		display: none;
	}
	.swatch {
		width: 1.6em;
		height: 1.6em;
		border-radius: 0.25em;
		background: var(--s);
		border: 1px solid var(--border);
		flex: none;
	}
	.editrow .lbl {
		width: 8rem;
	}
	.editrow .num {
		width: 5rem;
	}
	.editrow .avail {
		color: var(--muted);
		font-size: 0.85em;
		min-width: 6rem;
	}
	.editrow .del {
		margin-left: auto;
	}
	.saverow {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.25rem;
	}
	.editrow.plate label {
		display: grid;
		gap: 0.15em;
		font-size: 0.75em;
		color: var(--muted);
	}
	.pos {
		font-weight: 700;
		align-self: center;
		min-width: 4.5rem;
	}
	.addplate {
		margin-bottom: var(--space);
	}
	.addplate h3 {
		margin: 0 0 0.5rem;
	}
	.addbar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: var(--space);
	}
	.fdialog {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		max-width: 40rem;
		width: calc(100% - 2rem);
		padding: var(--space);
	}
	.fdialog::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
	.fdialog h3 {
		margin: 0 0 0.5rem;
	}
	.bulk textarea {
		width: 100%;
		font-family: var(--mono);
		font-size: 0.85em;
	}
	.bulk .muted {
		margin: 0.25rem 0;
	}
	.ok {
		color: var(--success);
	}
</style>
