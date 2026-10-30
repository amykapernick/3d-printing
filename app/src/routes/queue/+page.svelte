<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const active = $derived(
		data.rows.filter((r) => r.item.status === 'queued' || r.item.status === 'printing')
	);
	const finished = $derived(
		data.rows.filter((r) => r.item.status === 'done' || r.item.status === 'cancelled')
	);
	const fmt = (min: number) => {
		if (!min) return '—';
		const h = Math.floor(min / 60);
		const m = Math.round(min % 60);
		return h ? `${h}h ${m}m` : `${m}m`;
	};
</script>

<h1>Queue</h1>
<p class="hint">Completing a print records a job and deducts Spoolman stock. Personal vs business is set per queued item, not on the model.</p>

{#if form?.warning}<p class="warn" role="status">{form.warning}</p>{/if}

<form method="POST" action="?/add" use:enhance class="card add">
	<label>
		Model
		<select name="model" required>
			<option value="">— pick a model —</option>
			{#each data.models as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
		</select>
	</label>
	<label>Copies<input name="copies" type="number" min="1" value="1" /></label>
	<label>
		Type
		<select name="print_type">
			<option value="business">business</option>
			<option value="personal">personal</option>
		</select>
	</label>
	<button class="button" type="submit">Add to queue</button>
	{#if form?.error}<span class="error" role="alert">{form.error}</span>{/if}
</form>

{#if active.length === 0}
	<p class="hint">Nothing queued.</p>
{:else}
	<ol class="queue">
		{#each active as row, i (row.item.id)}
			<li class="card" data-status={row.item.status}>
				<div class="head">
					<a class="name" href="/models/{row.item.model}">{row.item.expand?.model?.name ?? 'model'}</a>
					<span class="derived">{row.plates} plate{row.plates === 1 ? '' : 's'} · ~{fmt(row.estMin)}</span>
					<div class="reorder">
						<form method="POST" action="?/move" use:enhance>
							<input type="hidden" name="id" value={row.item.id} />
							<button class="button is_ghost" name="dir" value="up" disabled={i === 0} aria-label="Move up">↑</button>
						</form>
						<form method="POST" action="?/move" use:enhance>
							<input type="hidden" name="id" value={row.item.id} />
							<button class="button is_ghost" name="dir" value="down" disabled={i === active.length - 1} aria-label="Move down">↓</button>
						</form>
					</div>
				</div>
				<form method="POST" action="?/save" use:enhance class="controls">
					<input type="hidden" name="id" value={row.item.id} />
					<label>Copies<input name="copies" type="number" min="1" value={row.item.copies} /></label>
					<label>
						Type
						<select name="print_type">
							<option value="business" selected={row.item.print_type === 'business'}>business</option>
							<option value="personal" selected={row.item.print_type === 'personal'}>personal</option>
						</select>
					</label>
					<label>
						Status
						<select name="status">
							<option value="queued" selected={row.item.status === 'queued'}>queued</option>
							<option value="printing" selected={row.item.status === 'printing'}>printing</option>
							<option value="cancelled" selected={row.item.status === 'cancelled'}>cancelled</option>
						</select>
					</label>
					<button class="button is_ghost" type="submit">Save</button>
				</form>
				<div class="actions">
					<form method="POST" action="?/complete" use:enhance>
						<input type="hidden" name="id" value={row.item.id} />
						<button class="button" type="submit">✓ Complete</button>
					</form>
					<form method="POST" action="?/remove" use:enhance>
						<input type="hidden" name="id" value={row.item.id} />
						<button class="button is_ghost" type="submit" aria-label="Remove">✕</button>
					</form>
				</div>
			</li>
		{/each}
	</ol>
{/if}

{#if finished.length > 0}
	<h2>Recent</h2>
	<ul class="done_list">
		{#each finished.slice(0, 15) as row (row.item.id)}
			<li>
				<span class="dot" data-status={row.item.status}></span>
				{row.item.expand?.model?.name ?? 'model'} — {row.item.status} ({row.item.print_type}, ×{row.item.copies})
				<form method="POST" action="?/remove" use:enhance class="inline">
					<input type="hidden" name="id" value={row.item.id} />
					<button class="button is_ghost small" type="submit" aria-label="Remove">✕</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.hint {
		color: var(--muted);
	}
	.warn {
		color: var(--accent);
		font-weight: 600;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.75rem;
		margin-bottom: var(--space);
	}
	.add label {
		display: grid;
		gap: 0.25em;
		font-weight: 600;
		font-size: 0.9em;
	}
	.add select,
	.add input {
		width: 12rem;
	}
	.add input[name='copies'] {
		width: 6rem;
	}
	.queue {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}
	.queue li[data-status='printing'] {
		border-left: 3px solid var(--accent);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}
	.name {
		font-weight: 700;
		font-size: 1.1rem;
	}
	.derived {
		color: var(--muted);
		font-size: 0.9em;
	}
	.reorder {
		display: flex;
		gap: 0.25rem;
		margin-left: auto;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: end;
	}
	.controls label {
		display: grid;
		gap: 0.2em;
		font-size: 0.8em;
		color: var(--muted);
	}
	.controls input,
	.controls select {
		width: 7rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.done_list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.done_list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--muted);
	}
	.dot {
		width: 0.6em;
		height: 0.6em;
		border-radius: 50%;
		background: var(--success);
	}
	.dot[data-status='cancelled'] {
		background: var(--danger);
	}
	.inline {
		display: inline;
		margin-left: auto;
	}
	.small {
		padding: 0.1em 0.4em;
	}
</style>
