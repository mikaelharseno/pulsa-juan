// node --test scripts/market-prices  (needs pulsa-juan-common built)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

import { otomaxDuplicate, otomaxIndex } from './collect.mjs';

const { readOtomaxExport } = createRequire(import.meta.url)('pulsa-juan-common');

// rows from our center's Produk export of 2026-10-26
const exportRows = readOtomaxExport([
  ['Aktif', 'Kode', 'Nama', 'Provider', 'Nominal', 'Hrg Beli', 'Hrg Jual', 'Kosong', 'Gangguan'],
  ['1', 'S10', 'TSel', 'S', '10', '10400', '10600', '0', '0'],
  ['1', 'SBU5', 'by.U 5K', 'SBU', '5', '5150', '5400', '0', '0'],
  ['1', 'XR10', 'XL REGULER 10K', 'X', '10', '10850', '11000', '0', '0'],
  ['1', 'TDF1', 'Tsel Data flash 1GB,30hr', 'TDF', '0', '19000', '19700', '0', '0'],
  ['1', 'SDH1', 'TELKOMSEL 1GB 3HARI', 'TD', '0', '15000', '15500', '0', '0'],
  ['0', 'XH1', 'XL DATA HOTROD 1GB 2 HARI', 'XD', '0', '9000', '9500', '0', '0'],
  ['1', 'TM10', 'TSel MIX Mochan', 'TM', '10', '10000', '10200', '0', '0'],
]);
const index = otomaxIndex(exportRows, ['XL', 'AXIS', 'TELKOMSEL', 'SMARTFREN']);
const dup = (operator, group, item) => otomaxDuplicate({ operator, group, item }, index)?.code ?? null;

test('pulsa matches by operator, brand and nominal', () => {
  assert.equal(dup('TELKOMSEL', 'Pulsa', 'Telkomsel 10.000 (Promo)'), 'S10');
  assert.equal(dup('TELKOMSEL', 'By.U', 'By.U 5.000'), 'SBU5');
  assert.equal(dup('TELKOMSEL', 'By.U', 'By.U 10.000'), null);
  assert.equal(dup('XL', 'Pulsa', 'Xl 10.000'), 'XR10');
  assert.equal(dup('AXIS', 'Pulsa', 'Axis 10.000'), null);
});

test('data only matches the same family, quota and validity', () => {
  assert.equal(dup('TELKOMSEL', 'Telkomsel Data Flash', 'Flash 1GB 30 Hari'), 'TDF1');
  assert.equal(dup('TELKOMSEL', 'Telkomsel Data Flash', 'Flash 1GB 7 Hari'), null);
  assert.equal(dup('TELKOMSEL', 'Telkomsel Data OMG', 'OMG 1GB 30 Hari'), null);
  // OtomaX names without family words (SDH1) and inactive or switched-off groups never match
  assert.equal(dup('TELKOMSEL', 'Telkomsel Data', '1GB 3 Hari'), null);
  assert.equal(dup('XL', 'XL Data Hotrod', 'Hotrod 1GB 2 Hari'), null);
});
