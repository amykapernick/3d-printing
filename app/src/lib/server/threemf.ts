import { unzipSync, strFromU8 } from 'fflate';

// Parse a sliced Bambu Studio / Orca .3mf (a ZIP) for per-plate filament usage.
// Built against the documented layout:
//   Metadata/slice_info.config  — one <plate> per plate, each with
//     <metadata key="prediction" value="<seconds>"/>
//     <metadata key="weight" value="<grams>"/>
//     <filament id="N" tray_info_idx="GFA00" type="PLA" color="#RRGGBB"
//               used_m="<metres>" used_g="<grams>"/>
//   Metadata/project_settings.config — JSON, may hold flush_volumes_matrix (mm^3)
//     used as a best-effort purge/flush estimate.

export interface ThreeMfFilament {
	slot: number; // Bambu filament id / AMS slot (1-based)
	type: string; // e.g. PLA, PETG
	color: string; // #RRGGBB
	trayInfoIdx: string; // Bambu filament code, e.g. GFA00
	usedG: number;
	usedM: number;
}

export interface ThreeMfPlate {
	index: number;
	predictionSec: number;
	weightG: number; // total filament weight for the plate
	filaments: ThreeMfFilament[];
}

export interface ThreeMfInfo {
	plates: ThreeMfPlate[];
	/** Best-effort total purge/flush grams across the file (0 if not derivable). */
	flushG: number;
}

const num = (v: string | undefined) => (v ? Number(v) : 0);

function attr(tag: string, name: string): string | undefined {
	const m = tag.match(new RegExp(`${name}="([^"]*)"`));
	return m?.[1];
}

function parseSliceInfo(xml: string): ThreeMfPlate[] {
	const plates: ThreeMfPlate[] = [];
	// Each <plate>…</plate> block.
	for (const block of xml.match(/<plate>[\s\S]*?<\/plate>/g) ?? []) {
		const meta = (key: string) => {
			const m = block.match(new RegExp(`<metadata key="${key}" value="([^"]*)"`));
			return m?.[1];
		};
		const filaments: ThreeMfFilament[] = [];
		for (const tag of block.match(/<filament\b[^>]*\/?>/g) ?? []) {
			filaments.push({
				slot: num(attr(tag, 'id')),
				type: attr(tag, 'type') ?? '',
				color: attr(tag, 'color') ?? '',
				trayInfoIdx: attr(tag, 'tray_info_idx') ?? '',
				usedG: num(attr(tag, 'used_g')),
				usedM: num(attr(tag, 'used_m'))
			});
		}
		plates.push({
			index: num(meta('index')) || plates.length + 1,
			predictionSec: num(meta('prediction')),
			weightG: num(meta('weight')),
			filaments
		});
	}
	return plates;
}

/** Sum of a flush_volumes_matrix (mm^3) converted to grams at a default PLA density. */
function parseFlush(json: string): number {
	try {
		const cfg = JSON.parse(json) as { flush_volumes_matrix?: unknown };
		const matrix = cfg.flush_volumes_matrix;
		if (!Array.isArray(matrix)) return 0;
		const mm3 = matrix.reduce((sum: number, v) => sum + (Number(v) || 0), 0);
		const density = 1.24; // g/cm^3, PLA default
		return (mm3 / 1000) * density; // mm^3 -> cm^3 -> g
	} catch {
		return 0;
	}
}

export function parseThreeMf(buffer: Uint8Array): ThreeMfInfo {
	const files = unzipSync(buffer);
	const find = (suffix: string) =>
		Object.keys(files).find((k) => k.toLowerCase().endsWith(suffix.toLowerCase()));

	const sliceKey = find('slice_info.config');
	const plates = sliceKey ? parseSliceInfo(strFromU8(files[sliceKey])) : [];

	const settingsKey = find('project_settings.config');
	const flushG = settingsKey ? parseFlush(strFromU8(files[settingsKey])) : 0;

	return { plates, flushG };
}

/** Aggregate per-slot grams across all plates (for prefilling model_filaments). */
export function aggregateBySlot(info: ThreeMfInfo): ThreeMfFilament[] {
	const bySlot = new Map<number, ThreeMfFilament>();
	for (const plate of info.plates) {
		for (const f of plate.filaments) {
			const existing = bySlot.get(f.slot);
			if (existing) {
				existing.usedG += f.usedG;
				existing.usedM += f.usedM;
			} else {
				bySlot.set(f.slot, { ...f });
			}
		}
	}
	return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}
