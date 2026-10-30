<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = $derived(data.settings);
</script>

<h1>Settings</h1>
<p class="hint">
	Business defaults for costing. Service URLs and secrets (Home Assistant, admin login) live in
	<code>.env</code>, not here.
</p>

<form method="POST" use:enhance={() => async ({ update }) => update({ reset: false })} class="card settings_form">
	<label>
		Currency
		<input name="currency" value={s.currency} maxlength="3" size="4" />
	</label>
	<label>
		Platform fee (%)
		<input name="platform_fee_pct" type="number" step="0.1" value={s.platform_fee_pct} />
	</label>
	<label>
		Default packaging cost
		<input name="packaging_default_cost" type="number" step="0.01" value={s.packaging_default_cost} />
	</label>

	<div class="actions">
		<button class="button" type="submit">Save</button>
		{#if form?.saved}<span class="saved" role="status">Saved</span>{/if}
		{#if form?.error}<span class="error" role="alert">{form.error}</span>{/if}
	</div>
</form>

<style>
	.hint {
		color: var(--muted);
	}
	.settings_form {
		display: grid;
		gap: var(--space);
		max-width: 28rem;
	}
	label {
		display: grid;
		gap: 0.25em;
		font-weight: 600;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.saved {
		color: var(--success);
	}
	.error {
		color: var(--danger);
	}
</style>
