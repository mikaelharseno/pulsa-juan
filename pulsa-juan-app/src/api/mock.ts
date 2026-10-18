// Demo mode (EXPO_PUBLIC_MOCK=1): an in-memory stand-in for the backend so the
// APK runs with no server. Uses the same seed trees + walker as the real API,
// so flows, validation and pricing behave identically. State resets on restart.
import {
  collectedCustomerId,
  computeTotal,
  DEFAULT_PREFIXES,
  describeSteps,
  FlowStep,
  formatRp,
  kodeUnikBase,
  normalizeIndonesianMobile,
  PackagePublic,
  SEED_PACKAGES,
  SEED_SEGMENTS,
  walkPath,
} from 'pulsa-juan-common';

import type { AgentProfile, TopUpOrder, Transaction } from './types';

export interface MockResponse {
  status: number;
  body: unknown;
}

// deep-copy like a real network response would: react-query must see new objects, not our mutated state
const ok = (body: unknown, status = 200): MockResponse => ({ status, body: JSON.parse(JSON.stringify(body)) });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): MockResponse => ({ status, body: { error, ...extra } });
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
let seq = 100;
const id = (p: string) => `${p}_${++seq}`;

const CS = { whatsapp: '081234567890', telegram: 'pulsajuan_cs' };
const BANKS = [
  { bank: 'BRI' as const, accountNumber: '0341-01-000123-56-7', accountName: 'PT PULSA JUAN' },
  { bank: 'BCA' as const, accountNumber: '4971770079', accountName: 'PT PULSA JUAN' },
];
const BANNERS = [
  { imageUrl: 'https://placehold.co/1200x500/0B7C70/ffffff/png?text=Promo+Pulsa+Juan&font=lato' },
  { imageUrl: 'https://placehold.co/1200x500/1C2430/F59E0B/png?text=Komisi+Mitra+2+Tingkat&font=lato' },
];

const packages: Record<string, PackagePublic> = Object.fromEntries(
  SEED_PACKAGES.map((p) => [
    p.code,
    { id: p.code, code: p.code, name: p.name, category: p.category, provider: (p.provider as PackagePublic['provider']) ?? null, hargaAgen: p.hargaAgen, isActive: true, sortOrder: p.sortOrder },
  ]),
);
const segments = SEED_SEGMENTS.map((s) => ({
  id: s.slug,
  slug: s.slug,
  label: s.label,
  iconUrl: 'builtin:' + s.slug,
  groupLabel: s.groupLabel,
  badge: s.slug === 'mobile-legends' ? 'BARU' : null,
  maintenanceMessage: null,
  tree: s.tree,
}));
const ctx = { prefixes: DEFAULT_PREFIXES, packages };

const agent: AgentProfile = {
  id: 'agent_demo',
  name: 'Agen Demo',
  email: 'demo@pulsajuan.id',
  phone: '081234567001',
  avatarUrl: null,
  status: 'ACTIVE',
  saldo: 487500,
  hutang: 0,
  poin: 120,
  commisionUniqueId: 'JUAN2026',
  saldoKomisi: 18500,
  referralMarkup: 300,
  markupTotal: 0,
  createdAt: iso(90 * 86400000),
};

function seedTrx(n: number, slug: string, label: string, target: string, pkg: string, status: Transaction['status'], msAgo: number): Transaction {
  const p = packages[pkg];
  return {
    id: id('trx'),
    trxNumber: n,
    segmentLabel: label,
    segment: { slug, iconUrl: 'builtin:' + slug },
    steps: [],
    summary: [
      { label: slug === 'token-pln' ? 'Nomor Meter' : 'Nomor HP', value: target },
      { label: 'Paket', value: p.name },
    ],
    phoneNumber: slug === 'token-pln' ? null : target,
    customerId: slug === 'token-pln' ? target : null,
    amountBase: p.hargaAgen,
    adminFee: 0,
    markupTotal: 0,
    total: p.hargaAgen,
    status,
    serialNumber: status === 'SUCCESS' ? (slug === 'token-pln' ? '4821-7730-1192-5546-0038' : 'SN' + (88213000 + n)) : null,
    failReason: status === 'FAILED' ? 'Nomor tidak aktif' : null,
    createdAt: iso(msAgo),
    processedAt: iso(msAgo - 40000),
  };
}
const H = 3600000;
const transactions: Transaction[] = [
  seedTrx(1042, 'pulsa', 'Pulsa', '081298765432', 'TSEL_10K', 'SUCCESS', 1.5 * H),
  seedTrx(1041, 'paket-data', 'Paket Data', '087712345678', 'XL_DATA_5GB', 'SUCCESS', 3 * H),
  seedTrx(1040, 'token-pln', 'Token PLN', '14234567890', 'PLN_50K', 'SUCCESS', 5 * H),
  seedTrx(1039, 'xl', 'XL', '081900112233', 'XL_25K', 'FAILED', 26 * H),
  seedTrx(1038, 'mobile-legends', 'Mobile Legends', '081377788899', 'ML_172', 'SUCCESS', 28 * H),
  seedTrx(1037, 'telkomsel', 'Telkomsel', '085212349876', 'TSEL_50K', 'SUCCESS', 52 * H),
];
let trxNumber = 1042;
const topUps: TopUpOrder[] = [
  { id: id('top'), orderNumber: 311, amount: 500000, kodeUnik: 411, totalTransfer: 500411, bank: 'BCA', status: 'PAID', claimedAt: iso(49 * H), paidAt: iso(48.5 * H), expiresAt: iso(25 * H), createdAt: iso(50 * H), rejectReason: null, isCredit: false },
];
let orderNumber = 311;
const commissions = [
  { id: id('com'), amount: 300, level: 1, status: 'UNCLAIMED' as 'UNCLAIMED' | 'CLAIMED', claimedAt: null as string | null, createdAt: iso(2 * H), sourceAgentName: 'Budi Cell', transaction: { trxNumber: 2207, status: 'SUCCESS', segmentLabel: 'Pulsa', createdAt: iso(2 * H) } },
  { id: id('com'), amount: 300, level: 1, status: 'UNCLAIMED' as 'UNCLAIMED' | 'CLAIMED', claimedAt: null as string | null, createdAt: iso(6 * H), sourceAgentName: 'Budi Cell', transaction: { trxNumber: 2201, status: 'SUCCESS', segmentLabel: 'Paket Data', createdAt: iso(6 * H) } },
  { id: id('com'), amount: 200, level: 2, status: 'UNCLAIMED' as 'UNCLAIMED' | 'CLAIMED', claimedAt: null as string | null, createdAt: iso(7 * H), sourceAgentName: 'Sari Pulsa', transaction: { trxNumber: 2198, status: 'SUCCESS', segmentLabel: 'Token PLN', createdAt: iso(7 * H) } },
];
const unclaimed = () => commissions.filter((c) => c.status === 'UNCLAIMED').reduce((a, c) => a + c.amount, 0);

function withAccount(o: TopUpOrder): TopUpOrder {
  return { ...o, account: BANKS.find((b) => b.bank === o.bank) ?? null };
}
function todayCount() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return transactions.filter((t) => new Date(t.createdAt) >= start && t.status !== 'FAILED').length;
}
function inquiryFor(customerId: string) {
  const digits = customerId.replace(/\D/g, '');
  return { customerId, customerName: 'PELANGGAN ' + (digits.slice(-4) || '0000'), periode: new Date().toISOString().slice(0, 7), amountDue: 50000 + (parseInt(digits.slice(-4) || '1234', 10) % 50) * 1000, adminFee: 2500 };
}

export async function mockApi(path: string, method: string, json: any, query: Record<string, unknown> = {}): Promise<MockResponse> {
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 250)); // feel like a network
  const m = method.toUpperCase();
  const seg = path.split('?')[0].split('/').filter(Boolean); // ['agent', ...]
  const route = seg.slice(1).join('/');

  // ---- auth ----
  if (route === 'auth/login' || route === 'auth/google') return ok({ token: 'mock-token', agent });
  if (route === 'auth/register') {
    if (json?.name) agent.name = String(json.name);
    if (json?.email) agent.email = String(json.email);
    if (json?.phone) agent.phone = normalizeIndonesianMobile(String(json.phone));
    return ok({ token: 'mock-token', agent }, 201);
  }
  if (route === 'me' && m === 'GET') return ok(agent);
  if (route === 'me' && m === 'PUT') {
    if (json?.name) agent.name = json.name;
    if (json?.phone) agent.phone = normalizeIndonesianMobile(json.phone);
    if (typeof json?.referralMarkup === 'number') {
      if (json.referralMarkup > 2000) return fail(400, 'Markup referral maksimal Rp 2000');
      agent.referralMarkup = json.referralMarkup;
    }
    return ok(agent);
  }
  if (route === 'config') return ok({ prefixes: DEFAULT_PREFIXES, bankAccounts: BANKS, cs: CS, topUpMin: 10000, topUpMax: 5000000 });
  if (route === 'home') {
    const list = segments.map(({ tree: _t, ...s }) => s);
    return ok({
      agent, saldo: agent.saldo, hutang: agent.hutang, poin: agent.poin, markupTotal: 0,
      todayTransactions: todayCount(), commissionUnclaimed: unclaimed(),
      banners: BANNERS, groups: [], segments: list, cs: CS,
      config: { topUpMin: 10000, topUpMax: 5000000, appName: 'Pulsa Juan', maxReferralMarkup: 2000 },
    });
  }

  // ---- segments / inquiry ----
  if (seg[1] === 'segments' && seg[3] === 'tree') {
    const s = segments.find((x) => x.id === seg[2]);
    if (!s) return fail(404, 'Layanan tidak ditemukan');
    return ok({ segment: { id: s.id, slug: s.slug, label: s.label, iconUrl: s.iconUrl, maintenanceMessage: null }, treeVersion: 1, treeVersionId: 'v1', tree: s.tree, packages, markupTotal: 0 });
  }
  if (route === 'inquiries') return ok(inquiryFor(String(json?.customerId ?? '')));

  // ---- top ups ----
  if (route === 'topups' && m === 'POST') {
    const amount = Number(json?.amount ?? 0);
    if (amount < 10000) return fail(400, 'Top up minimal Rp 10.000');
    if (amount > 5000000) return fail(400, 'Top up maksimal Rp 5.000.000');
    const n = ++orderNumber;
    const kode = kodeUnikBase(n);
    const o: TopUpOrder = { id: id('top'), orderNumber: n, amount, kodeUnik: kode, totalTransfer: amount + kode, bank: null, status: 'PENDING', claimedAt: null, paidAt: null, expiresAt: new Date(Date.now() + 24 * H).toISOString(), createdAt: iso(), rejectReason: null, isCredit: false };
    topUps.unshift(o);
    return ok(o, 201);
  }
  if (route === 'topups' && m === 'GET') return ok({ topUps });
  if (seg[1] === 'topups' && seg[2]) {
    const o = topUps.find((t) => t.id === seg[2]);
    if (!o) return fail(404, 'Top up tidak ditemukan');
    if (!seg[3]) return ok(withAccount(o));
    if (seg[3] === 'bank') {
      o.bank = json?.bank === 'BCA' ? 'BCA' : 'BRI';
      return ok(withAccount(o));
    }
    if (seg[3] === 'claim') {
      if (!o.bank) return fail(400, 'Pilih bank terlebih dahulu');
      if (o.status === 'PENDING') {
        o.status = 'CLAIMED';
        o.claimedAt = iso();
        // demo: "admin" confirms after a few seconds
        setTimeout(() => {
          if (o.status !== 'CLAIMED') return;
          o.status = 'PAID';
          o.paidAt = iso();
          agent.saldo += o.amount;
        }, 9000);
      }
      const waText = `Permisi kak, saya baru transfer sebesar ${formatRp(o.totalTransfer)} via Bank ${o.bank} untuk top up saldo #${o.orderNumber} a.n. ${agent.name}`;
      return ok({ ...withAccount(o), waText, waUrl: `https://wa.me/6281234567890?text=${encodeURIComponent(waText)}` });
    }
  }

  // ---- transactions ----
  if (route === 'transactions' && m === 'POST') {
    const s = segments.find((x) => x.id === json?.segmentId);
    if (!s) return fail(404, 'Layanan tidak ditemukan');
    const steps = (json?.steps ?? []) as FlowStep[];
    const walk = walkPath(s.tree, steps, ctx);
    if (!walk.ok) return fail(400, walk.error.message, { code: walk.error.code, nodeId: walk.error.nodeId });
    const inqStep = steps.find((x) => x.type === 'BillInquiry');
    const inquiry = inqStep && inqStep.type === 'BillInquiry' ? inquiryFor(inqStep.customerId) : null;
    const price = computeTotal(steps, s.tree, ctx, 0, inquiry);
    if (price.total !== json?.clientTotal) return fail(409, 'Harga berubah, silakan periksa kembali', { code: 'PRICE_CHANGED', total: price.total });
    if (agent.saldo < price.total) return fail(400, 'Saldo tidak cukup', { code: 'SALDO_KURANG' });
    agent.saldo -= price.total;
    const phoneStep = [...steps].reverse().find((x) => x.type === 'PhoneNumberInput');
    const trx: Transaction = {
      id: id('trx'), trxNumber: ++trxNumber, segmentLabel: s.label, segment: { slug: s.slug, iconUrl: s.iconUrl },
      steps, summary: describeSteps(steps, s.tree, ctx, inquiry),
      phoneNumber: phoneStep && phoneStep.type === 'PhoneNumberInput' ? normalizeIndonesianMobile(phoneStep.phoneNumber) : null,
      customerId: collectedCustomerId(steps),
      amountBase: price.amountBase, adminFee: price.adminFee, markupTotal: 0, total: price.total,
      status: 'PENDING', serialNumber: null, failReason: null, createdAt: iso(), processedAt: null,
    };
    transactions.unshift(trx);
    // demo: fulfilment succeeds after a few seconds
    setTimeout(() => {
      trx.status = 'SUCCESS';
      trx.serialNumber = s.slug.includes('pln') ? '5530-1187-9042-6671-2209' : 'SN' + (88213000 + trx.trxNumber);
      trx.processedAt = iso();
      agent.poin += 5;
    }, 6000);
    return ok({ transaction: trx, reused: false }, 201);
  }
  if (route === 'transactions' && m === 'GET') {
    let rows = [...transactions];
    const q = query as Record<string, string | number | undefined>;
    if (q.phone) rows = rows.filter((t) => (t.phoneNumber ?? t.customerId ?? '').includes(String(q.phone)));
    if (q.minAmount) rows = rows.filter((t) => t.total >= Number(q.minAmount));
    if (q.maxAmount) rows = rows.filter((t) => t.total <= Number(q.maxAmount));
    if (q.from) rows = rows.filter((t) => t.createdAt >= new Date(String(q.from)).toISOString());
    if (q.to) rows = rows.filter((t) => new Date(t.createdAt).getTime() < new Date(String(q.to)).getTime() + 86400000);
    const dir = q.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => (q.sort === 'total' ? (a.total - b.total) * dir : (a.createdAt < b.createdAt ? -1 : 1) * dir));
    const page = Number(q.page ?? 1);
    const pageSize = Number(q.pageSize ?? 25);
    return ok({ total: rows.length, page, pageSize, transactions: rows.slice((page - 1) * pageSize, page * pageSize) });
  }
  if (seg[1] === 'transactions' && seg[2]) {
    const t = transactions.find((x) => x.id === seg[2]);
    return t ? ok(t) : fail(404, 'Transaksi tidak ditemukan');
  }
  if (route === 'rekap') {
    const q = query as Record<string, string | undefined>;
    const from = q.from ? new Date(q.from).getTime() : 0;
    const to = q.to ? new Date(q.to).getTime() + 86400000 : Infinity;
    const rows = transactions.filter((t) => t.status !== 'FAILED' && new Date(t.createdAt).getTime() >= from - 7 * H && new Date(t.createdAt).getTime() < to);
    const byDay: Record<string, { date: string; totalSpent: number; count: number }> = {};
    const bySegment: Record<string, { segmentLabel: string; totalSpent: number; count: number }> = {};
    for (const t of rows) {
      const d = new Date(new Date(t.createdAt).getTime() + 7 * H).toISOString().slice(0, 10);
      (byDay[d] ??= { date: d, totalSpent: 0, count: 0 }).totalSpent += t.total;
      byDay[d].count++;
      (bySegment[t.segmentLabel] ??= { segmentLabel: t.segmentLabel, totalSpent: 0, count: 0 }).totalSpent += t.total;
      bySegment[t.segmentLabel].count++;
    }
    return ok({ totalSpent: rows.reduce((a, t) => a + t.total, 0), count: rows.length, byDay: Object.values(byDay).sort((a, b) => (a.date < b.date ? 1 : -1)), bySegment: Object.values(bySegment).sort((a, b) => b.totalSpent - a.totalSpent) });
  }

  // ---- commissions / mitra ----
  if (route === 'commissions') return ok({ unclaimedTotal: unclaimed(), pendingTotal: 0, saldoKomisi: agent.saldoKomisi, entries: commissions });
  if (route === 'commissions/claim') {
    const total = unclaimed();
    if (total <= 0) return fail(400, 'Tidak ada komisi yang bisa diklaim');
    const count = commissions.filter((c) => c.status === 'UNCLAIMED').length;
    commissions.forEach((c) => { if (c.status === 'UNCLAIMED') { c.status = 'CLAIMED'; c.claimedAt = iso(); } });
    agent.saldo += total;
    agent.saldoKomisi += total;
    return ok({ claimed: total, count, saldo: agent.saldo, saldoKomisi: agent.saldoKomisi });
  }
  if (route === 'mitra') {
    return ok({
      commisionUniqueId: agent.commisionUniqueId, referralMarkup: agent.referralMarkup, parent: null,
      children: [
        { id: 'm1', name: 'Budi Cell', commisionUniqueId: 'BUDI8K2P', commisionAmount: 300, joinedAt: iso(30 * 86400000) },
        { id: 'm2', name: 'Warung Bu Tini', commisionUniqueId: 'TINI4M7Q', commisionAmount: 300, joinedAt: iso(12 * 86400000) },
      ],
    });
  }
  return fail(404, 'Endpoint demo belum tersedia: ' + route);
}
