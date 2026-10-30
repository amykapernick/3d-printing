<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { FAMILIES } from '#lib/colour';

	// `f` is an existing row (has id) or a blank template for adding (no id).
	let { f, model, spoolmanFilaments, money } = $props();
	let match = $state(untrack(() => f.match) ?? 'specific');

	const isNew = $derived(!f.id);
	const currentFilamentLabel = $derived(
		spoolmanFilaments.find((sf: { id: number }) => sf.id === f.spoolman_filament_id)?.label ?? ''
	);
</script>

<form
	method="POST"
	action="?/saveFilament"
	use:enhance={() => async ({ update }) => update({ reset: isNew })}
	class="fil_row"
>
	{#if isNew}
		<input type="hidden" name="model" value={model} />
	{:else}
		<input type="hidden" name="id" value={f.id} />
	{/if}
	<div class="line">
		<label>
			Requires
			<select name="match" bind:value={match}>
				<option value="specific">specific filament</option>
				<option value="general">any matching colour</option>
			</select>
		</label>
		{#if match === 'specific'}
			<label class="grow">
				Filament
				<span class="pickwrap">
					<span class="swatch" style="--s: {f.hex ?? 'var(--border)'}"></span>
					<input
						name="spoolman_filament"
						list="spoolman_filaments"
						value={currentFilamentLabel}
						placeholder="type to search… (blank = unmapped)"
					/>
				</span>
			</label>
		{:else}
			<label>
				Colour
				<select name="req_family">
					{#each FAMILIES as fam (fam)}<option value={fam} selected={f.req_family === fam}>{fam}</option>{/each}
				</select>
			</label>
			<label>
				Shade
				<select name="req_shade">
					<option value="any" selected={(f.req_shade ?? 'any') === 'any'}>any</option>
					<option value="light" selected={f.req_shade === 'light'}>light</option>
					<option value="dark" selected={f.req_shade === 'dark'}>dark</option>
				</select>
			</label>
			<label>Material<input name="req_material" list="materials" value={f.req_material ?? ''} placeholder="any" /></label>
		{/if}
		<label>Label<input name="colour_label" value={f.colour_label ?? ''} placeholder="optional" /></label>
	</div>
	<div class="line">
		<label class="g">Usage (g)<input name="usage" type="number" step="0.01" value={f.usage ?? ''} /></label>
		<label class="g">Purge (g)<input name="purge" type="number" step="0.01" value={f.purge ?? ''} /></label>
		{#if !isNew && match === 'general'}
				<span class="avail">{f.matchCount} match{f.matchCount === 1 ? '' : 'es'} · {f.availableG} g in stock</span>
			{:else if !isNew && match === 'specific' && f.spoolman_filament_id}
				<span class="avail">{f.availableG} g available in this colour</span>
			{/if}
		<button class="button" type="submit">{isNew ? 'Add filament' : 'Save'}</button>
		{#if !isNew}
			<button class="button is_ghost" type="submit" formaction="?/deleteFilament" aria-label="Delete row">✕</button>
		{/if}
	</div>
</form>

<style>
	.fil_row {
		display: grid;
		gap: 0.5rem;
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: end;
	}
	label {
		display: grid;
		gap: 0.2em;
		font-size: 0.8em;
		color: var(--muted);
	}
	.grow {
		flex: 1;
		min-width: 12rem;
	}
	.pickwrap {
		display: flex;
		align-items: center;
		gap: 0.4em;
	}
	.pickwrap input {
		flex: 1;
	}
	.swatch {
		width: 1.6em;
		height: 1.6em;
		border-radius: 0.25em;
		background: var(--s);
		border: 1px solid var(--border);
		flex: none;
	}
	.g input {
		width: 6rem;
	}
	.avail {
		color: var(--muted);
		font-size: 0.85em;
		align-self: center;
	}
</style>
