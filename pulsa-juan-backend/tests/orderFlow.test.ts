import { FlowStep, PackagePublic } from 'pulsa-juan-common';

import { adminToken, app, auth, giveSaldo, prisma, registerAgent, request, resetDb, TEST_PIN } from './helpers';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

let key = 0;

async function order(token: string, code: string, extra: Record<string, unknown> = {}) {
  const tree = await request(app).get('/api/agent/segments/pulsa/tree').set(auth(token));
  const pkg = (Object.values(tree.body.packages) as PackagePublic[]).find((p) => p.code === code)!;
  const steps: FlowStep[] = [
    { nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '087712345678' },
    { nodeId: 'pk_xl', type: 'PackagesList', packageId: pkg.id },
  ];
  return request(app)
    .post('/api/agent/transactions')
    .set(auth(token))
    .send({ segmentId: tree.body.segment.id, treeVersion: tree.body.treeVersion, steps, clientTotal: pkg.hargaAgen + tree.body.markupTotal, idempotencyKey: `orderflow-${++key}`, ...extra });
}

describe('purchase PIN', () => {
  it('is checked when sent, required once the setting is on, and locks after 5 wrong tries', async () => {
    const { token, agent } = await registerAgent('Pinner');
    await giveSaldo(agent.id, 500_000);

    // old apps send no PIN: fine while the setting is off
    expect((await order(token, 'XL_10K')).status).toBe(201);
    // a sent PIN is always checked; a wrong one is 400 (not 401, which would sign the app out)
    const wrong = await order(token, 'XL_10K', { pin: '111222' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('PIN_INVALID');
    expect((await order(token, 'XL_10K', { pin: TEST_PIN })).status).toBe(201);

    const admin = await adminToken();
    expect((await request(app).put('/api/admin/config').set(auth(admin)).send({ requirePurchasePin: true })).status).toBe(200);
    const missing = await order(token, 'XL_10K');
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('PIN_REQUIRED');

    for (let i = 0; i < 4; i++) expect((await order(token, 'XL_10K', { pin: '111222' })).body.code).toBe('PIN_INVALID');
    expect((await order(token, 'XL_10K', { pin: '111222' })).body.code).toBe('PIN_LOCKED');
    expect((await order(token, 'XL_10K', { pin: TEST_PIN })).body.code).toBe('PIN_LOCKED');
    // the same lock guards changing the PIN
    expect((await request(app).put('/api/agent/me/pin').set(auth(token)).send({ oldPin: TEST_PIN, newPin: '135792' })).body.code).toBe('PIN_LOCKED');

    await prisma.agent.update({ where: { id: agent.id }, data: { pinLockedUntil: null } });
    expect((await order(token, 'XL_10K', { pin: TEST_PIN })).status).toBe(201);
    await request(app).put('/api/admin/config').set(auth(admin)).send({ requirePurchasePin: false });
  });

  it('asks an agent without a PIN to make one', async () => {
    const { token, agent } = await registerAgent('NoPin');
    await prisma.agent.update({ where: { id: agent.id }, data: { pinHash: null } });
    await giveSaldo(agent.id, 50_000);
    const r = await order(token, 'XL_10K', { pin: TEST_PIN });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PIN_REQUIRED');
  });
});

describe('saved sell price per product', () => {
  it('saves on edit, beats the margin on the next order of that product only, and can be forgotten', async () => {
    const { token, agent } = await registerAgent('Penjual');
    await giveSaldo(agent.id, 500_000);
    await request(app).put('/api/agent/sell-margins').set(auth(token)).send({ default: 1000, bySegment: {} });

    const first = (await order(token, 'XL_10K')).body.transaction;
    expect(first.sellPrice).toBe(first.total + 1000);
    await request(app).put(`/api/agent/transactions/${first.id}/sell-price`).set(auth(token)).send({ sellPrice: 13_000 });

    const list = await request(app).get('/api/agent/sell-prices').set(auth(token));
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ packageId: first.packageId, sellPrice: 13_000 });

    // same product: the saved price wins over the margin
    expect((await order(token, 'XL_10K')).body.transaction.sellPrice).toBe(13_000);
    // another product: still the margin
    const other = (await order(token, 'XL_25K')).body.transaction;
    expect(other.sellPrice).toBe(other.total + 1000);

    // editing again overwrites the saved price
    const second = (await order(token, 'XL_10K')).body.transaction;
    await request(app).put(`/api/agent/transactions/${second.id}/sell-price`).set(auth(token)).send({ sellPrice: 14_000 });
    expect((await order(token, 'XL_10K')).body.transaction.sellPrice).toBe(14_000);

    // another agent cannot delete it; the owner can, and the margin is back
    const stranger = await registerAgent('Stranger');
    const id = (await request(app).get('/api/agent/sell-prices').set(auth(token))).body[0].id;
    expect((await request(app).delete(`/api/agent/sell-prices/${id}`).set(auth(stranger.token))).status).toBe(404);
    expect((await request(app).delete(`/api/agent/sell-prices/${id}`).set(auth(token))).status).toBe(200);
    const after = (await order(token, 'XL_10K')).body.transaction;
    expect(after.sellPrice).toBe(after.total + 1000);
  });
});

describe('bon PDF', () => {
  it('gives a stable public link whose PDF shows the sell price and never the cost', async () => {
    const { token, agent } = await registerAgent('TokoBon');
    await giveSaldo(agent.id, 100_000);
    const trx = (await order(token, 'XL_10K')).body.transaction;
    await request(app).put(`/api/agent/transactions/${trx.id}/sell-price`).set(auth(token)).send({ sellPrice: 12_500 });

    const a = await request(app).post(`/api/agent/transactions/${trx.id}/bon`).set(auth(token));
    expect(a.status).toBe(200);
    const b = await request(app).post(`/api/agent/transactions/${trx.id}/bon`).set(auth(token));
    expect(b.body.token).toBe(a.body.token);
    expect(a.body.token.length).toBeGreaterThanOrEqual(20);

    const other = await registerAgent('Other');
    expect((await request(app).post(`/api/agent/transactions/${trx.id}/bon`).set(auth(other.token))).status).toBe(404);

    const pdf = await request(app).get(`/api/bon/${a.body.token}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // the content (checked on the data the PDF is drawn from)
    const { bonData } = await import('../src/service/bon.service');
    const data = await bonData(a.body.token);
    expect(data.price).toBe(12_500);
    expect(data.sellerName).toBe('TokoBon');
    expect(data.rows.map((r) => r.label)).toEqual(expect.arrayContaining(['Paket']));
    expect(JSON.stringify(data)).not.toContain(String(trx.total));

    expect((await request(app).get('/api/bon/not-a-real-token-xxxxxxxx')).status).toBe(404);

    // a failed order has no bon
    const admin = await adminToken();
    await request(app).put(`/api/admin/transactions/${trx.id}`).set(auth(admin)).send({ status: 'FAILED', failReason: 'x' });
    expect((await request(app).get(`/api/bon/${a.body.token}`)).status).toBe(404);
  });
});
