import http from 'http';
import { AddressInfo } from 'net';
import { FlowStep, PackagePublic } from 'pulsa-juan-common';

import { tileKeyFor } from '../src/service/productIntegration.service';
import { setTelegramSender } from '../src/service/telegram.service';
import { adminToken, app, auth, giveSaldo, prisma, registerAgent, request, resetDb } from './helpers';

// GET /api/admin/integrations/products: per-product "automatic via OtomaX or manual" overview.

const otomax = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  res.writeHead(200, { 'content-type': 'text/plain' }).end(`R#${url.searchParams.get('refID')} DY3 SUKSES. SN: 0412345678901`);
});
const OTOMAX_ENV = { OTOMAX_MEMBER_ID: 'PJAPP', OTOMAX_PIN: '1234', OTOMAX_PASSWORD: 'rahasia', OTOMAX_REPORT_KEY: 'rk-test', OTOMAX_TIMEOUT_MS: '1500' };
const enableOtomax = () => Object.assign(process.env, OTOMAX_ENV, { OTOMAX_URL: `http://127.0.0.1:${(otomax.address() as AddressInfo).port}` });
const disableOtomax = () => delete process.env.OTOMAX_URL;

interface Row { code: string; tile: string; mode: string; reason: string; health: { success: number; failed: number; pending: number; lastStatus: string } | null }
interface Status {
  otomax: { enabled: boolean; host: string | null };
  totals: { AUTO: number; MANUAL: number; INACTIVE: number; total: number };
  tiles: { key: string; label: string; AUTO: number; MANUAL: number; INACTIVE: number; total: number }[];
  packages: Row[];
  billers: { key: string; mode: string; reason: string }[];
}

let admin: string;
const status = async (token = admin) => {
  const res = await request(app).get('/api/admin/integrations/products').set(auth(token));
  expect(res.status).toBe(200);
  return res.body as Status;
};
const pkg = (s: Status, code: string) => s.packages.find((p) => p.code === code)!;

beforeAll(async () => {
  await resetDb();
  disableOtomax();
  await new Promise<void>((r) => otomax.listen(0, '127.0.0.1', r));
  setTelegramSender(async () => {});
  admin = await adminToken();
  // one OtomaX product (supplierSku DY3) through the Product Updater
  await request(app)
    .post('/api/admin/product-updater/apply')
    .set(auth(admin))
    .send({ fileName: 't.xlsx', rule: { fixed: 500, percent: 0, roundTo: 100 }, rows: [{ provider: 'INDOSAT', sku: 'DY3', name: '7GB - 1hr', category: 'HARIAN', cost: 8000 }] });
  // a manual one and an inactive one on the same tile
  for (const p of [
    { code: 'PSR-IS1', name: 'Indosat pasar 1', category: 'INDOSAT_DATA_PASAR', provider: 'INDOSAT', hargaAgen: 10000, supplierName: 'Pasar' },
    { code: 'IS_OFF', name: 'Indosat nonaktif', category: 'INDOSAT_DATA_PASAR', provider: 'INDOSAT', hargaAgen: 10000, supplierSku: 'ISOFF', isActive: false },
  ]) {
    expect((await request(app).post('/api/admin/packages').set(auth(admin)).send(p)).status).toBe(201);
  }
});
afterAll(async () => {
  setTelegramSender(null);
  disableOtomax();
  otomax.close();
  await prisma.$disconnect();
});

describe('tileKeyFor', () => {
  it('uses the category prefix, then the operator', () => {
    expect(tileKeyFor('INDOSAT_DATA_HARIAN', 'INDOSAT')).toBe('INDOSAT');
    expect(tileKeyFor('DANA_SALDO_DANA', null)).toBe('DANA');
    expect(tileKeyFor('PULSA_XL', 'XL')).toBe('XL');
    expect(tileKeyFor('PLN_PREPAID', null)).toBe('PLN');
    expect(tileKeyFor('GAME_ML', null)).toBe('OTHER');
  });
});

describe('GET /api/admin/integrations/products', () => {
  it('needs an admin token; STAFF may read', async () => {
    expect((await request(app).get('/api/admin/integrations/products')).status).toBe(401);
    await status(await adminToken('STAFF'));
  });

  it('OtomaX not configured: products with a code stay manual, with the reason', async () => {
    const s = await status();
    expect(s.otomax).toEqual({ enabled: false, host: null });
    expect(pkg(s, 'DY3')).toMatchObject({ tile: 'INDOSAT', mode: 'MANUAL', reason: 'OTOMAX_OFF', health: null });
    expect(pkg(s, 'PSR-IS1')).toMatchObject({ tile: 'INDOSAT', mode: 'MANUAL', reason: 'NO_SKU' });
    expect(pkg(s, 'IS_OFF')).toMatchObject({ mode: 'INACTIVE', reason: 'INACTIVE' });
    expect(s.totals.AUTO).toBe(0);
    expect(s.totals.total).toBe(await prisma.package.count());
    expect(s.billers.find((b) => b.key === 'PLN_POSTPAID')).toMatchObject({ mode: 'INACTIVE', reason: 'INACTIVE' });
  });

  it('OtomaX configured: coded products are automatic; tile counts add up; no secrets', async () => {
    enableOtomax();
    const s = await status();
    expect(s.otomax.enabled).toBe(true);
    expect(pkg(s, 'DY3')).toMatchObject({ mode: 'AUTO', reason: 'OTOMAX' });
    expect(pkg(s, 'PSR-IS1')).toMatchObject({ mode: 'MANUAL', reason: 'NO_SKU' });
    const indosat = s.tiles.find((t) => t.key === 'INDOSAT')!;
    // seeded Indosat pulsa (no OtomaX code) + PSR-IS1 are manual
    const seeded = await prisma.package.count({ where: { provider: 'INDOSAT', supplierSku: null, isActive: true } });
    expect(indosat).toMatchObject({ label: 'Paket Indosat', AUTO: 1, MANUAL: seeded, INACTIVE: 1, total: seeded + 2 });
    expect(s.tiles.reduce((n, t) => n + t.total, 0)).toBe(s.totals.total);
    expect(JSON.stringify(s)).not.toMatch(/rahasia|PJAPP|rk-test/);
  });

  it('billers: automatic only when active with both codes and OtomaX configured', async () => {
    const pln = await prisma.biller.findUniqueOrThrow({ where: { key: 'PLN_POSTPAID' } });
    await prisma.biller.update({ where: { id: pln.id }, data: { isActive: true, checkCode: 'CEKPLN', payCode: '' } });
    expect((await status()).billers.find((b) => b.key === 'PLN_POSTPAID')).toMatchObject({ mode: 'INACTIVE', reason: 'NO_CODE' });
    await prisma.biller.update({ where: { id: pln.id }, data: { payCode: 'BYRPLN' } });
    expect((await status()).billers.find((b) => b.key === 'PLN_POSTPAID')).toMatchObject({ mode: 'AUTO', reason: 'OTOMAX' });
    disableOtomax();
    expect((await status()).billers.find((b) => b.key === 'PLN_POSTPAID')).toMatchObject({ mode: 'INACTIVE', reason: 'OTOMAX_OFF' });
  });

  it('health: last OtomaX order result per product', async () => {
    enableOtomax();
    const { token, agent } = await registerAgent('Health');
    await giveSaldo(agent.id, 20000);
    const tree = await request(app).get('/api/agent/segments/paket-indosat/tree').set(auth(token));
    const row = tree.body.tree.nodes.cat.rows[0];
    const dy3 = (Object.values(tree.body.packages) as PackagePublic[]).find((p) => p.code === 'DY3')!;
    const steps: FlowStep[] = [
      { nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '085612345678' },
      { nodeId: 'cat', type: 'ListNode', rowId: row.id },
      { nodeId: row.childId, type: 'PackagesList', packageId: dy3.id },
    ];
    const buy = await request(app)
      .post('/api/agent/transactions')
      .set(auth(token))
      .send({ segmentId: tree.body.segment.id, treeVersion: tree.body.treeVersion, steps, clientTotal: dy3.hargaAgen, idempotencyKey: `health-${Date.now()}` });
    expect(buy.status).toBe(201);
    expect(buy.body.transaction).toMatchObject({ provider: 'otomax', status: 'SUCCESS' });
    expect(pkg(await status(), 'DY3').health).toMatchObject({ success: 1, failed: 0, pending: 0, lastStatus: 'SUCCESS' });
  });
});
