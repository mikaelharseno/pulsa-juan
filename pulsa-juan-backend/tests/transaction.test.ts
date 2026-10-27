import { FlowStep, PackagePublic } from 'pulsa-juan-common';

import { setGoogleVerifier } from '../src/service/agentAuth.service';
import { adminToken, app, auth, giveSaldo, nextPhone, otpTicket, prisma, registerAgent, request, resetDb, TEST_PIN } from './helpers';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function pulsaXl(token: string) {
  const tree = await request(app).get('/api/agent/segments/pulsa/tree').set(auth(token));
  expect(tree.status).toBe(200);
  const pkg = (Object.values(tree.body.packages) as PackagePublic[]).find((p) => p.code === 'XL_10K')!;
  const steps: FlowStep[] = [
    { nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '0877 1234 5678' },
    { nodeId: 'pk_xl', type: 'PackagesList', packageId: pkg.id },
  ];
  return { tree: tree.body, pkg, steps, segmentId: tree.body.segment.id as string, markupTotal: tree.body.markupTotal as number };
}

let key = 0;
const idem = () => `test-key-${Date.now()}-${++key}`;

describe('transactions', () => {
  it('debits saldo, rejects tampered total / stale version / illegal path, idempotent', async () => {
    const { token, agent } = await registerAgent('Agen');
    const { pkg, steps, segmentId } = await pulsaXl(token);
    const START = pkg.hargaAgen * 4 + 100; // exactly four purchases fit
    await giveSaldo(agent.id, START);

    const tampered = await request(app).post('/api/agent/transactions').set(auth(token)).send({ segmentId, treeVersion: 1, steps, clientTotal: pkg.hargaAgen - 5000, idempotencyKey: idem() });
    expect(tampered.status).toBe(409);
    expect(tampered.body.code).toBe('PRICE_CHANGED');
    expect(tampered.body.total).toBe(pkg.hargaAgen);

    const stale = await request(app).post('/api/agent/transactions').set(auth(token)).send({ segmentId, treeVersion: 99, steps, clientTotal: pkg.hargaAgen, idempotencyKey: idem() });
    expect(stale.body.code).toBe('TREE_OUTDATED');

    const illegal = await request(app).post('/api/agent/transactions').set(auth(token)).send({
      segmentId, treeVersion: 1, clientTotal: pkg.hargaAgen, idempotencyKey: idem(),
      steps: [steps[0], { nodeId: 'pk_telkomsel', type: 'PackagesList', packageId: pkg.id }],
    });
    expect(illegal.status).toBe(400);
    expect(illegal.body.code).toBe('ILLEGAL_PATH');

    const k = idem();
    const ok = await request(app).post('/api/agent/transactions').set(auth(token)).send({ segmentId, treeVersion: 1, steps, clientTotal: pkg.hargaAgen, idempotencyKey: k });
    expect(ok.status).toBe(201);
    expect(ok.body.transaction.status).toBe('PENDING');
    expect(ok.body.transaction.phoneNumber).toBe('087712345678');
    expect(ok.body.transaction.summary[0].value).toBe('087712345678 (XL)');
    const me = await request(app).get('/api/agent/me').set(auth(token));
    expect(me.body.saldo).toBe(START - pkg.hargaAgen);

    const replay = await request(app).post('/api/agent/transactions').set(auth(token)).send({ segmentId, treeVersion: 1, steps, clientTotal: pkg.hargaAgen, idempotencyKey: k });
    expect(replay.status).toBe(200);
    expect(replay.body.reused).toBe(true);
    expect((await request(app).get('/api/agent/me').set(auth(token))).body.saldo).toBe(START - pkg.hargaAgen);

    // drain saldo then fail
    for (let i = 0; i < 3; i++) {
      const r = await request(app).post('/api/agent/transactions').set(auth(token)).send({ segmentId, treeVersion: 1, steps, clientTotal: pkg.hargaAgen, idempotencyKey: idem() });
      expect(r.status).toBe(201);
    }
    const broke = await request(app).post('/api/agent/transactions').set(auth(token)).send({ segmentId, treeVersion: 1, steps, clientTotal: pkg.hargaAgen, idempotencyKey: idem() });
    expect(broke.status).toBe(400);
    expect(broke.body.code).toBe('SALDO_KURANG');

    // admin settles: FAILED refunds, second settle conflicts
    const admin = await adminToken();
    const failed = await request(app).put(`/api/admin/transactions/${ok.body.transaction.id}`).set(auth(admin)).send({ status: 'FAILED', failReason: 'nomor salah' });
    expect(failed.body.status).toBe('FAILED');
    const after = await request(app).get('/api/agent/me').set(auth(token));
    expect(after.body.saldo).toBe(START - pkg.hargaAgen * 4 + pkg.hargaAgen);
    expect((await request(app).put(`/api/admin/transactions/${ok.body.transaction.id}`).set(auth(admin)).send({ status: 'SUCCESS' })).status).toBe(409);

    // list filters + rekap
    const list = await request(app).get('/api/agent/transactions').set(auth(token)).query({ phone: '0877', sort: 'total', dir: 'asc' });
    expect(list.body.total).toBe(4);
    const none = await request(app).get('/api/agent/transactions').set(auth(token)).query({ phone: '0899' });
    expect(none.body.total).toBe(0);
    const rekap = await request(app).get('/api/agent/rekap').set(auth(token));
    expect(rekap.body.count).toBe(3);
    expect(rekap.body.totalSpent).toBe(pkg.hargaAgen * 3);
    expect(rekap.body.bySegment[0].segmentLabel).toBe('Pulsa');
  });

  it('parallel purchases never overdraw', async () => {
    const { token, agent } = await registerAgent('Race');
    const { pkg, steps, segmentId } = await pulsaXl(token);
    await giveSaldo(agent.id, pkg.hargaAgen * 3);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).post('/api/agent/transactions').set(auth(token)).send({ segmentId, treeVersion: 1, steps, clientTotal: pkg.hargaAgen, idempotencyKey: idem() }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.body.code === 'SALDO_KURANG')).toHaveLength(5);
    expect((await request(app).get('/api/agent/me').set(auth(token))).body.saldo).toBe(0);
  });

  it('gopay amount flow and PLN pascabayar inquiry (stub)', async () => {
    const { token, agent } = await registerAgent('Gopay');
    await giveSaldo(agent.id, 500000);
    const gopay = await request(app).get('/api/agent/segments/gopay/tree').set(auth(token));
    const steps: FlowStep[] = [
      { nodeId: 'jenis', type: 'ListNode', rowId: 'driver' },
      { nodeId: 'phone_d', type: 'PhoneNumberInput', phoneNumber: '085712345678' },
      { nodeId: 'amount_d', type: 'EnterAmount', amount: 50000 },
    ];
    const ok = await request(app).post('/api/agent/transactions').set(auth(token)).send({ segmentId: gopay.body.segment.id, treeVersion: 1, steps, clientTotal: 51500, idempotencyKey: idem() });
    expect(ok.status).toBe(201);
    expect(ok.body.transaction.adminFee).toBe(1500);

    // PLN pascabayar is seeded inactive; activate for the inquiry test
    await prisma.segment.update({ where: { slug: 'pln-pascabayar' }, data: { isActive: true } });
    const inq = await request(app).post('/api/agent/inquiries').set(auth(token)).send({ segmentId: 'pln-pascabayar', nodeId: 'inquiry', customerId: '123456789012' });
    expect(inq.status).toBe(200);
    expect(inq.body.amountDue).toBeGreaterThan(0);
    const pln = await request(app).get('/api/agent/segments/pln-pascabayar/tree').set(auth(token));
    const plnSteps: FlowStep[] = [
      { nodeId: 'idpel', type: 'CustomerIdInput', values: { customerId: '123456789012' } },
      { nodeId: 'inquiry', type: 'BillInquiry', customerId: '123456789012', amountDue: inq.body.amountDue, customerName: inq.body.customerName },
    ];
    const paid = await request(app).post('/api/agent/transactions').set(auth(token)).send({ segmentId: pln.body.segment.id, treeVersion: 1, steps: plnSteps, clientTotal: inq.body.amountDue + inq.body.adminFee, idempotencyKey: idem() });
    expect(paid.status).toBe(201);
    expect(paid.body.transaction.summary.some((r: { label: string }) => r.label === 'Nama Pelanggan')).toBe(true);
  });
});

describe('referral commissions (A → B → C → D)', () => {
  it('prices markups two levels up, accrues, claims, voids on failure, transfers the crown', async () => {
    const A = await registerAgent('AgenA');
    await request(app).put('/api/agent/me').set(auth(A.token)).send({ referralMarkup: 500 });
    const B = await registerAgent('AgenB', A.agent.commisionUniqueId);
    await request(app).put('/api/agent/me').set(auth(B.token)).send({ referralMarkup: 200 });
    const C = await registerAgent('AgenC', B.agent.commisionUniqueId);
    await request(app).put('/api/agent/me').set(auth(C.token)).send({ referralMarkup: 100 });
    const D = await registerAgent('AgenD', C.agent.commisionUniqueId);
    await giveSaldo(C.agent.id, 200000);
    await giveSaldo(D.agent.id, 200000);

    const c = await pulsaXl(C.token);
    expect(c.markupTotal).toBe(700);
    const cTrx = await request(app).post('/api/agent/transactions').set(auth(C.token)).send({ segmentId: c.segmentId, treeVersion: 1, steps: c.steps, clientTotal: c.pkg.hargaAgen + 700, idempotencyKey: idem() });
    expect(cTrx.status).toBe(201);
    expect(cTrx.body.transaction.markupTotal).toBe(700);
    const cComm = await prisma.agentMarkupCommision.findMany({ where: { transactionId: cTrx.body.transaction.id }, orderBy: { level: 'asc' } });
    expect(cComm.map((x) => [x.level, x.amount, x.beneficiaryCommisionId])).toEqual([
      [1, 200, B.agent.commisionUniqueId],
      [2, 500, A.agent.commisionUniqueId],
    ]);

    const d = await pulsaXl(D.token);
    expect(d.markupTotal).toBe(300);
    const dTrx = await request(app).post('/api/agent/transactions').set(auth(D.token)).send({ segmentId: d.segmentId, treeVersion: 1, steps: d.steps, clientTotal: d.pkg.hargaAgen + 300, idempotencyKey: idem() });
    const dComm = await prisma.agentMarkupCommision.findMany({ where: { transactionId: dTrx.body.transaction.id }, orderBy: { level: 'asc' } });
    expect(dComm.map((x) => [x.level, x.amount, x.beneficiaryCommisionId])).toEqual([
      [1, 100, C.agent.commisionUniqueId],
      [2, 200, B.agent.commisionUniqueId],
    ]);
    expect(dComm.some((x) => x.beneficiaryCommisionId === A.agent.commisionUniqueId)).toBe(false);

    // claim only after SUCCESS
    const early = await request(app).post('/api/agent/commissions/claim').set(auth(B.token));
    expect(early.status).toBe(400);
    const summary = await request(app).get('/api/agent/commissions').set(auth(B.token));
    expect(summary.body.pendingTotal).toBe(400);
    const admin = await adminToken();
    await request(app).put(`/api/admin/transactions/${cTrx.body.transaction.id}`).set(auth(admin)).send({ status: 'SUCCESS', serialNumber: 'SN123' });
    const claim = await request(app).post('/api/agent/commissions/claim').set(auth(B.token));
    expect(claim.status).toBe(200);
    expect(claim.body.claimed).toBe(200);
    expect(claim.body.saldo).toBe(200);
    expect(claim.body.saldoKomisi).toBe(200);
    expect((await request(app).post('/api/agent/commissions/claim').set(auth(B.token))).status).toBe(400);

    // failure voids unclaimed entries
    await request(app).put(`/api/admin/transactions/${dTrx.body.transaction.id}`).set(auth(admin)).send({ status: 'FAILED', failReason: 'gagal' });
    const voided = await prisma.agentMarkupCommision.findMany({ where: { transactionId: dTrx.body.transaction.id } });
    expect(voided.every((x) => x.status === 'VOIDED')).toBe(true);

    // crown transfer: E takes A's code (and A's unclaimed 500)
    const E = await registerAgent('AgenE');
    const crown = A.agent.commisionUniqueId;
    const transfer = await request(app).post(`/api/admin/agents/${A.agent.id}/transfer-commission-id`).set(auth(admin)).send({ toAgentId: E.agent.id });
    expect(transfer.status).toBe(200);
    expect((await request(app).get('/api/agent/me').set(auth(E.token))).body.commisionUniqueId).toBe(crown);
    expect((await request(app).get('/api/agent/me').set(auth(A.token))).body.commisionUniqueId).not.toBe(crown);
    const eClaim = await request(app).post('/api/agent/commissions/claim').set(auth(E.token));
    expect(eClaim.body.claimed).toBe(500);
    const mitra = await request(app).get('/api/agent/mitra').set(auth(E.token));
    expect(mitra.body.children.map((x: { name: string }) => x.name)).toEqual(['AgenB']);
    // B's upline is now E, and B still pays 500 for A's old link
    expect((await request(app).get('/api/agent/me').set(auth(B.token))).body.markupTotal).toBe(500);

    // unknown referral code
    const bad = await request(app).post('/api/agent/auth/register').send({ otpTicket: await otpTicket(nextPhone()), name: 'X', pin: TEST_PIN, referralCode: 'NOPE1234' });
    expect(bad.status).toBe(400);
  });
});

describe('google login', () => {
  it('unknown account adds a phone (no OTP), then reuses the agent', async () => {
    const A = await registerAgent('Ref');
    setGoogleVerifier(async (idToken) => ({ sub: 'sub-' + idToken, email: `${idToken}@gmail.com`, name: 'G User', picture: undefined }));
    const first = await request(app).post('/api/agent/auth/google').send({ idToken: 'google-token-1' });
    expect(first.status).toBe(200);
    expect(first.body.needsPhone).toBe(true);
    expect(first.body.token).toBeUndefined();

    const phone = '+62 813-0000-1111';
    const reg = await request(app)
      .post('/api/agent/auth/register')
      .send({ phone, googleTicket: first.body.googleTicket, name: 'G User', pin: TEST_PIN, referralCode: A.agent.commisionUniqueId });
    expect(reg.status).toBe(201);
    expect(reg.body.agent).toMatchObject({ phone: '081300001111', phoneVerified: false, hasPin: true, hasPassword: false });
    expect(reg.body.agent.email).toBe('google-token-1@gmail.com');
    expect(reg.body.agent.googleLinked).toBe(true);

    const second = await request(app).post('/api/agent/auth/google').send({ idToken: 'google-token-1' });
    expect(second.body.needsPhone).toBe(false);
    expect(second.body.agent.id).toBe(reg.body.agent.id);
    const mitra = await request(app).get('/api/agent/mitra').set(auth(A.token));
    expect(mitra.body.children).toHaveLength(1);
  });
});

describe('refunds and admin order log', () => {
  it('SUCCESS → REFUNDED credits back and claws back claimed commissions', async () => {
    const admin = await adminToken();
    const A = await registerAgent('RefA');
    await request(app).put('/api/agent/me').set(auth(A.token)).send({ referralMarkup: 300 });
    const B = await registerAgent('RefB', A.agent.commisionUniqueId);
    await giveSaldo(B.agent.id, 100000);
    const b = await pulsaXl(B.token);
    const total = b.pkg.hargaAgen + 300;
    const trx = await request(app).post('/api/agent/transactions').set(auth(B.token)).send({ segmentId: b.segmentId, treeVersion: 1, steps: b.steps, clientTotal: total, idempotencyKey: idem() });
    const id = trx.body.transaction.id;
    expect(trx.body.transaction.provider).toBe('manual');
    expect(trx.body.transaction.fulfillmentMode).toBe('MANUAL');

    // only SUCCESS can be refunded
    expect((await request(app).put(`/api/admin/transactions/${id}`).set(auth(admin)).send({ status: 'REFUNDED' })).status).toBe(409);
    await request(app).put(`/api/admin/transactions/${id}`).set(auth(admin)).send({ status: 'SUCCESS', serialNumber: 'SN9' });
    expect((await request(app).post('/api/agent/commissions/claim').set(auth(A.token))).body.claimed).toBe(300);
    // A spends most of it so the clawback has to dip into hutang
    await request(app).post(`/api/admin/agents/${A.agent.id}/adjust-saldo`).set(auth(admin)).send({ delta: -200, note: 'spent' });

    const refunded = await request(app).put(`/api/admin/transactions/${id}`).set(auth(admin)).send({ status: 'REFUNDED', refundReason: 'komplain' });
    expect(refunded.status).toBe(200);
    expect(refunded.body.status).toBe('REFUNDED');
    expect(refunded.body.refundReason).toBe('komplain');
    expect((await request(app).get('/api/agent/me').set(auth(B.token))).body.saldo).toBe(100000);
    const aMe = (await request(app).get('/api/agent/me').set(auth(A.token))).body;
    expect(aMe.saldo).toBe(0);
    expect(aMe.hutang).toBe(200);
    expect(aMe.saldoKomisi).toBe(0);
    const comm = await prisma.agentMarkupCommision.findMany({ where: { transactionId: id } });
    expect(comm.every((c) => c.status === 'VOIDED')).toBe(true);

    // terminal states
    for (const status of ['SUCCESS', 'FAILED', 'REFUNDED']) {
      expect((await request(app).put(`/api/admin/transactions/${id}`).set(auth(admin)).send({ status })).status).toBe(409);
    }

    const ledger = await request(app).get('/api/agent/ledger').set(auth(B.token));
    expect(ledger.body.entries.map((e: { type: string }) => e.type)).toEqual(['REFUND', 'PURCHASE', 'ADJUSTMENT']);
    expect(ledger.body.entries[0].balanceAfter).toBe(100000);
  });

  it('admin list is newest first across statuses and filters by agent', async () => {
    const admin = await adminToken();
    const X = await registerAgent('ListX');
    await giveSaldo(X.agent.id, 100000);
    const x = await pulsaXl(X.token);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await request(app).post('/api/agent/transactions').set(auth(X.token)).send({ segmentId: x.segmentId, treeVersion: 1, steps: x.steps, clientTotal: x.pkg.hargaAgen, idempotencyKey: idem() });
      ids.push(r.body.transaction.id);
    }
    await request(app).put(`/api/admin/transactions/${ids[0]}`).set(auth(admin)).send({ status: 'SUCCESS' });

    const all = await request(app).get('/api/admin/transactions').set(auth(admin));
    const times = all.body.transactions.map((t: { createdAt: string }) => t.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(new Set(all.body.transactions.map((t: { status: string }) => t.status)).size).toBeGreaterThan(1);

    const mine = await request(app).get('/api/admin/transactions').query({ agentId: X.agent.id }).set(auth(admin));
    expect(mine.body.transactions.map((t: { id: string }) => t.id)).toEqual([ids[1], ids[0]]);
    const pending = await request(app).get('/api/admin/transactions').query({ agentId: X.agent.id, status: 'PENDING' }).set(auth(admin));
    expect(pending.body.transactions.map((t: { id: string }) => t.id)).toEqual([ids[1]]);
  });

  it('supplier callback settles with the shared secret', async () => {
    const X = await registerAgent('Cb');
    await giveSaldo(X.agent.id, 50000);
    const x = await pulsaXl(X.token);
    const r = await request(app).post('/api/agent/transactions').set(auth(X.token)).send({ segmentId: x.segmentId, treeVersion: 1, steps: x.steps, clientTotal: x.pkg.hargaAgen, idempotencyKey: idem() });
    const body = { transactionId: r.body.transaction.id, status: 'SUCCESS', serialNumber: 'SN-CB', supplierRef: 'OTX-1' };
    expect((await request(app).post('/api/fulfillment/callback/manual').send(body)).status).toBe(503);
    process.env.FULFILLMENT_CALLBACK_SECRET = 'cb-secret';
    expect((await request(app).post('/api/fulfillment/callback/manual').set('X-Callback-Secret', 'nope').send(body)).status).toBe(401);
    expect((await request(app).post('/api/fulfillment/callback/otomax').set('X-Callback-Secret', 'cb-secret').send(body)).status).toBe(404);
    const ok = await request(app).post('/api/fulfillment/callback/manual').set('X-Callback-Secret', 'cb-secret').send(body);
    expect(ok.body).toEqual({ ok: true, status: 'SUCCESS' });
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: body.transactionId } });
    expect(row.serialNumber).toBe('SN-CB');
    expect(row.supplierRef).toBe('OTX-1');
    delete process.env.FULFILLMENT_CALLBACK_SECRET;
  });
});
