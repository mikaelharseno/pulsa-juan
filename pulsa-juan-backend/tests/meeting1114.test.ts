import { FlowStep, PackagePublic } from 'pulsa-juan-common';

import { pickQrisCode } from '../src/service/qris.service';
import { agentFailReason } from '../src/service/transaction.service';
import { adminToken, app, auth, giveSaldo, prisma, registerAgent, request, resetDb, TEST_PIN } from './helpers';

// Meeting 14 Nov 2026: saldo freeze, saldo transfers, QRIS per-top-up limit, two CS numbers.

let key = 0;
const idem = () => `m1114-${Date.now()}-${++key}`;

async function order(token: string) {
  const tree = await request(app).get('/api/agent/segments/pulsa/tree').set(auth(token));
  const pkg = (Object.values(tree.body.packages) as PackagePublic[]).find((p) => p.code === 'XL_10K')!;
  const steps: FlowStep[] = [
    { nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '087712345678' },
    { nodeId: 'pk_xl', type: 'PackagesList', packageId: pkg.id },
  ];
  return request(app)
    .post('/api/agent/transactions')
    .set(auth(token))
    .send({ segmentId: tree.body.segment.id, treeVersion: tree.body.treeVersion, steps, clientTotal: pkg.hargaAgen, idempotencyKey: idem() });
}
const saldoOf = async (id: string) => Number((await prisma.agent.findUniqueOrThrow({ where: { id } })).saldo);

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('saldo freeze', () => {
  it('blocks buying, sending and claiming until unfrozen; STAFF cannot freeze', async () => {
    const owner = await adminToken();
    const staff = await adminToken('STAFF');
    const { token, agent } = await registerAgent('Beku');
    const other = await registerAgent('Lain');
    await giveSaldo(agent.id, 100_000);

    expect((await request(app).post(`/api/admin/agents/${agent.id}/freeze`).set(auth(staff)).send({ reason: 'cek' })).status).toBe(403);
    const frozen = await request(app).post(`/api/admin/agents/${agent.id}/freeze`).set(auth(owner)).send({ reason: 'Dugaan penipuan' });
    expect(frozen.status).toBe(200);
    expect(frozen.body.saldoFrozenReason).toBe('Dugaan penipuan');
    expect((await request(app).get('/api/agent/me').set(auth(token))).body.saldoFrozen).toMatchObject({ reason: 'Dugaan penipuan' });

    const buy = await order(token);
    expect(buy.status).toBe(403);
    expect(buy.body).toMatchObject({ code: 'SALDO_FROZEN', reason: 'Dugaan penipuan' });
    const send = await request(app).post('/api/agent/transfers').set(auth(token)).send({ to: other.phone, amount: 5000, pin: TEST_PIN, idempotencyKey: idem() });
    expect(send.body.code).toBe('SALDO_FROZEN');
    expect((await request(app).post('/api/agent/commissions/claim').set(auth(token))).body.code).toBe('SALDO_FROZEN');
    // top-ups and admin adjustments still land
    await giveSaldo(agent.id, 1000);
    expect(await saldoOf(agent.id)).toBe(101_000);

    expect((await request(app).post(`/api/admin/agents/${agent.id}/unfreeze`).set(auth(owner))).body.saldoFrozenAt).toBeNull();
    expect((await order(token)).status).toBe(201);
  });
});

describe('saldo transfers', () => {
  it('agent → agent: lookup by phone or code, PIN, immediate, replay-safe', async () => {
    const a = await registerAgent('Pengirim');
    const b = await registerAgent('Penerima');
    await giveSaldo(a.agent.id, 50_000);

    const byPhone = await request(app).post('/api/agent/transfers/lookup').set(auth(a.token)).send({ to: b.phone });
    expect(byPhone.body).toMatchObject({ name: 'Penerima', code: b.agent.commisionUniqueId });
    expect(byPhone.body.phone).toContain('****');
    expect((await request(app).post('/api/agent/transfers/lookup').set(auth(a.token)).send({ to: b.agent.commisionUniqueId.toLowerCase() })).body.name).toBe('Penerima');
    expect((await request(app).post('/api/agent/transfers/lookup').set(auth(a.token)).send({ to: a.phone })).body.code).toBe('TRANSFER_SELF');

    const wrongPin = await request(app).post('/api/agent/transfers').set(auth(a.token)).send({ to: b.phone, amount: 20_000, pin: '111222', idempotencyKey: idem() });
    expect(wrongPin.body.code).toBe('PIN_INVALID');
    const tooMuch = await request(app).post('/api/agent/transfers').set(auth(a.token)).send({ to: b.phone, amount: 60_000, pin: TEST_PIN, idempotencyKey: idem() });
    expect(tooMuch.body.code).toBe('SALDO_KURANG');

    const k = idem();
    const sent = await request(app).post('/api/agent/transfers').set(auth(a.token)).send({ to: b.phone, amount: 20_000, note: 'modal', pin: TEST_PIN, idempotencyKey: k });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ saldo: 30_000, recipient: { name: 'Penerima' }, transfer: { status: 'DONE', source: 'AGENT', amount: 20_000 } });
    const again = await request(app).post('/api/agent/transfers').set(auth(a.token)).send({ to: b.phone, amount: 20_000, pin: TEST_PIN, idempotencyKey: k });
    expect(again.status).toBe(200);
    expect(await saldoOf(a.agent.id)).toBe(30_000);
    expect(await saldoOf(b.agent.id)).toBe(20_000);
    const ledger = await request(app).get('/api/agent/ledger').set(auth(b.token));
    expect(ledger.body.entries[0]).toMatchObject({ type: 'TRANSFER', delta: 20_000 });
  });

  it('admin draft → OWNER approves / rejects / reverses; shortfall becomes hutang', async () => {
    const owner = await adminToken();
    const admin = await adminToken('ADMIN');
    const staff = await adminToken('STAFF');
    const a = await registerAgent('DrafA');
    const b = await registerAgent('DrafB');
    await giveSaldo(a.agent.id, 40_000);

    const body = { fromAgentId: a.agent.id, toAgentId: b.agent.id, amount: 30_000, note: 'koreksi salah transfer' };
    expect((await request(app).post('/api/admin/transfers').set(auth(staff)).send(body)).status).toBe(403);
    const draft = await request(app).post('/api/admin/transfers').set(auth(admin)).send(body);
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe('DRAFT');
    expect(await saldoOf(a.agent.id)).toBe(40_000);
    expect((await request(app).post(`/api/admin/transfers/${draft.body.id}/approve`).set(auth(admin))).status).toBe(403);

    const approved = await request(app).post(`/api/admin/transfers/${draft.body.id}/approve`).set(auth(owner));
    expect(approved.body.status).toBe('DONE');
    expect(await saldoOf(a.agent.id)).toBe(10_000);
    expect(await saldoOf(b.agent.id)).toBe(30_000);
    expect((await request(app).post(`/api/admin/transfers/${draft.body.id}/approve`).set(auth(owner))).status).toBe(409);

    // B spends most of it → reversal takes what is left and books the rest as hutang
    await request(app).post(`/api/admin/agents/${b.agent.id}/adjust-saldo`).set(auth(owner)).send({ delta: -25_000, note: 'belanja' });
    const reversed = await request(app).post(`/api/admin/transfers/${draft.body.id}/reverse`).set(auth(owner)).send({ reason: 'salah kirim' });
    expect(reversed.body).toMatchObject({ status: 'REVERSED', reverseReason: 'salah kirim' });
    expect(await saldoOf(a.agent.id)).toBe(40_000);
    const bRow = await prisma.agent.findUniqueOrThrow({ where: { id: b.agent.id } });
    expect([Number(bRow.saldo), Number(bRow.hutang)]).toEqual([0, 25_000]);

    const second = await request(app).post('/api/admin/transfers').set(auth(owner)).send({ ...body, amount: 5000 });
    const rejected = await request(app).post(`/api/admin/transfers/${second.body.id}/reject`).set(auth(owner)).send({ reason: 'tidak perlu' });
    expect(rejected.body).toMatchObject({ status: 'REJECTED', rejectReason: 'tidak perlu' });
    expect(await saldoOf(a.agent.id)).toBe(40_000);
    const list = await request(app).get('/api/admin/transfers').set(auth(staff));
    expect(list.body.transfers.map((t: { status: string }) => t.status)).toEqual(expect.arrayContaining(['REVERSED', 'REJECTED']));
  });
});

describe('QRIS per-top-up limit', () => {
  it('smallest fitting maxTopUp first, then least used; no limit last', async () => {
    await prisma.qrisCode.deleteMany({});
    const small = await prisma.qrisCode.create({ data: { label: 'Kecil', imageUrl: 'http://x/a.png', maxTopUp: 100_000, monthlyLimit: 500_000_000 } });
    const mid = await prisma.qrisCode.create({ data: { label: 'Sedang', imageUrl: 'http://x/b.png', maxTopUp: 1_000_000, monthlyLimit: 500_000_000 } });
    const mid2 = await prisma.qrisCode.create({ data: { label: 'Sedang 2', imageUrl: 'http://x/c.png', maxTopUp: 1_000_000, monthlyLimit: 500_000_000, sortOrder: 1 } });
    const open = await prisma.qrisCode.create({ data: { label: 'Bebas', imageUrl: 'http://x/d.png', monthlyLimit: 500_000_000 } });
    expect((await pickQrisCode(prisma, 50_000))?.id).toBe(small.id);
    expect((await pickQrisCode(prisma, 100_000))?.id).toBe(small.id);
    expect((await pickQrisCode(prisma, 100_001))?.id).toBe(mid.id);
    expect((await pickQrisCode(prisma, 5_000_000))?.id).toBe(open.id);

    // among equal limits, the one used least this month
    const { agent } = await registerAgent('Qris');
    await prisma.topUpOrder.create({
      data: { agentId: agent.id, amount: 300_000, kodeUnik: 1, totalTransfer: 300_001, bank: 'QRIS', qrisCodeId: mid.id, status: 'PAID', paidAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) },
    });
    expect((await pickQrisCode(prisma, 200_000))?.id).toBe(mid2.id);
    // the monthly limit still applies
    await prisma.qrisCode.update({ where: { id: small.id }, data: { monthlyLimit: 100_000 } });
    expect((await pickQrisCode(prisma, 100_000))?.id).toBe(small.id);
    expect((await pickQrisCode(prisma, 100_001))?.id).not.toBe(small.id);

    const admin = await adminToken();
    const upd = await request(app).put(`/api/admin/qris/${open.id}`).set(auth(admin)).send({ maxTopUp: 2_000_000 });
    expect(upd.body.maxTopUp).toBe(2_000_000);
    expect((await request(app).put(`/api/admin/qris/${open.id}`).set(auth(admin)).send({ maxTopUp: null })).body.maxTopUp).toBeNull();
  });
});

describe('two CS numbers', () => {
  it('Finance for top-ups (falls back to Komplain), Komplain for orders', async () => {
    const admin = await adminToken();
    await request(app).put('/api/admin/config').set(auth(admin)).send({ csWhatsapp: '081111111111', csFinanceWhatsapp: '' });
    expect((await request(app).get('/api/agent/config')).body.cs).toMatchObject({ whatsapp: '081111111111', financeWhatsapp: '081111111111' });
    await request(app).put('/api/admin/config').set(auth(admin)).send({ csFinanceWhatsapp: '082222222222' });
    expect((await request(app).get('/api/agent/config')).body.cs).toMatchObject({ whatsapp: '081111111111', financeWhatsapp: '082222222222' });

    const { token } = await registerAgent('Topup');
    const t = await request(app).post('/api/agent/topups').set(auth(token)).send({ amount: 50_000 });
    await request(app).put(`/api/agent/topups/${t.body.id}/bank`).set(auth(token)).send({ bank: 'BRI' });
    const claim = await request(app).post(`/api/agent/topups/${t.body.id}/claim`).set(auth(token));
    expect(claim.body.waUrl).toContain('wa.me/6282222222222');
  });
});

describe('agent-facing supplier text', () => {
  it('drops our center saldo and trx refs', () => {
    expect(agentFailReason('T#991 R#12 DY3.0856 GAGAL. Nomor tujuan salah. Saldo 100.000 - 8.000 = 92.000')).toBe('DY3.0856 GAGAL. Nomor tujuan salah');
    expect(agentFailReason('Saldo tidak cukup')).toBe('Gagal diproses oleh supplier');
    expect(agentFailReason('gagal')).toBe('gagal');
    expect(agentFailReason(null)).toBeNull();
  });
});
