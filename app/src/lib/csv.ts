// Minimal CSV parser — handles quoted fields, embedded commas/newlines, and "" escapes.
// Returns one object per data row, keyed by the lowercased, trimmed header names.

export function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = [];
	let field = '';
	let row: string[] = [];
	let inQuotes = false;

	const pushField = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		pushField();
		// skip blank lines
		if (row.some((c) => c.trim() !== '')) rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			pushField();
		} else if (c === '\n') {
			pushRow();
		} else if (c === '\r') {
			// ignore; \n handles the row
		} else {
			field += c;
		}
	}
	if (field !== '' || row.length) pushRow();

	if (rows.length === 0) return [];
	const headers = rows[0].map((h) => h.trim().toLowerCase());
	return rows.slice(1).map((cells) => {
		const obj: Record<string, string> = {};
		headers.forEach((h, idx) => (obj[h] = (cells[idx] ?? '').trim()));
		return obj;
	});
}
