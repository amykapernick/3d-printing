import { execFileSync } from 'node:child_process';

// Parse a Bambu Lab store invoice PDF into filament purchase rows.
//
// Each line item in the (pdftotext -layout) text looks like:
//   PLA Matte
//   SKU: A01-D3-1.75-1000-splfree
//                         4   AU$30.99   AU$68.18   GST(10%)   AU$5.07   AU$55.78
//   Variant: Matte Ash Gray (11102) / Refill / 1 kg
// We anchor on the numbers line (one per item), look back for the SKU + product,
// and forward/within the window for the Variant. Only SKUs with a "-1.75-<weight>-"
// segment are filament (this skips printers, nozzles, AMS units, etc.).
// Price paid per spool = "Items SubTotal" ÷ qty (after the refill/bundle discount).

const MATERIAL = /^(PLA|PETG|PET|ABS|ASA|TPU|PC|PA|PVA|PAHT|PPA|PPS|PPGF)\b/i;
const NUMBERS = /(\d+)\s+AU\$([\d.]+)\s+AU\$([\d.]+)\s+GST\(\d+%\)\s+AU\$([\d.]+)\s+AU\$([\d.]+)\s*$/;

export interface InvoiceRow {
	name: string; // e.g. "PLA Matte Matte Ash Gray"
	material: string; // e.g. "PLA"
	colorName: string;
	colorCode: string;
	type: string; // "Refill" | "Filament with spool" | …
	weight: number; // grams per spool
	qty: number;
	pricePer: number; // price paid per spool
	date: string; // invoice/payment date (YYYY-MM-DD)
}

export interface ParsedInvoice {
	order: string;
	date: string;
	rows: InvoiceRow[];
}

export function parseBambuInvoice(text: string): ParsedInvoice {
	const order = (text.match(/Order Number:\s*(\S+)/) || [])[1] || '';
	const date =
		(text.match(/Invoice Date:\s*([\d-]+)/) || [])[1] ||
		(text.match(/Payment Date:\s*([\d-]+)/) || [])[1] ||
		'';

	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l !== '');
	const rows: InvoiceRow[] = [];

	for (let i = 0; i < lines.length; i++) {
		const num = NUMBERS.exec(lines[i]);
		if (!num) continue;

		let skuIdx = -1;
		for (let j = i; j >= 0 && j >= i - 3; j--)
			if (/SKU:/.test(lines[j])) {
				skuIdx = j;
				break;
			}
		if (skuIdx < 0) continue;

		const skuW = lines[skuIdx].match(/-1\.75-(\d+)-/);
		if (!skuW) continue; // not a filament line

		const product = lines[skuIdx - 1] || '';
		if (!MATERIAL.test(product)) continue;

		// Variant can sit before or after the numbers line and wrap across lines;
		// gather from "Variant:" onward, skipping any interleaved numbers line, until "kg".
		const parts: string[] = [];
		for (let j = skuIdx; j < lines.length && j <= i + 6; j++) {
			if (!parts.length && !/Variant:/.test(lines[j])) continue;
			if (NUMBERS.test(lines[j])) continue;
			parts.push(lines[j]);
			if (/kg/i.test(lines[j])) break;
		}
		const v = parts
			.join(' ')
			.match(/Variant:\s*(.+?)\s*\((\d+)\)\s*\/\s*([^/]+?)\s*\/\s*([\d.]+)\s*kg/i);

		const qty = Number(num[1]) || 1;
		rows.push({
			name: v ? `${product.trim()} ${v[1].trim()}` : product.trim(),
			material: product.trim().split(' ')[0],
			colorName: v ? v[1].trim() : '',
			colorCode: v ? v[2] : '',
			type: v ? v[3].trim() : '',
			weight: Number(skuW[1]) || 1000,
			qty,
			pricePer: Math.round((Number(num[5]) / qty) * 100) / 100,
			date
		});
	}

	return { order, date, rows };
}

/** Extract text from a PDF via poppler's pdftotext (installed in the app image). */
export function pdfToText(buffer: Buffer): string {
	try {
		return execFileSync('pdftotext', ['-layout', '-', '-'], { input: buffer, encoding: 'utf8' });
	} catch (e) {
		throw new Error(
			`Could not read the PDF (is pdftotext/poppler installed?): ${(e as Error).message}`
		);
	}
}
