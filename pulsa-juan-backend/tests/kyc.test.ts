import sharp from 'sharp';

import { evaluate, faceChroma, LivenessColor } from '../src/service/liveness.service';
import { adminToken, app, auth, giveSaldo, prisma, registerAgent, request, resetDb, TEST_PIN } from './helpers';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const SKIN = { r: 196, g: 150, b: 128 };
const LIGHT: Record<LivenessColor | 'white', { r: number; g: number; b: number }> = {
  white: { r: 0, g: 0, b: 0 },
  red: { r: 45, g: -12, b: -12 },
  blue: { r: -15, g: -5, b: 50 },
  yellow: { r: 30, g: 28, b: -25 },
};
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** A 240×320 "selfie": grey surroundings, a skin-toned face in the centre lit by `light`. */
async function frame(light: LivenessColor | 'white', faceLit = true) {
  const l = faceLit ? LIGHT[light] : LIGHT.white;
  const face = await sharp({ create: { width: 120, height: 160, channels: 3, background: { r: clamp(SKIN.r + l.r), g: clamp(SKIN.g + l.g), b: clamp(SKIN.b + l.b) } } }).png().toBuffer();
  return sharp({ create: { width: 240, height: 320, channels: 3, background: { r: 90, g: 90, b: 95 } } })
    .composite([{ input: face, left: 60, top: 70 }])
    .jpeg({ quality: 80 })
    .toBuffer();
}

describe('live check scoring', () => {
  it('passes when each frame shifts toward its colour and fails on a static picture', async () => {
    const colors: LivenessColor[] = ['blue', 'red', 'yellow', 'red'];
    const base = await faceChroma(await frame('white'));
    const lit = await Promise.all(colors.map(async (c) => faceChroma(await frame(c))));
    expect(evaluate(colors, base, lit, 0.012).passed).toBe(true);

    // a photo held up: the colour barely reaches the face
    const flat = await Promise.all(colors.map(async (c) => faceChroma(await frame(c, false))));
    const res = evaluate(colors, base, flat, 0.012);
    expect(res.passed).toBe(false);
    expect(res.reason).toMatch(/Perubahan warna/);

    // frames in the wrong order (a replay that guessed): fails
    const wrong = await Promise.all((['red', 'blue', 'red', 'yellow'] as LivenessColor[]).map(async (c) => faceChroma(await frame(c))));
    expect(evaluate(colors, base, wrong, 0.012).passed).toBe(false);
  });
});

async function livePass(token: string) {
  const start = await request(app).post('/api/agent/kyc/liveness').set(auth(token));
  expect(start.status).toBe(201);
  const colors = start.body.colors as LivenessColor[];
  expect(colors).toHaveLength(4);
  expect(new Set(colors).size).toBe(3);
  let req = request(app).post(`/api/agent/kyc/liveness/${start.body.id}`).set(auth(token)).attach('frame0', await frame('white'), 'f0.jpg');
  for (let i = 0; i < colors.length; i++) req = req.attach(`frame${i + 1}`, await frame(colors[i]), `f${i + 1}.jpg`);
  const checked = await req;
  return { id: start.body.id as string, checked };
}

describe('identity check (Plus)', () => {
  it('live check → submit → admin approves → Plus services open, NIK locked', async () => {
    const admin = await adminToken();
    const { token, agent } = await registerAgent('Kyc');
    await giveSaldo(agent.id, 200_000);
    const gopay = await prisma.segment.findUniqueOrThrow({ where: { slug: 'gopay' }, include: { publishedVersion: true } });
    expect(gopay.requiresVerification).toBe(true);

    // unverified: e-wallet top-up blocked
    const order = () =>
      request(app)
        .post('/api/agent/transactions')
        .set(auth(token))
        .send({
          segmentId: gopay.id,
          treeVersion: gopay.publishedVersion!.version,
          steps: [
            { nodeId: 'jenis', type: 'ListNode', rowId: 'customer' },
            { nodeId: 'phone_c', type: 'PhoneNumberInput', phoneNumber: '081234567890' },
            { nodeId: 'amount_c', type: 'EnterAmount', amount: 50_000 },
          ],
          clientTotal: 51_500,
          idempotencyKey: `kyc-order-${Date.now()}-${Math.random()}`,
          pin: TEST_PIN,
        });
    const blocked = await order();
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('KYC_REQUIRED');
    expect((await request(app).get('/api/agent/home').set(auth(token))).body.segments.find((s: { slug: string }) => s.slug === 'gopay').requiresVerification).toBe(true);

    // submitting needs a passed live check
    const noLive = await request(app).post('/api/agent/kyc').set(auth(token)).field('livenessId', 'x'.repeat(20)).field('nik', '3273021505900001').field('name', 'KYC TEST');
    expect(noLive.status).toBe(400);

    const live = await livePass(token);
    expect(live.checked.status).toBe(200);
    expect(live.checked.body.passed).toBe(true);
    // one try per challenge
    expect((await request(app).post(`/api/agent/kyc/liveness/${live.id}`).set(auth(token)).attach('frame0', await frame('white'), 'f.jpg')).body.code).toBe('LIVENESS_USED');

    const bad = await request(app)
      .post('/api/agent/kyc')
      .set(auth(token))
      .field('livenessId', live.id)
      .field('nik', '9999999999999999')
      .field('name', 'KYC TEST')
      .attach('ktp', await frame('white'), 'ktp.jpg')
      .attach('selfie', await frame('white'), 'selfie.jpg');
    expect(bad.body.code).toBe('KYC_NIK');

    const sent = await request(app)
      .post('/api/agent/kyc')
      .set(auth(token))
      .field('livenessId', live.id)
      .field('nik', '3273021505900001')
      .field('name', 'KYC TEST')
      .field('ocrNik', '3273021505900001')
      .field('ocrName', 'KYC TEST')
      .attach('ktp', await frame('white'), 'ktp.jpg')
      .attach('selfie', await frame('white'), 'selfie.jpg');
    expect(sent.status).toBe(201);
    expect(sent.body.status).toBe('PENDING');
    expect((await request(app).get('/api/agent/kyc').set(auth(token))).body.status).toBe('PENDING');

    // the dashboard sees it and its private photos; nothing is under /uploads
    const list = await request(app).get('/api/admin/kyc').set(auth(admin));
    const sub = list.body.submissions.find((s: { agentId: string }) => s.agentId === agent.id);
    expect(sub).toMatchObject({ nik: '3273021505900001', ocrNik: '3273021505900001', liveness: { passed: true, frames: 5 } });
    expect(sub.ktpKey).toBeUndefined();
    const ktp = await request(app).get(`/api/admin/kyc/${sub.id}/files/ktp`).set(auth(admin));
    expect(ktp.status).toBe(200);
    expect(ktp.headers['content-type']).toBe('image/jpeg');
    expect((await request(app).get(`/api/admin/kyc/${sub.id}/files/frame-4`).set(auth(admin))).status).toBe(200);
    expect((await request(app).get(`/api/admin/kyc/${sub.id}/files/ktp`)).status).toBe(401);
    const staff = await adminToken('STAFF');
    expect((await request(app).put(`/api/admin/kyc/${sub.id}`).set(auth(staff)).send({ status: 'VERIFIED' })).status).toBe(403);

    expect((await request(app).put(`/api/admin/kyc/${sub.id}`).set(auth(admin)).send({ status: 'VERIFIED' })).status).toBe(200);
    const me = await request(app).get('/api/agent/me').set(auth(token));
    expect(me.body).toMatchObject({ kycStatus: 'VERIFIED', nik: '3273021505900001' });
    expect((await order()).status).toBe(201);

    // verified NIK cannot be changed by the agent
    expect((await request(app).put('/api/agent/me').set(auth(token)).send({ nik: '3273021505900002' })).body.code).toBe('NIK_LOCKED');
  });

  it('a static picture fails the live check; a rejection can be retried', async () => {
    const admin = await adminToken();
    const { token, agent } = await registerAgent('Kyc2');
    const start = await request(app).post('/api/agent/kyc/liveness').set(auth(token));
    let req = request(app).post(`/api/agent/kyc/liveness/${start.body.id}`).set(auth(token)).attach('frame0', await frame('white'), 'f0.jpg');
    for (let i = 0; i < 4; i++) req = req.attach(`frame${i + 1}`, await frame('white'), `f${i + 1}.jpg`);
    const flat = await req;
    expect(flat.body.passed).toBe(false);
    expect(flat.body.reason).toBeTruthy();
    const refused = await request(app)
      .post('/api/agent/kyc')
      .set(auth(token))
      .field('livenessId', start.body.id)
      .field('nik', '3273025505900001')
      .field('name', 'SITI')
      .attach('ktp', await frame('white'), 'ktp.jpg')
      .attach('selfie', await frame('white'), 'selfie.jpg');
    expect(refused.body.code).toBe('KYC_LIVENESS');

    const live = await livePass(token);
    const sent = await request(app)
      .post('/api/agent/kyc')
      .set(auth(token))
      .field('livenessId', live.id)
      .field('nik', '3273025505900001')
      .field('name', 'SITI')
      .attach('ktp', await frame('white'), 'ktp.jpg')
      .attach('selfie', await frame('white'), 'selfie.jpg');
    expect(sent.status).toBe(201);
    expect((await request(app).put(`/api/admin/kyc/${sent.body.id}`).set(auth(admin)).send({ status: 'REJECTED' })).status).toBe(400);
    await request(app).put(`/api/admin/kyc/${sent.body.id}`).set(auth(admin)).send({ status: 'REJECTED', reason: 'Foto KTP buram' });
    expect((await request(app).get('/api/agent/kyc').set(auth(token))).body).toMatchObject({ status: 'REJECTED', rejectReason: 'Foto KTP buram' });

    // can try again
    const again = await livePass(token);
    const resent = await request(app)
      .post('/api/agent/kyc')
      .set(auth(token))
      .field('livenessId', again.id)
      .field('nik', '3273025505900001')
      .field('name', 'SITI')
      .attach('ktp', await frame('white'), 'ktp.jpg')
      .attach('selfie', await frame('white'), 'selfie.jpg');
    expect(resent.status).toBe(201);
    void agent;
  });
});
