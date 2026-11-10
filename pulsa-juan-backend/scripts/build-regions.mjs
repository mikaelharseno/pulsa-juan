// Builds data/regions.json (provinces, regencies, districts) from the
// idn-area-data package (ODbL, https://github.com/fityannugroho/idn-area-data).
// Run after bumping idn-area-data: node scripts/build-regions.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dir = join(dirname(require.resolve('idn-area-data/package.json')), 'data');
const version = JSON.parse(readFileSync(join(dir, '..', 'package.json'), 'utf8')).version;

function rows(file) {
  const [, ...lines] = readFileSync(join(dir, file), 'utf8').trim().split(/\r?\n/);
  // names never contain commas in this dataset; quotes are stripped just in case
  return lines.map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
}

const out = {
  source: `idn-area-data ${version} (ODbL 1.0) — https://github.com/fityannugroho/idn-area-data`,
  provinces: rows('provinces.csv'),
  regencies: rows('regencies.csv'),
  districts: rows('districts.csv'),
};
writeFileSync(new URL('../data/regions.json', import.meta.url), JSON.stringify(out));
console.log(`provinces ${out.provinces.length}, regencies ${out.regencies.length}, districts ${out.districts.length}`);
