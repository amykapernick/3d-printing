<script lang="ts">
	import { enhance } from '$app/forms';
	// `p` is an existing plate (has id) or a blank template for adding.
	let { p, model } = $props();
	const isNew = $derived(!p.id);
</script>

<form
	method="POST"
	action="?/savePlate"
	use:enhance={() => async ({ update }) => update({ reset: isNew })}
	class="plate_row"
>
	{#if isNew}
		<input type="hidden" name="model" value={model} />
	{:else}
		<input type="hidden" name="id" value={p.id} />
	{/if}
	{#if !isNew}<span class="pos">Plate {p.position}</span>{/if}
	<label>Max copies<input name="max_copies" type="number" min="1" value={p.max_copies ?? 1} /></label>
	<label>Time @1 (min)<input name="time_1" type="number" min="0" value={p.time_1 ?? ''} /></label>
	<label>Time @2 (min)<input name="time_2" type="number" min="0" value={p.time_2 ?? ''} /></label>
	<label>Time @full (min)<input name="time_full" type="number" min="0" value={p.time_full ?? ''} /></label>
	<button class="button" type="submit">{isNew ? 'Add plate' : 'Save'}</button>
	{#if !isNew}
		<button class="button is_ghost" type="submit" formaction="?/deletePlate" aria-label="Delete plate">✕</button>
	{/if}
</form>

<style>
	.plate_row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: end;
	}
	.pos {
		font-weight: 700;
		align-self: center;
	}
	label {
		display: grid;
		gap: 0.2em;
		font-size: 0.8em;
		color: var(--muted);
	}
	input {
		width: 6rem;
	}
</style>
