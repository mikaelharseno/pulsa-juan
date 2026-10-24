import { strFromU8, unzipSync } from 'fflate';

// Minimal .xlsx reader for price sheets: every sheet → rows of cell strings.
// Handles shared strings, inline strings and plain values (numbers as text);
// no formulas/dates/styles, which price lists don't need.

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function xml(files: Record<string, Uint8Array>, path: string) {
  const data = files[path];
  if (!data) throw new Error(`File xlsx tidak lengkap (${path})`);
  return new DOMParser().parseFromString(strFromU8(data), 'application/xml');
}

function textOf(el: Element) {
  return Array.from(el.getElementsByTagNameNS(MAIN, 't'))
    .map((t) => t.textContent ?? '')
    .join('');
}

function columnIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(file: File): Promise<XlsxSheet[]> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const shared = files['xl/sharedStrings.xml']
    ? Array.from(xml(files, 'xl/sharedStrings.xml').getElementsByTagNameNS(MAIN, 'si')).map(textOf)
    : [];
  const rels = xml(files, 'xl/_rels/workbook.xml.rels');
  const targets = Object.fromEntries(Array.from(rels.getElementsByTagName('Relationship')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']));

  return Array.from(xml(files, 'xl/workbook.xml').getElementsByTagNameNS(MAIN, 'sheet')).map((sheet) => {
    const target = targets[sheet.getAttributeNS(REL, 'id') ?? ''] ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.?\//, '')}`;
    const rows: string[][] = [];
    for (const row of Array.from(xml(files, path).getElementsByTagNameNS(MAIN, 'row'))) {
      const cells: string[] = [];
      for (const c of Array.from(row.getElementsByTagNameNS(MAIN, 'c'))) {
        const type = c.getAttribute('t');
        const v = c.getElementsByTagNameNS(MAIN, 'v')[0]?.textContent ?? null;
        const value = type === 'inlineStr' ? textOf(c) : v === null ? '' : type === 's' ? shared[Number(v)] ?? '' : v;
        cells[columnIndex(c.getAttribute('r') ?? 'A1')] = value.trim();
      }
      if (cells.some(Boolean)) rows.push(Array.from(cells, (x) => x ?? ''));
    }
    return { name: sheet.getAttribute('name') ?? 'Sheet', rows };
  });
}
