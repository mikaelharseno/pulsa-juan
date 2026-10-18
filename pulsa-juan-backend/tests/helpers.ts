import request from 'supertest';

import app from '../src/app';
import { prisma } from '../prisma/client';
import { seed } from '../prisma/seed';

export { app, prisma, request };

/** Wipes every table and re-seeds. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "AdminAuditLog","AgentMarkupCommision","SaldoLedger","Transaction","TopUpOrder","MitraConnection",
    "Agent","AdminUser","SegmentTreeVersion","Segment","Package","ProviderPrefix","StoreConfig" RESTART IDENTITY CASCADE
  `);
  await seed();
}

export async function adminToken(role: 'OWNER' | 'ADMIN' | 'STAFF' = 'OWNER') {
  if (role !== 'OWNER') {
    const bcrypt = await import('bcrypt');
    const email = role.toLowerCase() + '@test.local';
    await prisma.adminUser.upsert({
      where: { email },
      update: {},
      create: { email, name: role, role, passwordHash: await bcrypt.hash('pass1234', 4) },
    });
    const res = await request(app).post('/api/admin/login').send({ email, password: 'pass1234' });
    return res.body.token as string;
  }
  const res = await request(app).post('/api/admin/login').send({ email: 'admin@pulsajuan.local', password: 'admin123' });
  if (!res.body.token) throw new Error('admin login failed: ' + JSON.stringify(res.body));
  return res.body.token as string;
}

let phoneSeq = 1000;
export async function registerAgent(name: string, referralCode?: string) {
  phoneSeq++;
  const res = await request(app)
    .post('/api/agent/auth/register')
    .send({ name, email: `${name.toLowerCase()}${phoneSeq}@test.local`, phone: `0812${String(phoneSeq).padStart(8, '0')}`, password: 'secret123', referralCode });
  if (res.status !== 201) throw new Error('register failed: ' + JSON.stringify(res.body));
  return { token: res.body.token as string, agent: res.body.agent as { id: string; commisionUniqueId: string } };
}

export async function giveSaldo(agentId: string, amount: number) {
  const token = await adminToken();
  const res = await request(app).post(`/api/admin/agents/${agentId}/adjust-saldo`).set('Authorization', 'Bearer ' + token).send({ delta: amount, note: 'test' });
  if (res.status !== 200) throw new Error('adjust failed: ' + JSON.stringify(res.body));
}

export const auth = (token: string) => ({ Authorization: 'Bearer ' + token });
