import { app, auth, nextPhone, otpTicket, prisma, registerAgent, request, resetDb, TEST_PIN } from './helpers';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const otpRequest = (phone: string, purpose = 'REGISTER') => request(app).post('/api/agent/auth/otp/request').send({ phone, purpose });
const otpVerify = (phone: string, code: string, purpose = 'REGISTER') =>
  request(app).post('/api/agent/auth/otp/verify').send({ phone, code, purpose });
const pinLogin = (phone: string, pin: string) => request(app).post('/api/agent/auth/login/pin').send({ phone, pin });

describe('OTP', () => {
  it('stores only a hash, enforces cooldown, attempts and single use', async () => {
    const phone = nextPhone();
    const sent = await otpRequest(phone);
    expect(sent.status).toBe(200);
    expect(sent.body.debugCode).toMatch(/^\d{6}$/);
    const row = await prisma.phoneVerification.findUniqueOrThrow({ where: { phone } });
    expect(row.codeHash).not.toBe(sent.body.debugCode);

    const again = await otpRequest(phone);
    expect(again.status).toBe(429);
    expect(again.body.code).toBe('OTP_COOLDOWN');

    const wrong = sent.body.debugCode === '000000' ? '111111' : '000000';
    const bad = await otpVerify(phone, wrong);
    expect(bad.status).toBe(400);
    expect(bad.body.attemptsLeft).toBe(4);
    await prisma.phoneVerification.update({ where: { phone }, data: { attempts: 5 } });
    expect((await otpVerify(phone, sent.body.debugCode)).body.code).toBe('OTP_LOCKED');

    await prisma.phoneVerification.update({ where: { phone }, data: { attempts: 0 } });
    const ok = await otpVerify(phone, sent.body.debugCode);
    expect(ok.status).toBe(200);
    expect(ok.body.otpTicket).toBeTruthy();
    expect((await otpVerify(phone, sent.body.debugCode)).body.code).toBe('OTP_EXPIRED');
  });

  it('expired codes are rejected; purposes do not mix', async () => {
    const phone = nextPhone();
    const sent = await otpRequest(phone);
    await prisma.phoneVerification.update({ where: { phone }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await otpVerify(phone, sent.body.debugCode)).body.code).toBe('OTP_EXPIRED');

    // reset-PIN needs a registered phone, register needs a fresh one
    expect((await otpRequest(nextPhone(), 'RESET_PIN')).status).toBe(404);
    const { phone: taken } = await registerAgent('Taken');
    expect((await otpRequest(taken)).status).toBe(409);

    // a REGISTER ticket cannot reset a PIN
    const ticket = await otpTicket(nextPhone());
    const reset = await request(app).post('/api/agent/auth/pin/reset').send({ otpTicket: ticket, pin: '902817' });
    expect(reset.body.code).toBe('OTP_TICKET_INVALID');
  });

  it('register requires a ticket, a valid PIN and NIK', async () => {
    const phone = nextPhone();
    const ticket = await otpTicket(phone);
    const weak = await request(app).post('/api/agent/auth/register').send({ otpTicket: ticket, name: 'Weak', pin: '123456' });
    expect(weak.status).toBe(400);
    const badNik = await request(app).post('/api/agent/auth/register').send({ otpTicket: ticket, name: 'Nik', pin: TEST_PIN, nik: '123' });
    expect(badNik.status).toBe(400);
    const ok = await request(app).post('/api/agent/auth/register').send({ otpTicket: ticket, name: 'Nik', pin: TEST_PIN, nik: '3171234567890001' });
    expect(ok.status).toBe(201);
    expect(ok.body.agent).toMatchObject({ phone, nik: '3171234567890001', hasPin: true, hasPassword: false, phoneVerified: true, email: null });
    const row = await prisma.agent.findUniqueOrThrow({ where: { phone } });
    expect(row.pinHash).not.toBe(TEST_PIN);
    expect(row.joinedAt).toBeInstanceOf(Date);
  });
});

describe('sign-up without OTP', () => {
  it('phone + password signs up unverified and logs in with the password', async () => {
    const phone = nextPhone();
    const reg = await request(app).post('/api/agent/auth/register').send({ phone: '+62' + phone.slice(1), name: 'No OTP', pin: TEST_PIN, password: 'rahasia1' });
    expect(reg.status).toBe(201);
    expect(reg.body.agent).toMatchObject({ phone, phoneVerified: false, hasPassword: true, hasPin: true });
    const row = await prisma.agent.findUniqueOrThrow({ where: { phone } });
    expect(row.phoneVerifiedAt).toBeNull();

    const login = await request(app).post('/api/agent/auth/login').send({ identifier: phone, password: 'rahasia1' });
    expect(login.status).toBe(200);
    expect((await pinLogin(phone, TEST_PIN)).status).toBe(200);
    const again = await request(app).post('/api/agent/auth/register').send({ phone, name: 'Dup', pin: TEST_PIN });
    expect(again.status).toBe(409);
  });

  it('still needs a valid phone and a PIN; sessions last a year', async () => {
    const noPin = await request(app).post('/api/agent/auth/register').send({ phone: nextPhone(), name: 'No PIN', password: 'rahasia1' });
    expect(noPin.status).toBe(400);
    const noPhone = await request(app).post('/api/agent/auth/register').send({ name: 'No Phone', pin: TEST_PIN });
    expect(noPhone.status).toBe(400);
    const badPhone = await request(app).post('/api/agent/auth/register').send({ phone: '0211234567', name: 'Landline', pin: TEST_PIN });
    expect(badPhone.status).toBe(400);

    const ok = await request(app).post('/api/agent/auth/register').send({ phone: nextPhone(), name: 'Long Session', pin: TEST_PIN });
    const { exp, iat } = JSON.parse(Buffer.from(ok.body.token.split('.')[1], 'base64url').toString());
    expect((exp - iat) / 86400).toBe(365);
  });
});

describe('PIN', () => {
  it('logs in with phone + PIN, locks after 5 misses, resets via OTP', async () => {
    const { phone } = await registerAgent('Pinny');
    const ok = await pinLogin(phone, TEST_PIN);
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    for (let i = 4; i >= 1; i--) {
      const r = await pinLogin(phone, '111222');
      expect(r.status).toBe(401);
      expect(r.body.attemptsLeft).toBe(i);
    }
    expect((await pinLogin(phone, '111222')).body.code).toBe('PIN_LOCKED');
    expect((await pinLogin(phone, TEST_PIN)).body.code).toBe('PIN_LOCKED');

    const reset = await request(app).post('/api/agent/auth/pin/reset').send({ otpTicket: await otpTicket(phone, 'RESET_PIN'), pin: '902817' });
    expect(reset.status).toBe(200);
    expect(reset.body.token).toBeTruthy();
    expect((await pinLogin(phone, '902817')).status).toBe(200);
    const row = await prisma.agent.findUniqueOrThrow({ where: { phone } });
    expect(row.confirmationCode).toBeNull();
  });

  it('change PIN needs the old one; email/password login still works', async () => {
    const { token, phone } = await registerAgent('Changer');
    expect((await request(app).put('/api/agent/me/pin').set(auth(token)).send({ oldPin: '000111', newPin: '553311' })).status).toBe(400);
    expect((await request(app).put('/api/agent/me/pin').set(auth(token)).send({ oldPin: TEST_PIN, newPin: '553311' })).status).toBe(200);
    expect((await pinLogin(phone, '553311')).status).toBe(200);
    const pw = await request(app).post('/api/agent/auth/login').send({ identifier: phone, password: 'secret123' });
    expect(pw.status).toBe(200);
  });

  it('changing phone needs a VERIFY_PHONE ticket for the new number', async () => {
    const { token } = await registerAgent('Mover');
    const newPhone = nextPhone();
    const me = await request(app).put('/api/agent/me').set(auth(token)).send({ phoneOtpTicket: await otpTicket(newPhone, 'VERIFY_PHONE') });
    expect(me.status).toBe(200);
    expect(me.body.phone).toBe(newPhone);
  });
});
