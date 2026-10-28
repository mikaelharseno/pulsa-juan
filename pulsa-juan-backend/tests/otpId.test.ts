import http from 'http';
import { AddressInfo } from 'net';

import { senderFromEnv, setOtpSender } from '../src/service/otp/sender';
import { setTelegramSender } from '../src/service/telegram.service';
import { adminToken, app, auth, nextPhone, prisma, registerAgent, request, resetDb } from './helpers';

// ---- fake otp.id: per-channel outcome ----
type Outcome = 'sent' | 'failed' | 'http500';
let outcomes: Record<string, Outcome> = {};
const hits: { auth?: string; body: Record<string, unknown> }[] = [];
const otpId = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c)).on('end', () => {
    const body = JSON.parse(raw);
    hits.push({ auth: req.headers.authorization, body });
    const outcome = outcomes[body.channel] ?? 'sent';
    if (outcome === 'http500') return res.writeHead(500).end('{}');
    const data = { otp_id: 'OTP1', status: outcome, channel: body.channel, number: body.destination, ...(outcome === 'failed' ? { failure: { code: 'NUMBER_NOT_ON_WHATSAPP' } } : {}) };
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ success: true, data, error: null }));
  });
});

const alerts: string[] = [];
const flush = () => new Promise((r) => setTimeout(r, 30));

beforeAll(async () => {
  await resetDb();
  await new Promise<void>((r) => otpId.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(otpId.address() as AddressInfo).port}`;
  setOtpSender(senderFromEnv({ OTPID_API_KEY: 'key-test', OTPID_URL: url, OTPID_BRAND: 'Pulsa Juan' }));
  setTelegramSender(async (_chat, html) => {
    alerts.push(html);
  });
});
afterAll(() => {
  setOtpSender(null);
  setTelegramSender(null);
  otpId.close();
});
beforeEach(() => {
  outcomes = {};
  hits.length = 0;
  alerts.length = 0;
});

const requestReset = (phone: string) => request(app).post('/api/agent/auth/otp/request').send({ phone, purpose: 'RESET_PIN' });

describe('forgot PIN through otp.id', () => {
  it('sends our own code by WhatsApp in international form, then the reset works', async () => {
    const { phone } = await registerAgent('Lupa');
    const sent = await requestReset(phone);
    expect(sent.status).toBe(200);
    expect(hits).toHaveLength(1);
    expect(hits[0].auth).toBe('Bearer key-test');
    expect(hits[0].body).toMatchObject({ channel: 'whatsapp', destination: '62' + phone.slice(1), brand: 'Pulsa Juan', ttl: 300 });
    expect(hits[0].body.otp).toBe(sent.body.debugCode);

    const verified = await request(app).post('/api/agent/auth/otp/verify').send({ phone, purpose: 'RESET_PIN', code: hits[0].body.otp });
    const reset = await request(app).post('/api/agent/auth/pin/reset').send({ otpTicket: verified.body.otpTicket, pin: '902817' });
    expect(reset.status).toBe(200);
  });

  it('falls back to SMS when the number has no WhatsApp', async () => {
    const { phone } = await registerAgent('Sms');
    outcomes = { whatsapp: 'failed' };
    expect((await requestReset(phone)).status).toBe(200);
    expect(hits.map((h) => h.body.channel)).toEqual(['whatsapp', 'sms']);
    expect(hits[0].body.otp).toBe(hits[1].body.otp);
    await flush();
    expect(alerts).toHaveLength(0);
  });

  it('every channel failing answers 502, alerts admins and lets the agent retry at once', async () => {
    const { phone } = await registerAgent('Gagal');
    outcomes = { whatsapp: 'failed', sms: 'http500' };
    const r = await requestReset(phone);
    expect(r.status).toBe(502);
    expect(r.body.code).toBe('OTP_SEND_FAILED');
    await flush();
    expect(alerts.join()).toMatch(/OTP tidak terkirim.*RESET_PIN/s);
    expect(alerts.join()).toMatch(/NUMBER_NOT_ON_WHATSAPP/);

    outcomes = {};
    expect((await requestReset(phone)).status).toBe(200); // no 60 s cooldown after a failed send
  });

  it('sign-up OTP stays in the log: nothing is sent or charged', async () => {
    const phone = nextPhone();
    const r = await request(app).post('/api/agent/auth/otp/request').send({ phone, purpose: 'REGISTER' });
    expect(r.status).toBe(200);
    expect(hits).toHaveLength(0);
    expect(await prisma.agent.count({ where: { phone } })).toBe(0);
  });

  it('the Integrasi card shows what goes through otp.id', async () => {
    process.env.OTPID_API_KEY = 'key-test';
    try {
      const r = await request(app).get('/api/admin/integrations').set(auth(await adminToken()));
      expect(r.body.otp).toEqual({ provider: 'otp.id', purposes: ['RESET_PIN'], channels: ['whatsapp', 'sms'] });
      expect(JSON.stringify(r.body)).not.toContain('key-test');
    } finally {
      delete process.env.OTPID_API_KEY;
    }
  });
});

