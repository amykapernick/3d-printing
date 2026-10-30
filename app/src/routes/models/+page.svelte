<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let dialog: HTMLDialogElement;

	// Keyed arrays drive the dynamic plate/filament rows in the add-model modal.
	// Inputs are uncontrolled (submitted via name) — the keys just add/remove rows.
	let plateKeys = $state([0]);
	let conKeys = $state<number[]>([]);
	let seq = 1;
	const addPlate = () => (plateKeys = [...plateKeys, seq++]);
	const removePlate = (k: number) => (plateKeys = plateKeys.filter((x) => x !== k));
	const addCon = () => (conKeys = [...conKeys, seq++]);
	const removeCon = (k: number) => (conKeys = conKeys.filter((x) => x !== k));

	let filamentId = $state(0); // 0 = any
	let onlyPrintable = $state(false);
	let maxMinutes = $state<number | null>(null);

	const fmt = (min: number) => {
		if (!min) return '—';
		const h = Math.floor(min / 60);
		const m = Math.round(min % 60);
		return h ? `${h}h ${m}m` : `${m}m`;
	};

	const filtered = $derived(
		data.rows.filter((r) => {
			if (filamentId && !r.filamentIds.includes(filamentId)) return false;
			if (onlyPrintable && !r.printable) return false;
			if (maxMinutes != null && r.total_time > maxMinutes) return false;
			return true;
		})
	);
</script>

<div class="head">
	<h1>Models</h1>
	<button class="button" onclick={() => dialog.showModal()}>+ Add model</button>
</div>

<dialog bind:this={dialog} class="add_dialog">
	<form method="POST" action="?/create" use:enhance enctype="multipart/form-data" class="add_form">
		<h2>Add a model</h2>
		<label>Name<input name="name" required placeholder="Articulated dragon" /></label>
		<label>Source URL<input name="source_url" type="url" placeholder="https://makerworld.com/…" /></label>
		<label>
			Sliced file (.3mf)
			<input name="file" type="file" accept=".3mf,.stl,model/3mf" />
		</label>
		<label>Notes<textarea name="notes" rows="2"></textarea></label>

		<fieldset>
			<legend>Plates <span class="muted">— measured times per plate</span></legend>
			<div class="colnames"><span>Max copies</span><span>Time @1</span><span>Time @2</span><span>Time @full</span><span></span></div>
			{#each plateKeys as k (k)}
				<div class="grid_row">
					<input name="plate_max_copies" type="number" min="1" placeholder="1" />
					<input name="plate_time_1" type="number" min="0" placeholder="min" />
					<input name="plate_time_2" type="number" min="0" placeholder="min" />
					<input name="plate_time_full" type="number" min="0" placeholder="min" />
					<button type="button" class="button is_ghost" onclick={() => removePlate(k)} aria-label="Remove plate">✕</button>
				</div>
			{/each}
			<button type="button" class="button is_ghost small" onclick={addPlate}>+ plate</button>
		</fieldset>

		<fieldset>
			<legend>Filaments <span class="muted">— map to Spoolman later</span></legend>
			<p class="muted">One per line: <code>label, usage g, purge g</code> (comma or space separated; purge optional).</p>
			<textarea name="fil_bulk" rows="4" placeholder="PLA black, 24, 2&#10;PETG red, 15, 1"></textarea>
		</fieldset>

		<fieldset>
			<legend>Consumables <span class="muted">— magnets, packaging, hardware</span></legend>
			{#each conKeys as k (k)}
				<div class="grid_row con">
					<select name="mc_consumable">
						<option value="">— pick —</option>
						{#each data.consumables as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
					</select>
					<input name="mc_qty" type="number" min="1" value="1" />
					<button type="button" class="button is_ghost" onclick={() => removeCon(k)} aria-label="Remove consumable">✕</button>
				</div>
			{/each}
			<button type="button" class="button is_ghost small" onclick={addCon} disabled={data.consumables.length === 0}>
				+ consumable{data.consumables.length === 0 ? ' (add some first)' : ''}
			</button>
		</fieldset>

		<div class="actions">
			<button class="button" type="submit">Add model</button>
			<button class="button is_ghost" type="button" onclick={() => dialog.close()}>Cancel</button>
			{#if form?.error}<span class="error" role="alert">{form.error}</span>{/if}
		</div>
	</form>
</dialog>

<form class="filters card" onsubmit={(e) => e.preventDefault()}>
	<label>
		Filament
		<select bind:value={filamentId}>
			<option value={0}>Any</option>
			{#each data.filterFilaments as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
		</select>
	</label>
	<label>
		Max print time (min)
		<input type="number" min="0" step="30" bind:value={maxMinutes} placeholder="any" />
	</label>
	<label class="check">
		<input type="checkbox" bind:checked={onlyPrintable} disabled={!data.spoolmanUp} />
		In stock (all filament on hand &amp; enough)
	</label>
	{#if !data.spoolmanUp}<span class="note">Spoolman offline — stock filter unavailable</span>{/if}
</form>

{#if filtered.length === 0}
	<p class="hint">{data.rows.length === 0 ? 'No models yet.' : 'No models match the filters.'}</p>
{:else}
	<form method="POST" action="?/queueSelected" use:enhance class="list_form">
		<div class="bulkbar">
			<span class="muted">Tick models, then:</span>
			<label>Copies <input name="copies" type="number" min="1" value="1" /></label>
			<label>
				Type
				<select name="print_type"><option value="business">business</option><option value="personal">personal</option></select>
			</label>
			<button class="button" type="submit">Add selected to queue</button>
			{#if form?.error}<span class="error">{form.error}</span>{/if}
		</div>
		<ul class="models">
			{#each filtered as model (model.id)}
				<li class="card">
					<div class="model_head">
						<input class="pick" type="checkbox" name="selected" value={model.id} aria-label="Select {model.name}" />
						<a href="/models/{model.id}" class="name">{model.name}</a>
						<span class="meta">
							{model.filamentCount} filament{model.filamentCount === 1 ? '' : 's'}
							{#if model.total_time}· {fmt(model.total_time)}{/if}
							{#if model.hasFile}· <span class="tag">file</span>{/if}
							{#if data.spoolmanUp}
								{#if model.printable}· <span class="ok">in stock</span>
								{:else if model.hasUnmapped}· <span class="warn">unmapped</span>
								{:else}· <span class="out">low stock</span>{/if}
							{/if}
							{#if model.consumableCount > 0}· <span class="cons" data-ok={model.consumablesOk} title={model.consumablesInfo}>{model.consumableCount} consumable{model.consumableCount === 1 ? '' : 's'}</span>{/if}
						</span>
					{#if data.spoolmanUp && model.needs.length > 0}
						<ul class="needs">
							{#each model.needs as n, i (i)}
							{@const pid = `alt-${model.id}-${i}`}
							<li>
								<button
									type="button"
									class="swatch btn"
									style="--s: {n.hex ?? 'var(--border)'}; anchor-name: --sw-{pid}"
									data-ok={n.available}
									popovertarget={pid}
									title={`${n.label}${n.general ? ' (any)' : ''} — ${n.available ? 'in stock' : `have ${n.availableG} of ${n.usage} g`}`}
									aria-label={`${n.label} alternatives`}
								></button>
								<div popover id={pid} class="altpop card" style="position-anchor: --sw-{pid}">
									<p class="pop_head">
										<span class="swatch" style="--s: {n.hex ?? 'var(--border)'}"></span>
										<strong>{n.label}{n.general ? ' (any)' : ''}</strong>
										<span class="navail" data-ok={n.available}>{n.available ? '✓ in stock' : `${n.availableG} / ${n.usage} g`}</span>
									</p>
									{#if n.alternatives.length > 0}
										<p class="muted">Alternatives in stock, by colour match:</p>
										<ul class="altlist">
											{#each n.alternatives as a (a.label)}
												<li>
													<span class="swatch sm" style="--s: {a.hex ?? 'var(--border)'}"></span>
													<span class="aname">{a.label}</span>
													<span class="pct" data-strong={a.pct >= 90}>{a.pct}%</span>
													<span class="rem">{a.remaining}g</span>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="muted">No in-stock alternatives.</p>
									{/if}
								</div>
							</li>
							{/each}
						</ul>
					{/if}
				</div>
				</li>
			{/each}
		</ul>
	</form>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.add_dialog {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		padding: 0;
		max-width: 44rem;
		width: calc(100% - 2rem);
	}
	.add_dialog::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
	.add_form {
		display: grid;
		gap: 0.75rem;
		padding: var(--space);
	}
	.add_form > label {
		display: grid;
		gap: 0.25em;
		font-weight: 600;
	}
	fieldset {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		display: grid;
		gap: 0.4rem;
	}
	legend {
		font-weight: 700;
		padding: 0 0.4em;
	}
	.muted {
		color: var(--muted);
		font-weight: 400;
		font-size: 0.85em;
	}
	.colnames,
	.grid_row {
		display: grid;
		grid-template-columns: repeat(4, 1fr) auto;
		gap: 0.4rem;
		align-items: center;
	}
	.grid_row.con {
		grid-template-columns: 1fr 6rem auto;
	}
	fieldset textarea {
		width: 100%;
		font-family: var(--mono);
		font-size: 0.85em;
	}
	.colnames {
		font-size: 0.75em;
		color: var(--muted);
	}
	.grid_row input {
		width: 100%;
	}
	.small {
		justify-self: start;
		padding: 0.2em 0.6em;
		font-size: 0.85em;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 1rem;
		margin: var(--space) 0;
	}
	.filters label {
		display: grid;
		gap: 0.25em;
		font-weight: 600;
		font-size: 0.9em;
	}
	.filters .check {
		display: flex;
		align-items: center;
		gap: 0.4em;
	}
	.filters input[type='number'],
	.filters select {
		width: 11rem;
	}
	.note {
		color: var(--muted);
		font-size: 0.85em;
	}
	.models {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.models li {
		display: grid;
		gap: 0.4rem;
	}
	.name {
		font-weight: 600;
		font-size: 1.1rem;
	}
	.meta {
		color: var(--muted);
		font-size: 0.9em;
	}
	.tag {
		color: var(--accent);
	}
	.ok {
		color: var(--success);
	}
	.warn {
		color: var(--accent);
	}
	.out {
		color: var(--danger);
	}
	.hint {
		color: var(--muted);
	}
	.error {
		color: var(--danger);
	}
	.bulkbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.bulkbar label {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		font-size: 0.9em;
	}
	.bulkbar input[type='number'] {
		width: 5rem;
	}
	.model_head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}
	.pick {
		align-self: center;
	}
	.model_head {
		align-items: center;
		flex-wrap: wrap;
	}
	.needs {
		list-style: none;
		margin: 0;
		margin-left: auto; /* push swatches to the end of the line */
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.swatch {
		width: 1.3em;
		height: 1.3em;
		border-radius: 0.25em;
		background: var(--s);
		border: 1px solid var(--border);
		flex: none;
	}
	.swatch.sm {
		width: 1.1em;
		height: 1.1em;
	}
	.swatch.btn {
		cursor: pointer;
		padding: 0;
		width: 2.6em; /* twice the normal swatch */
		height: 2.6em;
		border-width: 2px;
	}
	.swatch.btn[data-ok='true'] {
		border-color: var(--success);
	}
	.swatch.btn[data-ok='false'] {
		border-color: var(--danger);
	}
	.cons {
		color: var(--success);
	}
	.cons[data-ok='false'] {
		color: var(--danger);
	}
	.altpop {
		max-width: 22rem;
		font-size: 0.9em;
		color: var(--ink);
		background: var(--surface);
		/* anchor to the clicked swatch (position-anchor set inline) */
		margin: 0.4rem 0 0;
		position-area: bottom;
		position-try-fallbacks: flip-block, flip-inline;
	}
	.altpop::backdrop {
		background: rgb(0 0 0 / 0.15);
	}
	.pop_head {
		display: flex;
		align-items: center;
		gap: 0.5em;
		margin: 0 0 0.4rem;
	}
	.pop_head .navail {
		margin-left: auto;
	}
	.navail[data-ok='true'] {
		color: var(--success);
	}
	.navail[data-ok='false'] {
		color: var(--danger);
	}
	.altlist {
		list-style: none;
		margin: 0.3rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.25rem;
	}
	.altlist li {
		display: flex;
		align-items: center;
		gap: 0.4em;
	}
	.aname {
		flex: 1;
	}
	.pct {
		color: var(--muted);
	}
	.pct[data-strong='true'] {
		color: var(--success);
		font-weight: 700;
	}
	.rem {
		color: var(--muted);
		font-size: 0.9em;
	}
</style>
