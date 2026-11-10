import { qrisFee } from 'pulsa-juan-common';

import { jakartaMonthStart } from '../src/service/qris.service';
import { adminToken, app, auth, prisma, registerAgent, request, resetDb } from './helpers';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function topUp(token: string, amount: number) {
  const created = await request(app).post('/api/agent/topups').set(auth(token)).send({ amount });
  expect(created.status).toBe(201);
  return created.body as { id: string; kodeUnik: number; totalTransfer: number; orderNumber: number };
}

async function payQris(admin: string, id: string) {
  const r = await request(app).put(`/api/admin/topups/${id}`).set(auth(admin)).field('status', 'PAID').attach('proof', PNG, 'bukti.png');
  expect(r.status).toBe(200);
  return r.body;
}

describe('QRIS fee rule', () => {
  it('is 1% (rounded up) only above Rp 500.000', () => {
    expect(qrisFee(500_000)).toBe(0);
    expect(qrisFee(500_001)).toBe(5001);
    expect(qrisFee(1_000_000)).toBe(10_000);
    expect(qrisFee(50_000)).toBe(0);
  });

  it('month starts at midnight Asia/Jakarta', () => {
    // 1 Nov 2026 00:30 WIB = 31 Oct 17:30 UTC → still November
    expect(jakartaMonthStart(new Date('2026-10-31T17:30:00Z')).toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(jakartaMonthStart(new Date('2026-10-31T16:30:00Z')).toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });
});

describe('QRIS top-ups', () => {
  it('needs an active code, adds the fee, credits without it, and goes back to a bank cleanly', async () => {
    const admin = await adminToken();
    const { token, agent } = await registerAgent('Qrisa');

    const cfgOff = await request(app).get('/api/agent/config');
    expect(cfgOff.body.qris).toEqual({ enabled: false, feePercent: 1, feeAbove: 500_000 });
    const t0 = await topUp(token, 100_000);
    const none = await request(app).put(`/api/agent/topups/${t0.id}/bank`).set(auth(token)).send({ bank: 'QRIS' });
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('QRIS_UNAVAILABLE');

    const staff = await adminToken('STAFF');
    expect((await request(app).post('/api/admin/qris').set(auth(staff)).send({ label: 'X', imageUrl: 'http://x/q.png' })).status).toBe(403);
    const made = await request(app).post('/api/admin/qris').set(auth(admin)).send({ label: 'QRIS Toko A', imageUrl: 'http://localhost/q-a.png' });
    expect(made.status).toBe(201);
    expect(made.body.monthlyLimit).toBe(20_000_000);
    expect((await request(app).get('/api/agent/config')).body.qris.enabled).toBe(true);

    // above 500k: fee inside the transfer, not in saldo
    const big = await topUp(token, 1_000_000);
    const sel = await request(app).put(`/api/agent/topups/${big.id}/bank`).set(auth(token)).send({ bank: 'QRIS' });
    expect(sel.status).toBe(200);
    expect(sel.body).toMatchObject({ bank: 'QRIS', adminFee: 10_000, totalTransfer: 1_000_000 + big.kodeUnik + 10_000, qris: { label: 'QRIS Toko A', imageUrl: 'http://localhost/q-a.png' } });
    const claim = await request(app).post(`/api/agent/topups/${big.id}/claim`).set(auth(token));
    expect(decodeURIComponent(claim.body.waUrl)).toContain('via QRIS');
    await payQris(admin, big.id);
    const me = await request(app).get('/api/agent/me').set(auth(token));
    expect(me.body.saldo).toBe(1_000_000 + big.kodeUnik);

    // at or below 500k: no fee; switching to BRI drops QRIS
    const small = await topUp(token, 500_000);
    const s1 = await request(app).put(`/api/agent/topups/${small.id}/bank`).set(auth(token)).send({ bank: 'QRIS' });
    expect(s1.body.adminFee).toBe(0);
    expect(s1.body.totalTransfer).toBe(500_000 + small.kodeUnik);
    const big2 = await topUp(token, 800_000);
    await request(app).put(`/api/agent/topups/${big2.id}/bank`).set(auth(token)).send({ bank: 'QRIS' });
    const back = await request(app).put(`/api/agent/topups/${big2.id}/bank`).set(auth(token)).send({ bank: 'BRI' });
    expect(back.body).toMatchObject({ bank: 'BRI', adminFee: 0, qrisCodeId: null, totalTransfer: 800_000 + big2.kodeUnik, qris: null });

    const list = await request(app).get('/api/admin/qris').set(auth(admin));
    expect(list.body[0].paidThisMonth).toBe(1_000_000 + big.kodeUnik + 10_000);
    expect(list.body[0].reservedNow).toBe(500_000 + small.kodeUnik);
    void agent;
  });

  it('assigns the least-used code with room and skips a full one', async () => {
    await resetDb();
    const admin = await adminToken();
    const { token } = await registerAgent('Qrisb');
    const a = (await request(app).post('/api/admin/qris').set(auth(admin)).send({ label: 'A', imageUrl: 'http://x/a.png', monthlyLimit: 1_000_000, sortOrder: 0 })).body;
    const b = (await request(app).post('/api/admin/qris').set(auth(admin)).send({ label: 'B', imageUrl: 'http://x/b.png', monthlyLimit: 1_000_000, sortOrder: 1 })).body;

    // both empty → sortOrder breaks the tie → A
    const t1 = await topUp(token, 400_000);
    expect((await request(app).put(`/api/agent/topups/${t1.id}/bank`).set(auth(token)).send({ bank: 'QRIS' })).body.qrisCodeId).toBe(a.id);
    // A holds 400k (reserved) → B is less used
    const t2 = await topUp(token, 300_000);
    expect((await request(app).put(`/api/agent/topups/${t2.id}/bank`).set(auth(token)).send({ bank: 'QRIS' })).body.qrisCodeId).toBe(b.id);
    await payQris(admin, t1.id);
    // A 400k paid, B 300k reserved → B again (least used)
    const t3 = await topUp(token, 300_000);
    expect((await request(app).put(`/api/agent/topups/${t3.id}/bank`).set(auth(token)).send({ bank: 'QRIS' })).body.qrisCodeId).toBe(b.id);
    // B now 600k; a 450k order fits only A (400k + 450k ≤ 1M; B 600k + 450k > 1M)
    const t4 = await topUp(token, 450_000);
    expect((await request(app).put(`/api/agent/topups/${t4.id}/bank`).set(auth(token)).send({ bank: 'QRIS' })).body.qrisCodeId).toBe(a.id);
    // nothing fits 600k any more
    const t5 = await topUp(token, 600_000);
    const full = await request(app).put(`/api/agent/topups/${t5.id}/bank`).set(auth(token)).send({ bank: 'QRIS' });
    expect(full.body.code).toBe('QRIS_UNAVAILABLE');

    // a rejected order frees its room
    await request(app).put(`/api/admin/topups/${t3.id}`).set(auth(admin)).field('status', 'REJECTED');
    const t6 = await topUp(token, 600_000);
    expect((await request(app).put(`/api/agent/topups/${t6.id}/bank`).set(auth(token)).send({ bank: 'QRIS' })).body.qrisCodeId).toBe(b.id);

    // a used code is only switched off on delete; an inactive code is skipped
    expect((await request(app).delete(`/api/admin/qris/${a.id}`).set(auth(admin))).body).toEqual({ deleted: false, deactivated: true });
    const t7 = await topUp(token, 100_000);
    const r7 = await request(app).put(`/api/agent/topups/${t7.id}/bank`).set(auth(token)).send({ bank: 'QRIS' });
    expect(r7.body.code).toBe('QRIS_UNAVAILABLE');
  });
});
