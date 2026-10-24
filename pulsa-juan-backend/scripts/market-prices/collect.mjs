#!/usr/bin/env node
// Market price collector (dev tool, run on demand from a workstation — never on the server).
//
// Reads the PUBLIC price pages of other pulsa reseller sites listed in sources.json
// (all run the same panel: /harga/<category>[/all]?page=N with "Kode / Produk /
// Reseller" per product), and writes an .xlsx in Product Updater format:
//   one sheet per operator: KODE PRODUK | NAMA | KATEGORI | KET | harga | SUMBER HARGA | <source>…
//   harga = cheapest reseller price seen for that product (reference cost)
//   + RINGKASAN (run summary) and SEMUA SUMBER (every product from every source)
// Upload it in the dashboard Product Updater with "Kode referensi pasar" — the codes
// are the other sites' codes, NOT our OtomaX codes, so those products start manual.
//
//   node scripts/market-prices/collect.mjs [--out file.xlsx] [--only topupkuota,okekios]
//                                          [--max-pages 60] [--union]
//   --union: also add products that only appear in non-primary sources
//
// Etiquette: public pages only, one request at a time with delayMs between them,
// an honest User-Agent, robots.txt checked when sources were added.
import { strToU8, zipSync } from 'fflate';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const config = JSON.parse(readFileSync(arg('--config', join(HERE, 'sources.json')), 'utf8'));
const only = arg('--only', null)?.split(',');
const maxPages = Number(arg('--max-pages', 60));
const union = argv.includes('--union');
const today = new Date().toISOString().slice(0, 10);
const out = resolve(arg('--out', `harga-pasar-${today}.xlsx`));
const UA = 'Mozilla/5.0 (compatible; PulsaJuanPriceReference/1.0; +https://pulsajuan.studiosclo.uk)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastFetch = 0;
async function fetchText(url) {
  const wait = lastFetch + config.delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

// ---- parsing ----

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => (ENTITIES[e.toLowerCase()] ?? (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m)));
const clean = (s) => decode(s).replace(/\s+/g, ' ').trim();
const rupiah = (s) => Number(String(s).replace(/[^\d]/g, ''));

/** Products on one page: [{code, name, price, available}] (commented-out prices ignored). */
export function parseProducts(html) {
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  const parts = body.split(/<i>\s*Kode\s*<\/i>/i);
  const products = [];
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const code = chunk.match(/<b>\s*([^<]+?)\s*<\/b>/)?.[1];
    const name = chunk.match(/<i>\s*Produk\s*<\/i>\s*([^<]+)</i)?.[1];
    const reseller = chunk.match(/<i>\s*Reseller\s*<\/i>\s*Rp\s*([\d.,]+)/i)?.[1];
    const reguler = chunk.match(/<i>\s*(?:Reguler|Harga)\s*<\/i>\s*Rp\s*([\d.,]+)/i)?.[1];
    if (!code || !name || !(reseller || reguler)) continue;
    // Rp 0 rows are helpers ("CEK…"/"LIST…" offer checks), not products
    if (!rupiah(reseller ?? reguler)) continue;
    // two-step "check offer → pay" flows (CEK…/LIST…/BYR… "Bayar …"): the price is only a fee
    if (/^(cek|list|bayar)\b/i.test(clean(name).split(' - ').pop() ?? '') || /^(CEK|LIST|BYR)/.test(clean(code))) continue;
    // the row's status badge is the last tooltip before its "Kode" label
    const status = [...parts[i - 1].matchAll(/data-title="([^"]*)"/g)].pop()?.[1] ?? '';
    products.push({ code: clean(code), name: clean(name), price: rupiah(reseller ?? reguler), available: !/gangguan|kosong|habis|tidak/i.test(status) });
  }
  return products;
}

function pageUrls(html, base, category) {
  const re = new RegExp(`href="(?:${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?(/harga/${category}(?:/all)?)\\?page=(\\d+)"`, 'g');
  let path = null;
  let max = 1;
  for (const m of html.matchAll(re)) {
    path = path ?? m[1];
    max = Math.max(max, Number(m[2]));
  }
  if (!path) return [];
  return Array.from({ length: Math.min(max, maxPages) - 1 }, (_, i) => `${base}${path}?page=${i + 2}`);
}

// ---- operator / category ----

const OPERATOR_RULES = [
  ['TELKOMSEL', /\bby\.?\s?u\b|\bbyu\b/i],
  ['AXIS', /\baxis\b|\bowsem\b|\bbronet\b/i],
  ['XL', /\bxl\b|\bxtra\b|\bxl-/i],
  ['TELKOMSEL', /telkomsel|\btsel\b|simpati|\bkartu as\b|\bloop\b/i],
  ['SMARTFREN', /smartfren|\bsmart\b/i],
  ['INDOSAT', /indosat|\bim3\b|mentari|freedom/i],
  ['TRI', /\bthree\b|\btri\b|\bhappy\b|\baon\b/i],
];
function operatorOf(text, category) {
  for (const [op, re] of OPERATOR_RULES) if (re.test(text)) return op;
  for (const [op, re] of OPERATOR_RULES) if (re.test(category.replace(/-/g, ' '))) return op;
  return null;
}

/** "XL Data All jaringan 30 Hari - 3GB Full …" → group + item; pulsa groups collapse to "Pulsa". */
function splitName(name, category) {
  const i = name.indexOf(' - ');
  const group = i > 0 ? name.slice(0, i).trim() : category.replace(/-/g, ' ');
  const item = i > 0 ? name.slice(i + 3).trim() : name;
  const isPulsa = /pulsa/i.test(group) && !/paket|data|kuota/i.test(group);
  return { group: isPulsa ? 'Pulsa' : group, item };
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---- crawl ----

async function crawlSource(source) {
  const found = new Map();
  for (const category of source.categories) {
    let urls = [`${source.base}/harga/${category}`];
    for (let i = 0; i < urls.length; i++) {
      let html;
      try {
        html = await fetchText(urls[i]);
      } catch (e) {
        console.warn(`  ! ${e.message}`);
        continue;
      }
      if (i === 0) urls = urls.concat(pageUrls(html, source.base, category));
      const products = parseProducts(html);
      for (const p of products) {
        const { group, item } = splitName(p.name, category);
        const operator = operatorOf(`${group} ${item}`, category);
        if (!operator) continue;
        const key = `${operator}|${p.code}`;
        if (!found.has(key)) found.set(key, { ...p, source: source.name, category, group, item, operator });
      }
      process.stdout.write(`\r  ${source.name}/${category} page ${i + 1}/${urls.length} — ${found.size} products   `);
      // stop on a page with no product rows at all (not one whose rows were all filtered out)
      if (i > 0 && !/<i>\s*Kode\s*<\/i>/i.test(html)) break;
    }
  }
  process.stdout.write('\n');
  return [...found.values()];
}

// ---- xlsx writer (inline strings, no styles) ----

const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (n) => (n < 26 ? String.fromCharCode(65 + n) : colName(Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26)));
function sheetXml(rows) {
  const body = rows
    .map((row, r) =>
      `<row r="${r + 1}">${row
        .map((v, c) => {
          const ref = `${colName(c)}${r + 1}`;
          if (v === null || v === undefined || v === '') return '';
          return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
        })
        .join('')}</row>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}
function writeXlsx(path, sheets) {
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.rows)));
  writeFileSync(path, zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));
}

// ---- main ----

async function main() {
  const sources = config.sources.filter((s) => !only || only.includes(s.name));
  const operators = config.operators;
  const all = [];
  for (const source of sources) {
    console.log(`→ ${source.name} (${source.base})`);
    all.push(...(await crawlSource(source)));
  }
  // groups agents can't sell from the app (starter packs, bulk, physical voucher activation)
  const exclude = (config.excludeGroups ?? []).map((x) => x.toLowerCase());
  const inScope = all.filter((p) => operators.includes(p.operator) && !exclude.some((x) => `${p.group} ${p.category}`.toLowerCase().includes(x)));
  const primary = config.primary;
  const others = sources.map((s) => s.name).filter((n) => n !== primary);
  const byCode = new Map();
  const byName = new Map();
  for (const p of inScope) {
    if (p.source === primary) continue;
    byCode.set(`${p.source}|${p.operator}|${p.code}`, p);
    byName.set(`${p.source}|${p.operator}|${norm(p.group + p.item)}`, p);
  }

  const catalog = inScope.filter((p) => p.source === primary);
  if (union) {
    const seen = new Set(catalog.map((p) => `${p.operator}|${norm(p.group + p.item)}`));
    for (const p of inScope) {
      const k = `${p.operator}|${norm(p.group + p.item)}`;
      if (p.source !== primary && !seen.has(k)) {
        seen.add(k);
        catalog.push(p);
      }
    }
  }

  const sheets = [];
  const summary = [['Operator', 'Produk', 'Ada pembanding', ...sources.map((s) => s.name)]];
  for (const op of operators) {
    const products = catalog.filter((p) => p.operator === op);
    if (!products.length) continue;
    const rows = [['KODE PRODUK', 'NAMA', 'KATEGORI', 'KET', 'harga', 'SUMBER HARGA', 'STOK', ...sources.map((s) => s.name)]];
    let compared = 0;
    const counts = Object.fromEntries(sources.map((s) => [s.name, 0]));
    for (const p of products) {
      const prices = { [p.source]: p };
      for (const o of [primary, ...others]) {
        if (o === p.source) continue;
        const m = byCode.get(`${o}|${op}|${p.code}`) ?? byName.get(`${o}|${op}|${norm(p.group + p.item)}`);
        if (m) prices[o] = m;
      }
      const entries = Object.entries(prices);
      if (entries.length > 1) compared++;
      entries.forEach(([s]) => counts[s]++);
      // cheapest in-stock price; out-of-stock prices only when nothing is in stock
      const pool = entries.some(([, x]) => x.available) ? entries.filter(([, x]) => x.available) : entries;
      const [cheapSource, cheap] = pool.reduce((a, b) => (b[1].price < a[1].price ? b : a));
      rows.push([
        p.code,
        p.item,
        p.group,
        '',
        cheap.price,
        `${cheapSource} (${cheap.code})`,
        entries.some(([, x]) => x.available) ? 'tersedia' : 'gangguan di semua sumber',
        ...sources.map((s) => (prices[s.name] ? `${prices[s.name].code} · ${prices[s.name].price}${prices[s.name].available ? '' : ' (gangguan)'}` : '')),
      ]);
    }
    sheets.push({ name: op, rows });
    summary.push([op, products.length, compared, ...sources.map((s) => counts[s.name])]);
  }
  sheets.unshift({
    name: 'RINGKASAN',
    rows: [
      [`Harga pasar ${today} — referensi harga reseller dari situs publik. Kode = kode situs sumber, BUKAN kode OtomaX.`],
      ['Unggah di Product Updater dengan pilihan "Kode referensi pasar". harga = harga reseller termurah yang ditemukan.'],
      [],
      ...summary,
      [],
      ['Sumber', 'URL'],
      ...sources.map((s) => [s.name, s.base]),
    ],
  });
  sheets.push({
    name: 'SEMUA SUMBER',
    rows: [['Sumber', 'Operator', 'Kategori situs', 'Kode toko', 'Grup', 'Produk', 'Rp', 'Tersedia'], ...all.map((p) => [p.source, p.operator, p.category, p.code, p.group, p.item, p.price, p.available ? 'ya' : 'tidak'])],
  });
  writeXlsx(out, sheets);
  console.log(`\n✔ ${catalog.length} produk (${operators.join(', ')}) dari ${sources.length} sumber → ${out}`);
  for (const r of summary.slice(1)) console.log(`  ${r[0]}: ${r[1]} produk, ${r[2]} dengan pembanding`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
