import { FlowStep, PackagePublic } from 'pulsa-juan-common';

import { adminToken, app, auth, giveSaldo, prisma, registerAgent, request, resetDb, setPricing } from './helpers';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

let key = 0;
const idem = () => `pricing-${Date.now()}-${++key}`;

async function xl(token: string) {
  const tree = await request(app).get('/api/agent/segments/pulsa/tree').set(auth(token));
  const pkg = (Object.values(tree.body.packages) as PackagePublic[]).find((p) => p.code === 'XL_10K')!;
  const steps: FlowStep[] = [
    { nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '087712345678' },
    { nodeId: 'pk_xl', type: 'PackagesList', packageId: pkg.id },
  ];
  return { pkg, steps, segmentId: tree.body.segment.id as string, treeVersion: tree.body.treeVersion as number };
}

describe('Harga Agen', () => {
  it('a per-agent price shows in the tree, is debited, and a stale total gets PRICE_CHANGED', async () => {
    const special = await registerAgent('Spesial');
    const normal = await registerAgent('Biasa');
    await giveSaldo(special.agent.id, 100_000);
    const before = await xl(special.token);
    const base = before.pkg.hargaAgen;

    await setPricing('hargaAgen', before.pkg.id, base - 500, special.agent.id);
    const after = await xl(special.token);
    expect(after.pkg.hargaAgen).toBe(base - 500);
    expect((await xl(normal.token)).pkg.hargaAgen).toBe(base);

    // the app still holding the old price is told to re-check
    const stale = await request(app).post('/api/agent/transactions').set(auth(special.token))
      .send({ segmentId: after.segmentId, treeVersion: after.treeVersion, steps: after.steps, clientTotal: base, idempotencyKey: idem() });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('PRICE_CHANGED');

    const ok = await request(app).post('/api/agent/transactions').set(auth(special.token))
      .send({ segmentId: after.segmentId, treeVersion: after.treeVersion, steps: after.steps, clientTotal: base - 500, idempotencyKey: idem() });
    expect(ok.status).toBe(201);
    expect(ok.body.transaction.total).toBe(base - 500);
    expect(Number((await prisma.agent.findUniqueOrThrow({ where: { id: special.agent.id } })).saldo)).toBe(100_000 - (base - 500));

    // removing the override goes back to the default
    await setPricing('hargaAgen', before.pkg.id, null, special.agent.id);
    expect((await xl(special.token)).pkg.hargaAgen).toBe(base);
    expect(await prisma.agentPackageOverride.count({ where: { agentId: special.agent.id } })).toBe(0);
  });

  it('a typed sell price on the order is used and saved for the product', async () => {
    const a = await registerAgent('JualSendiri');
    await giveSaldo(a.agent.id, 100_000);
    const o = await xl(a.token);
    const res = await request(app).post('/api/agent/transactions').set(auth(a.token))
      .send({ segmentId: o.segmentId, treeVersion: o.treeVersion, steps: o.steps, clientTotal: o.pkg.hargaAgen, idempotencyKey: idem(), sellPrice: 15_000 });
    expect(res.status).toBe(201);
    expect(res.body.transaction.sellPrice).toBe(15_000);
    const saved = await request(app).get('/api/agent/sell-prices').set(auth(a.token));
    expect(saved.body.find((x: { packageId: string }) => x.packageId === o.pkg.id).sellPrice).toBe(15_000);
  });
});

describe('admin pricing sheet', () => {
  it('lists defaults and one agent\'s overrides, mass-updates, and keeps STAFF read-only', async () => {
    const admin = await adminToken();
    const agent = await registerAgent('Lembar');
    const all = await request(app).get('/api/admin/pricing').set(auth(admin)).query({ q: 'XL' });
    expect(all.status).toBe(200);
    expect(all.body.rows.length).toBeGreaterThan(0);
    expect(all.body.rows[0].override).toBeNull();
    const ids = all.body.rows.map((r: { id: string }) => r.id);

    // mass update: commission default 250 on every XL product
    const mass = await request(app).put('/api/admin/pricing').set(auth(admin))
      .send({ field: 'commission', rows: ids.map((id: string) => ({ packageId: id, value: 250 })) });
    expect(mass.body.updated).toBe(ids.length);
    expect((await prisma.package.findMany({ where: { id: { in: ids } } })).every((p) => p.commission === 250)).toBe(true);
    // a default can't be emptied
    expect((await request(app).put('/api/admin/pricing').set(auth(admin)).send({ field: 'commission', rows: [{ packageId: ids[0], value: null }] })).status).toBe(400);

    await setPricing('commission', ids[0], 400, agent.agent.id);
    const one = await request(app).get('/api/admin/pricing').set(auth(admin)).query({ agentId: agent.agent.id, onlyOverrides: '1' });
    expect(one.body.rows).toHaveLength(1);
    expect(one.body.rows[0]).toMatchObject({ id: ids[0], commission: 250, override: { hargaAgen: null, commission: 400 } });
    expect(await prisma.adminAuditLog.count({ where: { action: 'PRICING_COMMISSION' } })).toBeGreaterThan(0);

    const staff = await adminToken('STAFF');
    expect((await request(app).get('/api/admin/pricing').set(auth(staff))).status).toBe(200);
    expect((await request(app).put('/api/admin/pricing').set(auth(staff)).send({ field: 'commission', rows: [{ packageId: ids[0], value: 1 }] })).status).toBe(403);
  });
});

describe('forced update and Bank Mandiri', () => {
  it('blocks apps below the minimum (and apps without a version) except /config; Mandiri only for 1.3.0+', async () => {
    const admin = await adminToken();
    const { token } = await registerAgent('Versi');
    await request(app).put('/api/admin/config').set(auth(admin)).send({ mandiriAccountNumber: '1230000000000', mandiriAccountName: 'PT MURAH KUOTA' });

    const oldConfig = await request(app).get('/api/agent/config');
    expect(oldConfig.body.bankAccounts.map((b: { bank: string }) => b.bank)).not.toContain('MANDIRI');
    const newConfig = await request(app).get('/api/agent/config').set('X-App-Version', '1.3.0');
    expect(newConfig.body.bankAccounts.map((b: { bank: string }) => b.bank)).toContain('MANDIRI');
    expect(newConfig.body.minAppVersion).toBe('');

    expect((await request(app).put('/api/admin/config').set(auth(admin)).send({ minAppVersion: '1.3' })).status).toBe(400);
    expect((await request(app).put('/api/admin/config').set(auth(admin)).send({ minAppVersion: '1.3.0' })).status).toBe(200);

    const noHeader = await request(app).get('/api/agent/home').set(auth(token));
    expect(noHeader.status).toBe(426);
    expect(noHeader.body.code).toBe('APP_UPDATE_REQUIRED');
    expect((await request(app).get('/api/agent/home').set(auth(token)).set('X-App-Version', '1.2.9')).status).toBe(426);
    expect((await request(app).get('/api/agent/home').set(auth(token)).set('X-App-Version', '1.3.0')).status).toBe(200);
    expect((await request(app).get('/api/agent/home').set(auth(token)).set('X-App-Version', '1.10.0')).status).toBe(200);
    const cfg = await request(app).get('/api/agent/config');
    expect(cfg.status).toBe(200);
    expect(cfg.body.minAppVersion).toBe('1.3.0');

    // a Mandiri top-up from a new app
    const topUp = await request(app).post('/api/agent/topups').set(auth(token)).set('X-App-Version', '1.3.0').send({ amount: 50_000 });
    expect(topUp.status).toBe(201);
    const bank = await request(app).put(`/api/agent/topups/${topUp.body.id ?? topUp.body.order?.id}/bank`).set(auth(token)).set('X-App-Version', '1.3.0').send({ bank: 'MANDIRI' });
    expect(bank.status).toBe(200);

    await request(app).put('/api/admin/config').set(auth(admin)).send({ minAppVersion: '' });
    expect((await request(app).get('/api/agent/home').set(auth(token))).status).toBe(200);
  });
});
