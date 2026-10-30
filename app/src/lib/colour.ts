// Classify a filament's hex colour into a family + shade, so a model can require a
// general colour ("yellow", "light yellow") that any in-stock filament of that family
// can satisfy. Pure + shared (server deduction/orders/printable and the editor UI).

export const FAMILIES = [
	'red',
	'orange',
	'brown',
	'yellow',
	'green',
	'cyan',
	'blue',
	'purple',
	'pink',
	'white',
	'grey',
	'black'
] as const;
export type ColourFamily = (typeof FAMILIES)[number];
export type Shade = 'any' | 'light' | 'dark';

export interface GeneralReq {
	family: ColourFamily;
	shade: Shade;
	material?: string;
}

export interface Classified {
	family: ColourFamily;
	shade: Exclude<Shade, 'any'>;
}

function hexToRgb(hex: string): [number, number, number] | null {
	const h = hex.replace(/^#/, '').slice(0, 6);
	if (h.length < 6 || /[^0-9a-f]/i.test(h)) return null;
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;
	const d = max - min;
	if (d !== 0) {
		s = d / (1 - Math.abs(2 * l - 1));
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return [h, s, l];
}

/** Classify a hex colour into a family + shade, or null if it can't be parsed. */
export function classify(hex: string | null | undefined): Classified | null {
	if (!hex) return null;
	const rgb = hexToRgb(hex);
	if (!rgb) return null;
	const [h, s, l] = rgbToHsl(...rgb);
	const tier: Exclude<Shade, 'any'> = l > 0.6 ? 'light' : 'dark';

	// Neutrals: low saturation, or extreme lightness.
	if (s < 0.12 || l > 0.95 || l < 0.05) {
		if (l >= 0.8) return { family: 'white', shade: 'light' };
		if (l <= 0.2) return { family: 'black', shade: 'dark' };
		return { family: 'grey', shade: tier };
	}

	// Warm, dark, moderately-saturated colours read as brown.
	if (h < 45 && l < 0.4) return { family: 'brown', shade: 'dark' };

	let family: ColourFamily;
	if (h < 15 || h >= 345) family = 'red';
	else if (h < 45) family = 'orange';
	else if (h < 70) family = 'yellow';
	else if (h < 160) family = 'green';
	else if (h < 195) family = 'cyan';
	else if (h < 255) family = 'blue';
	else if (h < 290) family = 'purple';
	else family = 'pink';

	return { family, shade: tier };
}

// A representative hex per family, for drawing a swatch of a general colour requirement.
const FAMILY_HEX: Record<ColourFamily, string> = {
	red: '#d02020',
	orange: '#e06a10',
	brown: '#6b4423',
	yellow: '#f0c400',
	green: '#3aa050',
	cyan: '#10b0c0',
	blue: '#2050d0',
	purple: '#7040c0',
	pink: '#e060a0',
	white: '#f2f2f2',
	grey: '#808080',
	black: '#202020'
};
export const familyHex = (f: string): string => FAMILY_HEX[f as ColourFamily] ?? '#888888';

/** Colour similarity as a 0–100% (100 = identical), from RGB distance. */
export function matchPct(a: string | null | undefined, b: string | null | undefined): number {
	const ra = a ? hexToRgb(a) : null;
	const rb = b ? hexToRgb(b) : null;
	if (!ra || !rb) return 0;
	const d = Math.sqrt((ra[0] - rb[0]) ** 2 + (ra[1] - rb[1]) ** 2 + (ra[2] - rb[2]) ** 2);
	return Math.max(0, Math.round(100 * (1 - d / 441.6729)));
}

/** Does a filament (by hex + material) satisfy a general requirement? */
export function matchesGeneral(
	req: GeneralReq,
	filament: { color_hex?: string | null; material?: string }
): boolean {
	const c = classify(filament.color_hex);
	if (!c || c.family !== req.family) return false;
	if (req.shade !== 'any' && c.shade !== req.shade) return false;
	if (req.material && !(filament.material ?? '').toLowerCase().includes(req.material.toLowerCase()))
		return false;
	return true;
}
