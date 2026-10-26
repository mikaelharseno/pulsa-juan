import type { XlsxSheet } from './xlsx';

// CSV price lists (e.g. exported from agent apps) → the same sheet shape as readXlsx.
// Delimiter auto-detected (; , or tab), quoted fields supported. With an OPERATOR
// column the rows are split into one sheet per operator; otherwise one sheet named
// after the file (operator picked in the updater).

function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const counts = [';', ',', '\t'].map((d) => [d, first.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(text: string): string[][] {
  const d = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === d) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export async function readCsv(file: File): Promise<XlsxSheet[]> {
  const rows = parseCsv((await file.text()).replace(/^﻿/, ''));
  const baseName = file.name.replace(/\.(csv|tsv|txt)$/i, '');
  const headerIdx = rows.findIndex((r) => r.some((c) => /^KODE/i.test(c)) && r.some((c) => /^HARGA/i.test(c)));
  const opCol = headerIdx >= 0 ? rows[headerIdx].findIndex((c) => /^OPERATOR$/i.test(c.trim())) : -1;
  if (opCol < 0) return [{ name: baseName, rows }];
  const header = rows[headerIdx];
  const byOp = new Map<string, string[][]>();
  for (const r of rows.slice(headerIdx + 1)) {
    const op = (r[opCol] ?? '').trim().toUpperCase() || 'LAINNYA';
    if (!byOp.has(op)) byOp.set(op, [header]);
    byOp.get(op)!.push(r);
  }
  return [...byOp.entries()].map(([name, sheetRows]) => ({ name, rows: sheetRows }));
}
