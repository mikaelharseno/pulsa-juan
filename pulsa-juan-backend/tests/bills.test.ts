import http from 'http';
import { AddressInfo } from 'net';
import { FlowStep, SAMPLE_BILL_REPLIES } from 'pulsa-juan-common';

import { setTelegramSender } from '../src/service/telegram.service';
import { adminToken, app, auth, giveSaldo, prisma, registerAgent, request, resetDb } from './helpers';

// ---- fake OtomaX center: CEK* = bill check, BYR* = payment ----
let checkMode: 'sync' | 'async' = 'sync';
let payReply = 'akan diproses';
const hits: URL[] = [];
const otomax = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  hits.push(url);
  const product = url.searchParams.get('product') ?? '';
  const dest = url.searchParams.get('dest') ?? '';
  const refID = url.searchParams.get('refID');
  let body = payReply;
  if (product.startsWith('CEK')) {
    if (checkMode === 'async') body = `R#${refID} ${product}.${dest} akan diproses`;
    else if (dest.endsWith('0')) body = SAMPLE_BILL_REPLIES.PLN_POSTPAID.notPayable;
    else if (dest.endsWith('9')) body = `R#${refID} ${product}.${dest} GAGAL. ID pelanggan salah`;
    else body = SAMPLE_BILL_REPLIES.PLN_POSTPAID.ready;
  }
  res.writeHead(200, { 'content-type': 'text/plain' }).end(body);
});

const alerts: string[] = [];
const flush = () => new Promise((r) => setTimeout(r, 30));
const CUSTOMER = '532100123456';
const BILL = 245300;
const SUPPLIER_ADMIN = 2500;
const OUR_FEE = 1000;

let admin: string;
let billerId: string;

async function configureBiller(patch: Record<string, unknown> = {}) {
  const res = await request(app)
    .put(`/api/admin/billers/${billerId}`)
    .set(auth(admin))
    .send({ key: 'PLN_POSTPAID', name: 'PLN Pascabayar', checkCode: 'CEKPLN', payCode: 'BYRPLN', ourFee: OUR_FEE, validityMinutes: 30, isActive: true, ...patch });
  expect(res.status).toBe(200);
}

beforeAll(async () => {
  await resetDb();
  await new Promise<void>((r) => otomax.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    OTOMAX_URL: `http://127.0.0.1:${(otomax.address() as AddressInfo).port}`,
    OTOMAX_MEMBER_ID: 'PJAPP',
    OTOMAX_PIN: '1234',
    OTOMAX_PASSWORD: 'rahasia',
    OTOMAX_REPORT_KEY: 'rk-test',
    OTOMAX_TIMEOUT_MS: '1500',
  });
  setTelegramSender(async (_chat, html) => {
    alerts.push(html);
  });
  admin = await adminToken();
  await prisma.segment.update({ where: { slug: 'pln-pascabayar' }, data: { isActive: true } });
  const list = await request(app).get('/api/admin/billers').set(auth(admin));
  billerId = list.body.find((b: { key: string }) => b.key === 'PLN_POSTPAID').id;
  await configureBiller();
});
afterAll(async () => {
  setTelegramSender(null);
  for (const k of ['OTOMAX_URL', 'OTOMAX_MEMBER_ID', 'OTOMAX_PIN', 'OTOMAX_PASSWORD', 'OTOMAX_REPORT_KEY', 'OTOMAX_TIMEOUT_MS']) delete process.env[k];
  otomax.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  alerts.length = 0;
  hits.length = 0;
  checkMode = 'sync';
  payReply = 'akan diproses';
  await prisma.billCheck.deleteMany({ where: { transaction: null } });
});

const check = (token: string, customerId = CUSTOMER) =>
  request(app).post('/api/agent/inquiries').set(auth(token)).send({ segmentId: 'pln-pascabayar', nodeId: 'inquiry', customerId });

async function pay(token: string, c: { checkId: string; amountDue: number; adminFee: number; customerName?: string }, opts: { customerId?: string; markup?: number } = {}) {
  const customerId = opts.customerId ?? CUSTOMER;
  const tree = await request(app).get('/api/agent/segments/pln-pascabayar/tree').set(auth(token));
  const steps: FlowStep[] = [
    { nodeId: 'idpel', type: 'CustomerIdInput', values: { customerId } },
    { nodeId: 'inquiry', type: 'BillInquiry', customerId, amountDue: c.amountDue, adminFee: c.adminFee, customerName: c.customerName, checkId: c.checkId },
  ];
  return request(app)
    .post('/api/agent/transactions')
    .set(auth(token))
    .send({
      segmentId: tree.body.segment.id,
      treeVersion: tree.body.treeVersion,
      steps,
      clientTotal: c.amountDue + c.adminFee + (opts.markup ?? tree.body.markupTotal),
      idempotencyKey: `bill-${Date.now()}-${Math.random()}`,
    });
}

describe('bill check', () => {
  it('sync: the reply carries the bill; admin fee = supplier admin + our fee; no raw text to the agent', async () => {
    const { token } = await registerAgent('Cek');
    const res = await check(token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.result).toMatchObject({ customerId: CUSTOMER, customerName: 'BUDI SANTOSO', periode: '1 Lbr (OKT26)', amountDue: BILL, adminFee: SUPPLIER_ADMIN + OUR_FEE });
    expect(JSON.stringify(res.body)).not.toContain('CEKPLN');
    const sent = hits[0];
    expect(sent.searchParams.get('product')).toBe('CEKPLN');
    expect(sent.searchParams.get('dest')).toBe(CUSTOMER);
    expect(sent.searchParams.get('refID')).toMatch(/^C\d+$/);
    // same customer within 2 minutes → same check, no second request
    const again = await check(token);
    expect(again.body.checkId).toBe(res.body.checkId);
    expect(hits).toHaveLength(1);
  });

  it('async: PENDING, then the report fills it in; a late duplicate report changes nothing', async () => {
    checkMode = 'async';
    const { token } = await registerAgent('Async');
    const res = await check(token);
    expect(res.body.status).toBe('PENDING');
    const poll1 = await request(app).get(`/api/agent/inquiries/${res.body.checkId}`).set(auth(token));
    expect(poll1.body.status).toBe('PENDING');
    const refid = hits[0].searchParams.get('refID')!;
    const report = await request(app).get('/api/fulfillment/otomax/report').query({ key: 'rk-test', refid, message: SAMPLE_BILL_REPLIES.PLN_POSTPAID.ready });
    expect(report.text).toBe('OK');
    const poll2 = await request(app).get(`/api/agent/inquiries/${res.body.checkId}`).set(auth(token));
    expect(poll2.body).toMatchObject({ status: 'READY', result: { amountDue: BILL, adminFee: SUPPLIER_ADMIN + OUR_FEE } });
    await request(app).get('/api/fulfillment/otomax/report').query({ key: 'rk-test', refid, message: SAMPLE_BILL_REPLIES.PLN_POSTPAID.notPayable });
    expect((await request(app).get(`/api/agent/inquiries/${res.body.checkId}`).set(auth(token))).body.status).toBe('READY');
    // another agent can't poll it
    const other = await registerAgent('Other');
    expect((await request(app).get(`/api/agent/inquiries/${res.body.checkId}`).set(auth(other.token))).status).toBe(404);
  });

  it('"sudah lunas" → NOT_PAYABLE; unknown id → FAILED; center down → FAILED', async () => {
    const { token } = await registerAgent('Lunas');
    const lunas = await check(token, '532100123450');
    expect(lunas.body).toMatchObject({ status: 'NOT_PAYABLE', message: 'Tagihan sudah lunas atau belum ada tagihan' });
    expect((await check(token, '532100123459')).body.status).toBe('FAILED');
    const url = process.env.OTOMAX_URL;
    process.env.OTOMAX_URL = 'http://127.0.0.1:1';
    expect((await check(token, '532100123451')).body.status).toBe('FAILED');
    process.env.OTOMAX_URL = url;
  });

  it('rate limit: 5 new checks per agent per minute', async () => {
    const { token } = await registerAgent('Spam');
    for (let i = 0; i < 5; i++) expect((await check(token, `5321000000${i}0`)).status).toBe(200);
    const sixth = await check(token, '532100000010');
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe('CHECK_RATE_LIMIT');
  });

  it('inactive biller → falls back to the dev stub (FULFILLMENT_STUB), no checkId', async () => {
    await configureBiller({ isActive: false });
    const { token } = await registerAgent('Stub');
    const res = await check(token);
    expect(res.body.checkId).toBeNull();
    expect(res.body.amountDue).toBeGreaterThan(0);
    expect(hits).toHaveLength(0);
    await configureBiller();
  });
});

describe('bill payment', () => {
  it('pays the stored check: BYR code to OtomaX, report → SUKSES with reference, check USED', async () => {
    const { token, agent } = await registerAgent('Bayar');
    await giveSaldo(agent.id, 500_000);
    const c = (await check(token)).body;
    hits.length = 0;
    const res = await pay(token, c.result);
    expect(res.status).toBe(201);
    const trx = res.body.transaction;
    expect(trx).toMatchObject({ amountBase: BILL, adminFee: SUPPLIER_ADMIN + OUR_FEE, supplierAdmin: SUPPLIER_ADMIN, total: BILL + SUPPLIER_ADMIN + OUR_FEE, provider: 'otomax', status: 'PENDING', customerId: CUSTOMER });
    expect(trx.billCheckId).toBe(c.checkId);
    const sent = hits[0];
    expect(sent.searchParams.get('product')).toBe('BYRPLN');
    expect(sent.searchParams.get('dest')).toBe(CUSTOMER);
    expect(sent.searchParams.get('refID')).toBe(String(trx.trxNumber));
    expect((await prisma.billCheck.findUniqueOrThrow({ where: { id: c.checkId } })).status).toBe('USED');

    await request(app)
      .get('/api/fulfillment/otomax/report')
      .query({ key: 'rk-test', refid: String(trx.trxNumber), message: SAMPLE_BILL_REPLIES.PLN_POSTPAID.paid });
    const done = await prisma.transaction.findUniqueOrThrow({ where: { id: trx.id } });
    expect(done.status).toBe('SUCCESS');
    expect(done.serialNumber).toBe('0BDS210Z4F2A7781C4D0');
    expect(Number((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).saldo)).toBe(500_000 - trx.total);

    // the same check can't pay twice
    const twice = await pay(token, c.result);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('CHECK_NOT_READY');
  });

  it('total includes the referral markup on top of bill + admin', async () => {
    const up = await registerAgent('Upline');
    await request(app).put('/api/agent/me').set(auth(up.token)).send({ referralMarkup: 700 });
    const down = await registerAgent('Downline', up.agent.commisionUniqueId);
    await giveSaldo(down.agent.id, 500_000);
    const c = (await check(down.token)).body;
    const res = await pay(down.token, c.result, { markup: 700 });
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({ markupTotal: 700, total: BILL + SUPPLIER_ADMIN + OUR_FEE + 700 });
  });

  it("rejects an expired check, another agent's check, a different customer id and a missing checkId", async () => {
    const a = await registerAgent('Exp');
    const b = await registerAgent('Thief');
    await giveSaldo(a.agent.id, 500_000);
    await giveSaldo(b.agent.id, 500_000);
    const c = (await check(a.token)).body;

    const stolen = await pay(b.token, c.result);
    expect(stolen.status).toBe(400);
    expect(stolen.body.code).toBe('CHECK_INVALID');

    const swapped = await pay(a.token, c.result, { customerId: '532100654321' });
    expect(swapped.status).toBe(400);

    const noCheck = await pay(a.token, { ...c.result, checkId: undefined });
    expect(noCheck.status).toBe(400);
    expect(noCheck.body.code).toBe('CHECK_INVALID');

    await prisma.billCheck.update({ where: { id: c.checkId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await pay(a.token, c.result);
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('CHECK_EXPIRED');
    expect((await request(app).get(`/api/agent/inquiries/${c.checkId}`).set(auth(a.token))).body.status).toBe('EXPIRED');
    expect(Number((await prisma.agent.findUniqueOrThrow({ where: { id: a.agent.id } })).saldo)).toBe(500_000);
  });

  it('a GAGAL payment reply refunds right away and alerts', async () => {
    const { token, agent } = await registerAgent('Gagal');
    await giveSaldo(agent.id, 500_000);
    const c = (await check(token)).body;
    payReply = 'R#1 BYRPLN.532100123456 GAGAL. Tagihan sudah dibayar di loket lain';
    const res = await pay(token, c.result);
    expect(res.body.transaction.status).toBe('FAILED');
    await flush();
    expect(Number((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).saldo)).toBe(500_000);
    expect(alerts.some((a) => a.includes('refund'))).toBe(true);
  });
});

describe('admin billers', () => {
  it('lists billers with usability, validates patterns, runs a real check', async () => {
    const list = await request(app).get('/api/admin/billers').set(auth(admin));
    expect(list.body.map((b: { key: string }) => b.key).sort()).toEqual(['PLN_POSTPAID', 'TELKOM']);
    expect(list.body.find((b: { key: string }) => b.key === 'PLN_POSTPAID').usable).toBe(true);
    expect(list.body.find((b: { key: string }) => b.key === 'TELKOM').usable).toBe(false);

    const telkom = list.body.find((b: { key: string }) => b.key === 'TELKOM');
    const bad = await request(app).put(`/api/admin/billers/${telkom.id}`).set(auth(admin)).send({ key: 'TELKOM', name: 'Telkom', amountRe: '(' });
    expect(bad.status).toBe(400);
    const noCodes = await request(app).put(`/api/admin/billers/${telkom.id}`).set(auth(admin)).send({ key: 'TELKOM', name: 'Telkom', isActive: true });
    expect(noCodes.status).toBe(400);

    const test = await request(app).post(`/api/admin/billers/${billerId}/check`).set(auth(admin)).send({ customerId: CUSTOMER });
    expect(test.status).toBe(200);
    expect(test.body).toMatchObject({ status: 'READY', amountDue: BILL, supplierAdmin: SUPPLIER_ADMIN, agentId: null });
    expect(test.body.rawMessage).toContain('BUDI SANTOSO');
    const staff = await adminToken('STAFF');
    expect((await request(app).post(`/api/admin/billers/${billerId}/check`).set(auth(staff)).send({ customerId: CUSTOMER })).status).toBe(403);
  });

  it('the order list carries the bill details', async () => {
    const res = await request(app).get('/api/admin/transactions').set(auth(admin)).query({ search: CUSTOMER });
    const withBill = res.body.transactions.find((t: { billCheck: unknown }) => t.billCheck);
    expect(withBill.billCheck).toMatchObject({ customerName: 'BUDI SANTOSO', amountDue: BILL, biller: { key: 'PLN_POSTPAID' } });
  });
});
