<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const ha = $derived(data.ha);
</script>

<h1>Printers</h1>

{#if !ha.configured}
	<p class="card">
		Home Assistant isn't configured. Set <code>HA_URL</code> and <code>HA_TOKEN</code> in
		<code>.env</code> (a long-lived access token from HA) and reload.
	</p>
{:else if !ha.online}
	<p class="card">Home Assistant is configured but unreachable — check the URL and token.</p>
{:else if ha.printers.length === 0}
	<p class="card">No Bambu printers found in Home Assistant (expecting ha-bambulab entities).</p>
{:else}
	{#each ha.printers as printer (printer.id)}
		<section class="printer" aria-label={printer.name}>
			<div class="ptitle">
				<h2>{printer.name}</h2>
				<span class="badge" data-on={printer.status.online}>{printer.status.online ? 'online' : 'offline'}</span>
				{#if printer.status.status}<span class="badge neutral">{printer.status.status}</span>{/if}
				{#if printer.status.hasError}<span class="badge err">error</span>{/if}
			</div>
			{#if printer.status.task}<p class="task">{printer.status.task}</p>{/if}

			<section class="status card" aria-label="Print status">
				<div><span class="l">Stage</span><span class="v">{printer.status.stage ?? '—'}</span></div>
				<div><span class="l">Progress</span><span class="v">{printer.status.progressPct ?? '—'}%</span></div>
				<div><span class="l">Remaining</span><span class="v">{printer.status.remainingMin ?? '—'} min</span></div>
				<div>
					<span class="l">Layer</span>
					<span class="v">{printer.status.currentLayer ?? '—'}{printer.status.totalLayers ? ` / ${printer.status.totalLayers}` : ''}</span>
				</div>
				<div>
					<span class="l">Nozzle</span>
					<span class="v">{printer.status.nozzleTemp ?? '—'}°{printer.status.nozzleTarget ? ` → ${printer.status.nozzleTarget}°` : ''}</span>
				</div>
				<div><span class="l">Print weight</span><span class="v">{printer.status.printWeightG ?? '—'} g</span></div>
			</section>

			<h3>AMS</h3>
			{#if printer.trays.length === 0}
				<p class="hint">No AMS trays reported.</p>
			{:else}
				<ul class="trays">
					{#each printer.trays as tray (tray.entityId)}
						<li class="card" class:active={tray.active}>
							<span class="swatch" style="--s: {tray.color ?? 'var(--border)'}"></span>
							<div class="meta">
								<strong>{tray.name}</strong>
								<span class="sub">{tray.type ?? 'empty'}</span>
							</div>
							{#if tray.remainingPct != null}<span class="pct">{tray.remainingPct}%</span>{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
	<p class="hint">
		Remaining % is only reliable for RFID Bambu spools — real stock lives in
		<a href="/filaments">Filaments</a> (Spoolman).
	</p>
{/if}

<style>
	.printer {
		margin-bottom: 2rem;
	}
	.ptitle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.25rem;
	}
	.ptitle h2 {
		margin: 0;
	}
	.hint {
		color: var(--muted);
	}
	.badge {
		padding: 0.15em 0.6em;
		border-radius: 999px;
		font-size: 0.8em;
		font-weight: 600;
		background: var(--danger);
		color: #fff;
	}
	.badge[data-on='true'] {
		background: var(--success);
	}
	.badge.neutral {
		background: var(--border);
		color: var(--ink);
	}
	.badge.err {
		background: var(--danger);
	}
	.task {
		font-weight: 600;
		margin: 0 0 0.75rem;
	}
	.status {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.status .l {
		display: block;
		color: var(--muted);
		font-size: 0.8em;
	}
	.status .v {
		font-size: 1.3rem;
		font-weight: 700;
	}
	.trays {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
	}
	.trays li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.75rem;
	}
	.trays li.active {
		border-color: var(--accent);
	}
	.swatch {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--s);
		border: 1px solid var(--border);
	}
	.sub {
		color: var(--muted);
		font-size: 0.9em;
	}
	.pct {
		font-weight: 700;
	}
</style>
