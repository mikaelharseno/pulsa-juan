import { FlowStep, PackagePublic } from 'pulsa-juan-common';

import { adminToken, app, auth, giveSaldo, prisma, registerAgent, request, resetDb } from './helpers';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

let key = 0;
const wibToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

async function buyPulsa(token: string) {
  const tree = await request(app).get('/api/agent/segments/pulsa/tree').set(auth(token));
  const pkg = (Object.values(tree.body.packages) as PackagePublic[]).find((p) => p.code === 'XL_10K')!;
  const steps: FlowStep[] = [
    { nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '087712345678' },
    { nodeId: 'pk_xl', type: 'PackagesList', packageId: pkg.id },
  ];
  const clientTotal = pkg.hargaAgen + tree.body.markupTotal;
  const r = await request(app)
    .post('/api/agent/transactions')
    .set(auth(token))
    .send({ segmentId: tree.body.segment.id, treeVersion: tree.body.treeVersion, steps, clientTotal, idempotencyKey: `income-${++key}` });
  expect(r.status).toBe(201);
  return { trx: r.body.transaction as { id: string; total: number; sellPrice: number | null }, segmentId: tree.body.segment.id as string };
}

describe('income recap', () => {
  it('sell margins per service, per-order price edits, profit + mitra commission in Rekap', async () => {
    const admin = await adminToken();
    const upline = await registerAgent('Upline');
    await request(app).put('/api/agent/me').set(auth(upline.token)).send({ referralMarkup: 500 });
    const { token, agent } = await registerAgent('Penjual', upline.agent.commisionUniqueId);
    await giveSaldo(agent.id, 200_000);

    // margins: nothing set yet → sell price = our price
    expect((await request(app).get('/api/agent/sell-margins').set(auth(token))).body).toEqual({ default: 0, bySegment: {} });
    const first = await buyPulsa(token);
    expect(first.trx.sellPrice).toBe(first.trx.total);

    const pulsaId = first.segmentId;
    expect((await request(app).put('/api/agent/sell-margins').set(auth(token)).send({ default: -1, bySegment: {} })).status).toBe(400);
    const saved = await request(app).put('/api/agent/sell-margins').set(auth(token)).send({ default: 1000, bySegment: { [pulsaId]: 2000 } });
    expect(saved.body).toEqual({ default: 1000, bySegment: { [pulsaId]: 2000 } });

    const a = await buyPulsa(token);
    const b = await buyPulsa(token);
    const c = await buyPulsa(token);
    expect(a.trx.sellPrice).toBe(a.trx.total + 2000);

    // the agent charged more on one order
    const edited = await request(app).put(`/api/agent/transactions/${b.trx.id}/sell-price`).set(auth(token)).send({ sellPrice: b.trx.total + 5000 });
    expect(edited.body.sellPrice).toBe(b.trx.total + 5000);

    for (const t of [first, a, b]) await request(app).put(`/api/admin/transactions/${t.trx.id}`).set(auth(admin)).send({ status: 'SUCCESS' });
    await request(app).put(`/api/admin/transactions/${c.trx.id}`).set(auth(admin)).send({ status: 'FAILED', failReason: 'gangguan' });
    expect((await request(app).put(`/api/agent/transactions/${c.trx.id}/sell-price`).set(auth(token)).send({ sellPrice: 1 })).status).toBe(400);
    expect((await request(app).put(`/api/agent/transactions/${a.trx.id}/sell-price`).set(auth(upline.token)).send({ sellPrice: 1 })).status).toBe(404);

    const today = wibToday();
    const rekap = await request(app).get('/api/agent/rekap').set(auth(token)).query({ from: today, to: today });
    expect(rekap.body.count).toBe(3); // spending view: SUCCESS + PENDING, failed refunded
    expect(rekap.body.income).toEqual({
      count: 3,
      modal: first.trx.total + a.trx.total + b.trx.total,
      omzet: first.trx.total + a.trx.total + 2000 + b.trx.total + 5000,
      profit: 7000,
      commission: 0,
      commissionCount: 0,
      total: 7000,
    });
    expect(rekap.body.bySegment[0].profit).toBe(7000);
    expect(rekap.body.byDay[0]).toMatchObject({ date: today, profit: 7000 });

    // the upline earns 500 per successful order of its mitra (the failed one is voided)
    const up = await request(app).get('/api/agent/rekap').set(auth(upline.token)).query({ from: today, to: today });
    expect(up.body.income).toMatchObject({ count: 0, profit: 0, commission: 1500, commissionCount: 3, total: 1500 });

    // reset to the margin rule; yesterday's range is empty
    const reset = await request(app).put(`/api/agent/transactions/${b.trx.id}/sell-price`).set(auth(token)).send({ sellPrice: null });
    expect(reset.body.sellPrice).toBe(b.trx.total + 2000);
    const yesterday = new Date(Date.now() + 7 * 3600 * 1000 - 86400 * 1000).toISOString().slice(0, 10);
    expect((await request(app).get('/api/agent/rekap').set(auth(token)).query({ from: yesterday, to: yesterday })).body.income.count).toBe(0);
  });
});
