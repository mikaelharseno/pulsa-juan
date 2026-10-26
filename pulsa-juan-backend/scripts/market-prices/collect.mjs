#!/usr/bin/env node
// Market price collector (dev tool, run on demand from a workstation — never on the server).
//
// Reads the PUBLIC price pages of other pulsa reseller sites listed in sources.json
// (all run the same panel: /harga/<category>[/all]?page=N with "Kode / Produk /
// Reseller" per product), and writes a .tsv in the same layout as OtomaX's own
// "Produk" export, so the dashboard Product Updater reads both the same way:
//   Aktif | Kode | Nama | Provider (operator) | Kategori | Nominal | Hrg Beli | Hrg Jual |
//   Kosong | Gangguan | Sumber Harga | Stok | <source>…
//   Hrg Beli = Hrg Jual = cheapest reseller price seen for that product (reference cost)
// The "Sumber Harga" column marks it as a market file: the codes are the other sites'
// codes, NOT our OtomaX codes, so those products are imported as manual PSR-<code>.
//
//   node scripts/market-prices/collect.mjs [--out file.tsv] [--only topupkuota,okekios]
//        [--max-pages 60] [--union] [--otomax Produk.tsv] [--from-xlsx harga-pasar-….xlsx]
//   --union:     also add products that only appear in non-primary sources
//   --otomax:    leave out products our OtomaX center already sells (from its Produk export);
//                what was left out goes to <out>-duplikat.tsv for review
//   --from-xlsx: rebuild from an earlier run's .xlsx instead of crawling (prices unchanged)
//
// Etiquette: public pages only, one request at a time with delayMs between them,
// an honest User-Agent, robots.txt checked when sources were added.
import { strFromU8, unzipSync } from 'fflate';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const config = JSON.parse(readFileSync(arg('--config', join(HERE, 'sources.json')), 'utf8'));
const only = arg('--only', null)?.split(',');
const maxPages = Number(arg('--max-pages', 60));
const union = argv.includes('--union');
const otomaxFile = arg('--otomax', null);
const fromXlsx = arg('--from-xlsx', null);
const today = new Date().toISOString().slice(0, 10);
const out = resolve(arg('--out', `harga-pasar-${today}.tsv`));
const { otomaxGroupMapping, readOtomaxExport, validityDays } = createRequire(import.meta.url)('pulsa-juan-common');
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

// ---- earlier .xlsx runs (our own writer: inline strings and plain numbers) ----

const xmlText = (s) => decode(s.replace(/<[^>]+>/g, ''));
/** Operator sheets of an earlier run → catalog rows, same shape as a fresh crawl. */
export function readEarlierXlsx(path, operators, sourceNames) {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const workbook = strFromU8(files['xl/workbook.xml']);
  const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => decode(m[1]));
  const rows = [];
  names.forEach((name, i) => {
    if (!operators.includes(name)) return;
    const xml = strFromU8(files[`xl/worksheets/sheet${i + 1}.xml`]);
    const table = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
      const cells = [];
      for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
        let col = 0;
        for (const ch of c[1]) col = col * 26 + ch.charCodeAt(0) - 64;
        cells[col - 1] = xmlText(c[2]);
      }
      return Array.from(cells, (x) => x ?? '');
    });
    const head = table[0] ?? [];
    const at = (label) => head.indexOf(label);
    for (const r of table.slice(1)) {
      rows.push({
        operator: name,
        code: r[at('KODE PRODUK')],
        item: r[at('NAMA')],
        group: r[at('KATEGORI')],
        price: Number(r[at('harga')]),
        priceSource: r[at('SUMBER HARGA')],
        stock: r[at('STOK')],
        perSource: sourceNames.map((s) => (at(s) >= 0 ? r[at(s)] ?? '' : '')),
      });
    }
  });
  return rows;
}

// ---- products our OtomaX center already sells ----

const STOP = new Set(['data', 'kuota', 'paket', 'internet', 'inet', 'hari', 'hr', 'jam', 'gb', 'mb', 'telkomsel', 'tsel', 'xl', 'axis', 'smartfren', 'smart', 'indosat', 'isat', 'three', 'tri', 'all', 'full', 'new', 'promo', 'nasional']);
const words = (s) => new Set((s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 1 && !STOP.has(w)));
/** "2GB + 3GB" → "2048+3072" (MB, sorted): two products with the same quota mix compare equal. */
function quotaKey(s) {
  const q = [...s.toUpperCase().matchAll(/(\d+(?:[.,]\d+)?)\s*(GB|MB)\b/g)].map((m) => Math.round(Number(m[1].replace(',', '.')) * (m[2] === 'GB' ? 1024 : 1)));
  return q.sort((a, b) => a - b).join('+');
}
/** Pulsa nominal in thousands: "Xl 10.000" → 10, "by.U 5K" / "5rb" → 5. */
function nominalOf(s) {
  const dotted = /(\d{1,3}(?:\.\d{3})+)/.exec(s);
  if (dotted) return Number(dotted[1].replace(/\./g, '')) / 1000;
  const k = /(\d+)\s*(?:K|RB|RIBU)\b/i.exec(s);
  return k ? Number(k[1]) : null;
}
const isByU = (s) => /\bby\.?\s?u\b|\bbyu\b/i.test(s);

/**
 * Match keys of the OtomaX products that are imported into the app: pulsa by operator +
 * brand (by.U apart) + nominal; data by operator + quota + validity + the product family
 * words of the OtomaX name (e.g. "flash"). Products without family words never match, so
 * a market product is only dropped when it is clearly the same thing.
 */
export function otomaxIndex(exportRows, operators) {
  const pulsa = new Map();
  const data = [];
  for (const r of exportRows) {
    const m = otomaxGroupMapping(r.group);
    if (!m || !m.include || !r.active || r.unavailable || !operators.includes(m.operator)) continue;
    if (m.kind === 'PULSA') {
      const nominal = r.nominal > 0 ? r.nominal : nominalOf(r.name);
      if (nominal) pulsa.set(`${m.operator}|${r.group === 'SBU' ? 'BYU' : 'PULSA'}|${nominal}`, r);
    } else if (m.kind === 'DATA') {
      const family = words(r.name);
      if (family.size) data.push({ operator: m.operator, quota: quotaKey(r.name), days: validityDays(r.name), family, row: r });
    }
  }
  return { pulsa, data };
}

/** The OtomaX product a market product duplicates, or null. */
export function otomaxDuplicate(p, index) {
  const text = `${p.group} ${p.item}`;
  // by.U vouchers come as their own "By.U" category
  if (p.group === 'Pulsa' || isByU(p.group)) {
    const nominal = nominalOf(p.item);
    return nominal ? index.pulsa.get(`${p.operator}|${isByU(text) ? 'BYU' : 'PULSA'}|${nominal}`) ?? null : null;
  }
  const quota = quotaKey(text);
  if (!quota) return null;
  const days = validityDays(text);
  const have = words(text);
  const hit = index.data.find((d) => d.operator === p.operator && d.quota === quota && d.days === days && [...d.family].every((w) => have.has(w)));
  return hit?.row ?? null;
}

// ---- .tsv writer (OtomaX "Produk" export layout) ----

const tsvCell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');
const writeTsv = (path, rows) => writeFileSync(path, rows.map((r) => r.map(tsvCell).join('\t')).join('\n') + '\n');

// ---- main ----

/** Fresh crawl → catalog rows (cheapest in-stock price per product across sources). */
async function crawlCatalog(sources, operators) {
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

  return catalog.map((p) => {
    const prices = { [p.source]: p };
    for (const o of [primary, ...others]) {
      if (o === p.source) continue;
      const m = byCode.get(`${o}|${p.operator}|${p.code}`) ?? byName.get(`${o}|${p.operator}|${norm(p.group + p.item)}`);
      if (m) prices[o] = m;
    }
    const entries = Object.entries(prices);
    // cheapest in-stock price; out-of-stock prices only when nothing is in stock
    const pool = entries.some(([, x]) => x.available) ? entries.filter(([, x]) => x.available) : entries;
    const [cheapSource, cheap] = pool.reduce((a, b) => (b[1].price < a[1].price ? b : a));
    return {
      operator: p.operator,
      code: p.code,
      item: p.item,
      group: p.group,
      price: cheap.price,
      priceSource: `${cheapSource} (${cheap.code})`,
      stock: entries.some(([, x]) => x.available) ? 'tersedia' : 'gangguan di semua sumber',
      perSource: sources.map((s) => (prices[s.name] ? `${prices[s.name].code} · ${prices[s.name].price}${prices[s.name].available ? '' : ' (gangguan)'}` : '')),
    };
  });
}

async function main() {
  const sources = config.sources.filter((s) => !only || only.includes(s.name));
  const operators = config.operators;
  let catalog = fromXlsx ? readEarlierXlsx(resolve(fromXlsx), operators, sources.map((s) => s.name)) : await crawlCatalog(sources, operators);

  const duplicates = [];
  if (otomaxFile) {
    const exportRows = readOtomaxExport(readFileSync(resolve(otomaxFile), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')));
    const index = otomaxIndex(exportRows, operators);
    catalog = catalog.filter((p) => {
      const hit = otomaxDuplicate(p, index);
      if (hit) duplicates.push([p.operator, p.code, p.group, p.item, p.price, hit.code, hit.name, hit.hargaBeli]);
      return !hit;
    });
  }

  const header = ['Aktif', 'Kode', 'Nama', 'Provider', 'Kategori', 'Nominal', 'Hrg Beli', 'Hrg Jual', 'Kosong', 'Gangguan', 'Sumber Harga', 'Stok', ...sources.map((s) => s.name)];
  const rows = catalog.map((p) => [1, p.code, p.item, p.operator, p.group, p.group === 'Pulsa' || isByU(p.group) ? nominalOf(p.item) ?? 0 : 0, p.price, p.price, 0, 0, p.priceSource, p.stock, ...p.perSource]);
  writeTsv(out, [header, ...rows]);
  console.log(`\n✔ ${catalog.length} produk (${operators.join(', ')}) ${fromXlsx ? `dari ${fromXlsx}` : `dari ${sources.length} sumber`} → ${out}`);
  for (const op of operators) console.log(`  ${op}: ${catalog.filter((p) => p.operator === op).length} produk`);
  if (otomaxFile) {
    const dupOut = out.replace(/\.tsv$/i, '') + '-duplikat.tsv';
    writeTsv(dupOut, [['Operator', 'Kode pasar', 'Kategori', 'Nama pasar', 'Harga pasar', 'Kode OtomaX', 'Nama OtomaX', 'Hrg Beli OtomaX'], ...duplicates]);
    console.log(`  ${duplicates.length} produk sudah dijual OtomaX, tidak dimasukkan → ${dupOut}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
