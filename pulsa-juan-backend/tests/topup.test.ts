import { kodeUnikBase } from 'pulsa-juan-common';

import { expireStaleTopUps } from '../src/service/topup.service';
import { adminToken, app, auth, prisma, registerAgent, request, resetDb } from './helpers';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('top up flow', () => {
  it('create → bank → claim → admin confirm with proof credits saldo', async () => {
    const { token, agent } = await registerAgent('Budi');
    const created = await request(app).post('/api/agent/topups').set(auth(token)).send({ amount: 100000 });
    expect(created.status).toBe(201);
    expect(created.body.kodeUnik).toBeGreaterThanOrEqual(100);
    expect(created.body.kodeUnik).toBeLessThanOrEqual(999);
    expect(created.body.totalTransfer).toBe(100000 + created.body.kodeUnik);
    const id = created.body.id;

    const bank = await request(app).put(`/api/agent/topups/${id}/bank`).set(auth(token)).send({ bank: 'BRI' });
    expect(bank.status).toBe(200);
    expect(bank.body.account.accountName).toBe('PT PULSA JUAN');

    const claim = await request(app).post(`/api/agent/topups/${id}/claim`).set(auth(token));
    expect(claim.status).toBe(200);
    expect(claim.body.status).toBe('CLAIMED');
    expect(claim.body.waUrl).toContain('https://wa.me/6281234567890?text=');
    expect(decodeURIComponent(claim.body.waUrl)).toContain('#' + created.body.orderNumber);

    const admin = await adminToken();
    const noProof = await request(app).put(`/api/admin/topups/${id}`).set(auth(admin)).field('status', 'PAID');
    expect(noProof.status).toBe(400);
    expect(noProof.body.code).toBe('PROOF_REQUIRED');

    const pdf = await request(app).put(`/api/admin/topups/${id}`).set(auth(admin)).field('status', 'PAID').attach('proof', PNG, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(400);

    const paid = await request(app).put(`/api/admin/topups/${id}`).set(auth(admin)).field('status', 'PAID').attach('proof', PNG, 'bukti.png');
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('PAID');
    expect(paid.body.proofImageUrl).toMatch(/\/uploads\/topup-proof\//);

    const me = await request(app).get('/api/agent/me').set(auth(token));
    expect(me.body.saldo).toBe(100000);

    const again = await request(app).put(`/api/admin/topups/${id}`).set(auth(admin)).field('status', 'PAID').attach('proof', PNG, 'bukti.png');
    expect(again.status).toBe(409);
    const ledger = await prisma.saldoLedger.findMany({ where: { agentId: agent.id } });
    expect(ledger).toHaveLength(1);
  });

  it('rejects below minimum and claim without bank', async () => {
    const { token } = await registerAgent('Cici');
    expect((await request(app).post('/api/agent/topups').set(auth(token)).send({ amount: 5000 })).status).toBe(400);
    const created = await request(app).post('/api/agent/topups').set(auth(token)).send({ amount: 20000 });
    const claim = await request(app).post(`/api/agent/topups/${created.body.id}/claim`).set(auth(token));
    expect(claim.status).toBe(400);
    const admin = await adminToken();
    const rejected = await request(app).put(`/api/admin/topups/${created.body.id}`).set(auth(admin)).send({ status: 'REJECTED', reason: 'tidak masuk' });
    expect(rejected.body.status).toBe('REJECTED');
  });

  it('credit confirmation: ADMIN forbidden, OWNER grows hutang; hutang payment never below zero', async () => {
    const { token, agent } = await registerAgent('Dedi');
    const created = await request(app).post('/api/agent/topups').set(auth(token)).send({ amount: 50000 });
    await request(app).put(`/api/agent/topups/${created.body.id}/bank`).set(auth(token)).send({ bank: 'BCA' });
    const adminTok = await adminToken('ADMIN');
    const denied = await request(app).put(`/api/admin/topups/${created.body.id}`).set(auth(adminTok)).send({ status: 'PAID', credit: true });
    expect(denied.status).toBe(403);
    const owner = await adminToken('OWNER');
    const ok = await request(app).put(`/api/admin/topups/${created.body.id}`).set(auth(owner)).send({ status: 'PAID', credit: true });
    expect(ok.status).toBe(200);
    expect(ok.body.isCredit).toBe(true);
    const me = await request(app).get('/api/agent/me').set(auth(token));
    expect(me.body.saldo).toBe(50000);
    expect(me.body.hutang).toBe(50000);
    const tooMuch = await request(app).post(`/api/admin/agents/${agent.id}/hutang-payment`).set(auth(owner)).send({ amount: 60000 });
    expect(tooMuch.status).toBe(400);
    const paid = await request(app).post(`/api/admin/agents/${agent.id}/hutang-payment`).set(auth(owner)).field('amount', '50000').attach('proof', PNG, 'bukti.png');
    expect(paid.status).toBe(200);
    expect(paid.body.hutang).toBe(0);
  });

  it('kode unik probes past a clash and stale PENDING orders expire', async () => {
    const { token } = await registerAgent('Eka');
    const a = await request(app).post('/api/agent/topups').set(auth(token)).send({ amount: 75000 });
    const nextBase = kodeUnikBase(a.body.orderNumber + 1);
    await prisma.topUpOrder.update({ where: { id: a.body.id }, data: { kodeUnik: nextBase, totalTransfer: 75000 + nextBase } });
    const b = await request(app).post('/api/agent/topups').set(auth(token)).send({ amount: 75000 });
    expect(b.body.orderNumber).toBe(a.body.orderNumber + 1);
    expect(b.body.kodeUnik).toBe(nextBase + 1);

    await prisma.topUpOrder.update({ where: { id: b.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireStaleTopUps()).toBeGreaterThanOrEqual(1);
    const list = await request(app).get('/api/agent/topups').set(auth(token));
    expect(list.body.topUps.find((t: { id: string }) => t.id === b.body.id).status).toBe('EXPIRED');
  });

  it('home returns banners, grouped segments, cs contacts', async () => {
    const { token } = await registerAgent('Fani');
    const home = await request(app).get('/api/agent/home').set(auth(token));
    expect(home.status).toBe(200);
    expect(home.body.banners.length).toBe(2);
    expect(home.body.groups.map((g: { groupLabel: string }) => g.groupLabel)).toEqual(['Pulsa & Data', 'Tagihan', 'E-Wallet', 'Game']);
    expect(home.body.segments.some((s: { slug: string }) => s.slug === 'pln-pascabayar')).toBe(false);
    expect(home.body.cs.whatsapp).toBe('081234567890');
  });
});
