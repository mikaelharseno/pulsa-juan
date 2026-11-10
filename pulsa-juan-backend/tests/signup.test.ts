import { app, auth, nextPhone, otpTicket, prisma, registerAgent, request, resetDb, TEST_PIN } from './helpers';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('regions', () => {
  it('lists provinces → regencies → districts and matches geocoder names', async () => {
    const prov = await request(app).get('/api/agent/regions/provinces');
    expect(prov.status).toBe(200);
    expect(prov.body.length).toBe(38);
    const jabar = prov.body.find((p: { name: string }) => p.name === 'Jawa Barat');
    const regencies = (await request(app).get(`/api/agent/regions/${jabar.code}/children`)).body as { code: string; name: string }[];
    expect(regencies.some((r) => r.name === 'Kota Bandung') && regencies.some((r) => r.name === 'Kabupaten Bandung')).toBe(true);

    const m = await request(app).post('/api/agent/regions/match').send({ province: 'Jawa Barat', regency: 'Kota Bandung', district: 'Coblong' });
    expect(m.body.district).toMatchObject({ code: '32.73.02', name: 'Coblong' });
    // a regency without a recognisable district still comes back for the agent to finish
    const part = await request(app).post('/api/agent/regions/match').send({ province: 'DKI Jakarta', city: 'Jakarta Selatan', district: 'Nowhere' });
    expect(part.body.regency.name).toBe('Kota Administrasi Jakarta Selatan');
    expect(part.body.district).toBeNull();
  });
});

describe('sign-up domicile', () => {
  it('is stored from a district code and shown on the profile; a bad code is refused', async () => {
    const phone = nextPhone();
    const bad = await request(app)
      .post('/api/agent/auth/register')
      .send({ otpTicket: await otpTicket(phone), name: 'Domi', pin: TEST_PIN, domicile: { districtCode: '99.99.99', source: 'MANUAL' } });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('REGION_INVALID');

    const ok = await request(app)
      .post('/api/agent/auth/register')
      .send({ otpTicket: await otpTicket(phone), name: 'Domi', pin: TEST_PIN, domicile: { districtCode: '32.73.02', source: 'GPS', lat: -6.89, lng: 107.61 } });
    expect(ok.status).toBe(201);
    expect(ok.body.agent.domicile).toEqual({ districtCode: '32.73.02', label: 'Coblong, Kota Bandung, Jawa Barat', source: 'GPS' });
    const row = await prisma.agent.findUniqueOrThrow({ where: { id: ok.body.agent.id } });
    expect(row).toMatchObject({ domicileProvinceCode: '32', domicileRegencyCode: '32.73', domicileLat: -6.89, nik: null });

    // editable later
    const moved = await request(app).put('/api/agent/me').set(auth(ok.body.token)).send({ domicile: { districtCode: '34.04.07', source: 'MANUAL' } });
    expect(moved.body.domicile.label).toBe('Depok, Kabupaten Sleman, Daerah Istimewa Yogyakarta');
  });

  it('older apps can still sign up without one', async () => {
    const r = await registerAgent('Lama');
    const me = await request(app).get('/api/agent/me').set(auth(r.token));
    expect(me.body.domicile).toBeNull();
  });
});

describe('inviter code after sign-up', () => {
  it('links once, locks the upline markup, and refuses self and downline', async () => {
    const ana = await registerAgent('Ana');
    await request(app).put('/api/agent/me').set(auth(ana.token)).send({ referralMarkup: 700 });
    const budi = await registerAgent('Budi', ana.agent.commisionUniqueId);
    const solo = await registerAgent('Solo');

    expect((await request(app).post('/api/agent/mitra/referrer').set(auth(solo.token)).send({ code: solo.agent.commisionUniqueId })).body.code).toBe('REFERRER_SELF');
    expect((await request(app).post('/api/agent/mitra/referrer').set(auth(solo.token)).send({ code: 'ZZZZZZZZ' })).status).toBe(400);

    const linked = await request(app).post('/api/agent/mitra/referrer').set(auth(solo.token)).send({ code: budi.agent.commisionUniqueId.toLowerCase() });
    expect(linked.status).toBe(200);
    expect(linked.body.parent).toMatchObject({ name: 'Budi', commisionAmount: 0 });
    const row = await prisma.agent.findUniqueOrThrow({ where: { id: solo.agent.id } });
    expect(row.referrerAgentId).toBe(budi.agent.id);
    expect(row.referrerSetAt).not.toBeNull();

    // only once
    expect((await request(app).post('/api/agent/mitra/referrer').set(auth(solo.token)).send({ code: ana.agent.commisionUniqueId })).body.code).toBe('REFERRER_SET');
    // Budi already has an upline
    expect((await request(app).post('/api/agent/mitra/referrer').set(auth(budi.token)).send({ code: solo.agent.commisionUniqueId })).body.code).toBe('REFERRER_SET');

    // Ana has none, but Solo sits under her (Solo → Budi → Ana): a cycle
    const cyc = await request(app).post('/api/agent/mitra/referrer').set(auth(ana.token)).send({ code: solo.agent.commisionUniqueId });
    expect(cyc.body.code).toBe('REFERRER_CYCLE');

    // the frozen markup is the upline's at linking time
    const cici = await registerAgent('Cici');
    const linked2 = await request(app).post('/api/agent/mitra/referrer').set(auth(cici.token)).send({ code: ana.agent.commisionUniqueId });
    expect(linked2.body.parent.commisionAmount).toBe(700);
    expect((await request(app).get('/api/agent/me').set(auth(cici.token))).body.hasReferrer).toBe(true);
  });
});
