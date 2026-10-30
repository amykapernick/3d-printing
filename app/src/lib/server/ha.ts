import { env } from 'node:process';

// Home Assistant REST client, used server-side only. Reads live printer/AMS state
// from the ha-bambulab integration. Entity ids vary by the printer's name, so we
// match ha-bambulab's documented entity/attribute shapes heuristically rather than
// hard-coding a device name.
//
// Configure HA_URL + HA_TOKEN (a long-lived access token) in .env. With neither set,
// everything here reports "not configured" and the UI degrades gracefully.

const base = (env.HA_URL ?? '').replace(/\/$/, '');
const token = env.HA_TOKEN ?? '';

export const haConfigured = () => Boolean(base && token);

interface HaState {
	entity_id: string;
	state: string;
	attributes: Record<string, unknown>;
}

async function states(): Promise<HaState[]> {
	const res = await fetch(`${base}/api/states`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) throw new Error(`HA ${res.status}`);
	return res.json() as Promise<HaState[]>;
}

export interface PrinterStatus {
	online: boolean;
	status: string | null;
	stage: string | null;
	task: string | null;
	progressPct: number | null;
	remainingMin: number | null;
	currentLayer: number | null;
	totalLayers: number | null;
	nozzleTemp: number | null;
	nozzleTarget: number | null;
	printWeightG: number | null;
	hasError: boolean;
}

export interface AmsTray {
	entityId: string;
	name: string;
	type: string | null;
	color: string | null;
	remainingPct: number | null;
	active: boolean;
}

export interface PrinterInfo {
	id: string; // ha-bambulab device base, e.g. "garage_x1c"
	name: string;
	status: PrinterStatus;
	trays: AmsTray[];
}

export interface HaSnapshot {
	configured: boolean;
	online: boolean;
	printers: PrinterInfo[];
}

const numOrNull = (v: unknown) => {
	const x = Number(v);
	return Number.isFinite(x) ? x : null;
};

const realState = (s?: HaState) =>
	s && !['unknown', 'unavailable', 'none', ''].includes(String(s.state).toLowerCase())
		? s.state
		: null;

const normaliseHex = (v: unknown) => {
	if (typeof v !== 'string' || !v) return null;
	// Bambu reports colours as hex, sometimes 8-digit RGBA and sometimes without '#'.
	return v.startsWith('#') ? v : `#${v}`;
};

const prettify = (base: string) =>
	base
		.split('_')
		.pop()!
		.replace(/\b\w/g, (c) => c.toUpperCase());

function buildPrinter(all: HaState[], base: string): PrinterInfo {
	// Entities for this printer are "<domain>.<base>_<suffix>".
	const get = (suffix: string, domain = 'sensor') =>
		all.find((s) => s.entity_id === `${domain}.${base}_${suffix}`);
	const isOn = (suffix: string) => get(suffix, 'binary_sensor')?.state === 'on';

	const status: PrinterStatus = {
		online: isOn('online'),
		status: realState(get('print_status')),
		stage: realState(get('current_stage')) ?? realState(get('print_status')),
		task: realState(get('task_name')) ?? realState(get('gcode_filename')),
		progressPct: numOrNull(get('print_progress')?.state),
		remainingMin: numOrNull(get('remaining_time')?.state),
		currentLayer: numOrNull(get('current_layer')?.state),
		totalLayers: numOrNull(get('total_layer_count')?.state),
		nozzleTemp: numOrNull(get('nozzle_temperature')?.state),
		nozzleTarget: numOrNull(get('nozzle_target_temperature')?.state),
		printWeightG: numOrNull(get('print_weight')?.state),
		hasError: isOn('print_error') || isOn('hms_errors')
	};

	const trays: AmsTray[] = all
		.filter(
			(s) =>
				s.entity_id.startsWith(`sensor.${base}_`) &&
				(/_ams_tray_\d+$/.test(s.entity_id) || /_external_spool$/.test(s.entity_id)) &&
				'remain' in s.attributes
		)
		.map((s) => {
			const a = s.attributes;
			const empty = Boolean(a.empty);
			return {
				entityId: s.entity_id,
				name: (a.friendly_name as string) ?? s.entity_id,
				type: empty ? null : ((a.name as string) ?? (a.type as string) ?? realState(s)),
				color: empty ? null : normaliseHex(a.color),
				remainingPct: empty ? null : numOrNull(a.remain),
				active: Boolean(a.active)
			};
		})
		.sort((x, y) => x.entityId.localeCompare(y.entityId));

	const name = realState(get('printer_name')) ?? prettify(base);
	return { id: base, name, status, trays };
}

export async function haSnapshot(): Promise<HaSnapshot> {
	if (!haConfigured()) return { configured: false, online: false, printers: [] };
	let all: HaState[];
	try {
		all = await states();
	} catch {
		return { configured: true, online: false, printers: [] };
	}

	// Each Bambu printer exposes a "<domain>.<base>_print_status" sensor; the base
	// identifies the device, so we build one PrinterInfo per distinct base.
	const bases = [
		...new Set(
			all
				.map((s) => s.entity_id.match(/^sensor\.(.+)_print_status$/)?.[1])
				.filter((b): b is string => Boolean(b))
		)
	].sort();

	return { configured: true, online: true, printers: bases.map((b) => buildPrinter(all, b)) };
}
