import http from 'http';
import { AddressInfo } from 'net';
import { FlowStep, PackagePublic } from 'pulsa-juan-common';

import { parseOtomaxMessage } from '../src/service/fulfillment/otomax';
import { sendAdminAlert, setTelegramSender, telegramConfigured } from '../src/service/telegram.service';
import { alertStuckOrders } from '../src/service/transaction.service';
import { adminToken, app, auth, giveSaldo, prisma, registerAgent, request, resetDb } from './helpers';

// ---- fake OtomaX center ----
let reply = 'akan diproses';
const hits: URL[] = [];
const otomax = http.createServer((req, res) => {
  hits.push(new URL(req.url ?? '/', 'http://x'));
  res.writeHead(200, { 'content-type': 'text/plain' }).end(reply);
});

const alerts: string[] = [];
const flush = () => new Promise((r) => setTimeout(r, 30));
const OTOMAX_ENV = { OTOMAX_MEMBER_ID: 'PJAPP', OTOMAX_PIN: '1234', OTOMAX_PASSWORD: 'rahasia', OTOMAX_REPORT_KEY: 'rk-test', OTOMAX_TIMEOUT_MS: '1500' };

function enableOtomax(url: string) {
  Object.assign(process.env, OTOMAX_ENV, { OTOMAX_URL: url });
}
function disableOtomax() {
  delete process.env.OTOMAX_URL;
}

beforeAll(async () => {
  await resetDb();
  await new Promise<void>((r) => otomax.listen(0, '127.0.0.1', r));
  setTelegramSender(async (_chat, html) => {
    alerts.push(html);
  });
  const admin = await adminToken();
  await request(app)
    .post('/api/admin/product-updater/apply')
    .set(auth(admin))
    .send({
      fileName: 't.xlsx',
      rule: { fixed: 500, percent: 0, roundTo: 100 },
      rows: [{ provider: 'INDOSAT', sku: 'DY3', name: '7GB - 1hr', category: 'HARIAN', cost: 8000 }],
    });
});
afterAll(async () => {
  setTelegramSender(null);
  disableOtomax();
  otomax.close();
  await prisma.$disconnect();
});
beforeEach(() => {
  alerts.length = 0;
  hits.length = 0;
});

const otomaxUrl = () => `http://127.0.0.1:${(otomax.address() as AddressInfo).port}`;

async function buyDy3(token: string, phone = '085612345678') {
  const tree = await request(app).get('/api/agent/segments/paket-indosat/tree').set(auth(token));
  const row = tree.body.tree.nodes.cat.rows[0];
  const pkg = (Object.values(tree.body.packages) as PackagePublic[]).find((p) => p.code === 'DY3')!;
  const steps: FlowStep[] = [
    { nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: phone },
    { nodeId: 'cat', type: 'ListNode', rowId: row.id },
    { nodeId: row.childId, type: 'PackagesList', packageId: pkg.id },
  ];
  const res = await request(app)
    .post('/api/agent/transactions')
    .set(auth(token))
    .send({ segmentId: tree.body.segment.id, treeVersion: tree.body.treeVersion, steps, clientTotal: pkg.hargaAgen, idempotencyKey: `int-${Date.now()}-${Math.random()}` });
  expect(res.status).toBe(201);
  return res.body.transaction as { id: string; trxNumber: number; status: string; provider: string; serialNumber: string | null; total: number };
}

describe('parseOtomaxMessage', () => {
  it('classifies typical OtomaX wording', () => {
    expect(parseOtomaxMessage('R#123 DY3.085612345678 akan diproses @14:02')).toEqual({ status: 'PENDING' });
    expect(parseOtomaxMessage('T#991 R#123 DY3.0856.. SUKSES. SN: 0412345678901. Saldo 100.000 - 8.000 = 92.000')).toEqual({ status: 'SUCCESS', serialNumber: '0412345678901' });
    expect(parseOtomaxMessage('R#123 DY3.0856.. GAGAL. Nomor tujuan salah')).toEqual({ status: 'FAILED' });
    expect(parseOtomaxMessage('Saldo tidak cukup')).toEqual({ status: 'FAILED' });
    expect(parseOtomaxMessage('Sukses tapi gagal?')).toEqual({ status: 'PENDING' });
  });
  it('honours env overrides', () => {
    process.env.OTOMAX_SUCCESS_RE = '\\bOK\\b';
    process.env.OTOMAX_SN_RE = 'REF=(\\w+)';
    expect(parseOtomaxMessage('TRX OK REF=AB12')).toEqual({ status: 'SUCCESS', serialNumber: 'AB12' });
    delete process.env.OTOMAX_SUCCESS_RE;
    delete process.env.OTOMAX_SN_RE;
  });
});

describe('telegram alerts', () => {
  it('alerts the first top-up claim only', async () => {
    const { token } = await registerAgent('Claimer');
    const created = await request(app).post('/api/agent/topups').set(auth(token)).send({ amount: 100000 });
    await request(app).put(`/api/agent/topups/${created.body.id}/bank`).set(auth(token)).send({ bank: 'BCA' });
    await request(app).post(`/api/agent/topups/${created.body.id}/claim`).set(auth(token));
    await request(app).post(`/api/agent/topups/${created.body.id}/claim`).set(auth(token));
    await flush();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain(`Top up #${created.body.orderNumber}`);
    expect(alerts[0]).toContain('Rp 100.');
  });

  it('alerts a manual order while OtomaX is off, and stuck orders once', async () => {
    disableOtomax();
    const { token, agent } = await registerAgent('Manual');
    await giveSaldo(agent.id, 20000);
    const trx = await buyDy3(token);
    expect(trx.provider).toBe('manual');
    await flush();
    expect(alerts.some((a) => a.includes(`Order #${trx.trxNumber} perlu diproses manual`))).toBe(true);

    alerts.length = 0;
    await prisma.transaction.update({ where: { id: trx.id }, data: { createdAt: new Date(Date.now() - 30 * 60_000) } });
    expect(await alertStuckOrders()).toBeGreaterThanOrEqual(1);
    expect(await alertStuckOrders()).toBe(0);
    await flush();
    expect(alerts.filter((a) => a.includes(`Order #${trx.trxNumber} masih diproses`))).toHaveLength(1);
  });

  it('is a no-op when unconfigured', async () => {
    setTelegramSender(null);
    expect(telegramConfigured()).toBe(false);
    await expect(sendAdminAlert('x')).resolves.toBeUndefined();
    setTelegramSender(async (_c, html) => {
      alerts.push(html);
    });
  });
});

describe('OtomaX fulfilment', () => {
  it('sends a signed request; PENDING reply, then the report settles it', async () => {
    enableOtomax(otomaxUrl());
    reply = 'R#1 DY3.085612345678 akan diproses';
    const { token, agent } = await registerAgent('Otomax');
    await giveSaldo(agent.id, 20000);
    const trx = await buyDy3(token);
    expect(trx).toMatchObject({ status: 'PENDING', provider: 'otomax' });
    const q = hits[0].searchParams;
    expect(hits[0].pathname).toBe('/trx');
    expect(Object.fromEntries(q)).toMatchObject({ product: 'DY3', qty: '1', dest: '085612345678', refID: String(trx.trxNumber), memberID: 'PJAPP' });
    expect(q.get('sign')).toBeTruthy();
    expect(q.has('pin') || q.has('password')).toBe(false);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: trx.id } })).supplierMessage).toContain('akan diproses');

    const msg = `T#77 R#${trx.trxNumber} DY3.085612345678 SUKSES. SN: 0412345678901`;
    expect((await request(app).get('/api/fulfillment/otomax/report').query({ key: 'wrong', refid: trx.trxNumber, message: msg })).status).toBe(401);
    const ok = await request(app).get('/api/fulfillment/otomax/report').query({ key: 'rk-test', refid: trx.trxNumber, message: msg });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('OK');
    const dup = await request(app).post('/api/fulfillment/otomax/report?key=rk-test').type('form').send({ refID: String(trx.trxNumber), message: msg });
    expect(dup.text).toBe('OK');
    const settled = await prisma.transaction.findUniqueOrThrow({ where: { id: trx.id } });
    expect(settled).toMatchObject({ status: 'SUCCESS', serialNumber: '0412345678901' });
    expect((await request(app).get('/api/agent/me').set(auth(token))).body.saldo).toBe(20000 - trx.total);
  });

  it('a GAGAL reply fails + refunds right away and alerts', async () => {
    enableOtomax(otomaxUrl());
    reply = 'R#2 DY3.085612345679 GAGAL. Nomor tujuan salah';
    const { token, agent } = await registerAgent('Gagal');
    await giveSaldo(agent.id, 20000);
    const trx = await buyDy3(token, '085612345679');
    expect(trx.status).toBe('FAILED');
    expect((await request(app).get('/api/agent/me').set(auth(token))).body.saldo).toBe(20000);
    await flush();
    expect(alerts.some((a) => a.includes(`Order #${trx.trxNumber} GAGAL di OtomaX`))).toBe(true);
  });

  it('OtomaX unreachable: order stays PENDING with an alert', async () => {
    const dead = http.createServer();
    await new Promise<void>((r) => dead.listen(0, '127.0.0.1', r));
    const port = (dead.address() as AddressInfo).port;
    await new Promise((r) => dead.close(r));
    enableOtomax(`http://127.0.0.1:${port}`);
    const { token, agent } = await registerAgent('Down');
    await giveSaldo(agent.id, 20000);
    const trx = await buyDy3(token, '085612345670');
    expect(trx).toMatchObject({ status: 'PENDING', provider: 'otomax' });
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: trx.id } })).supplierMessage).toMatch(/^Tidak terkirim/);
    await flush();
    expect(alerts.some((a) => a.includes(`Order #${trx.trxNumber} tidak terkirim ke OtomaX`))).toBe(true);
  });

  it('integration status never leaks secrets; telegram test sends', async () => {
    enableOtomax(otomaxUrl());
    const admin = await adminToken();
    const status = await request(app).get('/api/admin/integrations').set(auth(admin));
    expect(status.body.otomax).toMatchObject({ enabled: true, memberId: 'PJAPP', auth: 'sign', reportKeySet: true });
    expect(JSON.stringify(status.body)).not.toMatch(/rahasia|1234|rk-test/);
    const test = await request(app).post('/api/admin/integrations/telegram/test').set(auth(admin));
    expect(test.body.sent).toBe(true);
    await flush();
    expect(alerts.some((a) => a.includes('Tes notifikasi'))).toBe(true);
  });
});
