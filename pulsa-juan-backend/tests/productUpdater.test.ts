import { FlowStep, PackagePublic, planOtomaxImport, readOtomaxExport } from 'pulsa-juan-common';

import { agentPriceFor, categoryKey, categoryLabel } from '../src/service/productUpdater.service';
import { adminToken, app, auth, giveSaldo, prisma, registerAgent, request, resetDb } from './helpers';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

// rows lifted from the real "Harga m3 & 3id.xlsx" (INDOSAT + 3ID sheets)
const INDOSAT = [
  { provider: 'INDOSAT', sku: 'DY3', name: '7GB l 7GB l 7GB - 1hr', category: 'HARIAN', description: 'Kuota Utama 7GB berlaku Nasional', cost: 8000 },
  { provider: 'INDOSAT', sku: 'FIGH10', name: 'Freedom 5G 10GB/1Hari', category: '5G', description: 'Kuota Utama 6GB + Kuota 5G 4GB', cost: 10000 },
  { provider: 'INDOSAT', sku: 'DY52', name: '9GB l 9GB l 9GB - 2hr', category: 'HARIAN', description: 'Kuota Utama 9GB', cost: 11000 },
  { provider: 'INDOSAT', sku: '12K', name: 'Unlimited Onnet + 30 min Offnet,7hr', category: 'TELP', description: 'Unlimited Onnet', cost: 12500 },
  { provider: 'INDOSAT', sku: 'IMA30', name: 'Tambah Masa Aktif 30 Hari', category: 'MASA AKTIF', description: 'Tambahan Masa Aktif 30 Hari', cost: 14400 },
];
const TRI = [
  { provider: 'TRI', sku: 'TDH1', name: 'Happy 10GB 1 Hari', category: 'HARIAN', description: 'Kuota Nasional: 10GB', cost: 8000 },
  { provider: 'TRI', sku: 'TDS90', name: 'Happy Spesial 90GB (3GB/hr)', category: 'SPESIAL', description: 'Total Kuota: 90GB', cost: 116278 },
];
const RULE = { fixed: 500, percent: 0, roundTo: 100 };
const body = (rows: unknown[], rule = RULE) => ({ fileName: 'Harga m3 & 3id.xlsx', rule, rows });

describe('pricing helpers', () => {
  it('cost + margin, rounded up', () => {
    expect(agentPriceFor(8000, RULE)).toBe(8500);
    expect(agentPriceFor(116278, RULE)).toBe(116800);
    expect(agentPriceFor(10000, { fixed: 0, percent: 2.5, roundTo: 500 })).toBe(10500);
    expect(categoryKey('INDOSAT', 'MASA AKTIF')).toBe('INDOSAT_MASA_AKTIF');
    expect(categoryLabel('MASA AKTIF')).toBe('Masa Aktif');
    expect(categoryLabel('HIFI')).toBe('HiFi Air');
    expect(categoryLabel('Tapcash BNI')).toBe('Tapcash BNI');
    expect(categoryLabel('Grab / OVO')).toBe('Grab / OVO');
  });
});

describe('product updater', () => {
  it('preview writes nothing; apply creates priced packages and publishes the tiles', async () => {
    const admin = await adminToken();
    const before = await prisma.package.count();
    const preview = await request(app).post('/api/admin/product-updater/preview').set(auth(admin)).send(body([...INDOSAT, ...TRI]));
    expect(preview.status).toBe(200);
    expect(preview.body.summary.NEW).toBe(7);
    expect(await prisma.package.count()).toBe(before);
    expect(preview.body.rows.find((r: { sku: string }) => r.sku === 'TDS90').agentPrice).toBe(116800);

    const applied = await request(app).post('/api/admin/product-updater/apply').set(auth(admin)).send(body([...INDOSAT, ...TRI]));
    expect(applied.status).toBe(200);
    expect(applied.body.segments.map((s: { slug: string; published: boolean }) => [s.slug, s.published])).toEqual([
      ['paket-indosat', true],
      ['paket-tri', true],
    ]);
    const dy3 = await prisma.package.findUniqueOrThrow({ where: { code: 'DY3' } });
    expect(dy3).toMatchObject({ supplierSku: 'DY3', supplierName: 'OtomaX', category: 'INDOSAT_HARIAN', provider: 'INDOSAT', hargaBeli: 8000, hargaAgen: 8500, isActive: true });
    const config = await prisma.storeConfig.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(config.productMarginFixed).toBe(500);

    const info = await request(app).get('/api/admin/product-updater').set(auth(admin));
    expect(info.body.rule).toEqual(RULE);
    expect(info.body.history[0].summary.counts.NEW).toBe(7);

    // same sheet again: nothing changes, no new tree version
    const again = await request(app).post('/api/admin/product-updater/apply').set(auth(admin)).send(body([...INDOSAT, ...TRI]));
    expect(again.body.summary.UNCHANGED).toBe(7);
    expect(again.body.segments.every((s: { published: boolean }) => !s.published)).toBe(true);
  });

  it('the app shows Paket Indosat: number → category → package, and the order goes through', async () => {
    const { token, agent } = await registerAgent('Indo');
    await giveSaldo(agent.id, 50000);
    const home = await request(app).get('/api/agent/home').set(auth(token));
    expect(home.body.segments.map((s: { slug: string }) => s.slug)).toEqual(expect.arrayContaining(['paket-indosat', 'paket-tri']));

    const tree = await request(app).get('/api/agent/segments/paket-indosat/tree').set(auth(token));
    expect(tree.status).toBe(200);
    const cat = tree.body.tree.nodes.cat;
    expect(cat.rows.map((r: { label: string }) => r.label)).toEqual(['Harian', '5G', 'Telepon', 'Masa Aktif']);
    expect(cat.rows[0].sublabel).toBe('2 paket · mulai Rp 8.500');
    const dy3 = (Object.values(tree.body.packages) as PackagePublic[]).find((p) => p.code === 'DY3')!;
    expect(dy3.hargaAgen).toBe(8500);

    const steps: FlowStep[] = [
      { nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '085612345678' },
      { nodeId: 'cat', type: 'ListNode', rowId: cat.rows[0].id },
      { nodeId: cat.rows[0].childId, type: 'PackagesList', packageId: dy3.id },
    ];
    const trx = await request(app)
      .post('/api/agent/transactions')
      .set(auth(token))
      .send({ segmentId: tree.body.segment.id, treeVersion: tree.body.treeVersion, steps, clientTotal: 8500, idempotencyKey: 'upd-' + Date.now() });
    expect(trx.status).toBe(201);
    // OtomaX not configured in tests → manual
    expect(trx.body.transaction).toMatchObject({ status: 'PENDING', provider: 'manual', total: 8500 });

    // wrong operator is rejected by the phone step
    const bad = await request(app)
      .post('/api/agent/transactions')
      .set(auth(token))
      .send({ segmentId: tree.body.segment.id, treeVersion: tree.body.treeVersion, steps: [{ ...steps[0], phoneNumber: '081212345678' }, steps[1], steps[2]], clientTotal: 8500, idempotencyKey: 'upd2-' + Date.now() });
    expect(bad.status).toBe(400);
  });

  it('re-prices from a new sheet, keeps locked prices, deactivates and reactivates', async () => {
    const admin = await adminToken();
    // admin hand-sets 12K's price on the Paket page → locked
    const p12 = await prisma.package.findUniqueOrThrow({ where: { code: '12K' } });
    const put = await request(app).put(`/api/admin/packages/${p12.id}`).set(auth(admin)).send({ hargaAgen: 14000 });
    expect(put.body.priceLocked).toBe(true);

    const cheaper = INDOSAT.map((r) => (r.sku === 'DY3' ? { ...r, cost: 7600 } : r.sku === '12K' ? { ...r, cost: 13000 } : r)).filter((r) => r.sku !== 'IMA30');
    const preview = await request(app).post('/api/admin/product-updater/preview').set(auth(admin)).send(body(cheaper));
    const byCode = Object.fromEntries(preview.body.rows.map((r: { sku: string }) => [r.sku, r]));
    expect(byCode.DY3).toMatchObject({ status: 'PRICE_CHANGED', oldCost: 8000, cost: 7600, agentPrice: 8100 });
    expect(byCode['12K']).toMatchObject({ status: 'PRICE_CHANGED', agentPrice: 14000, priceLocked: true });
    expect(byCode.IMA30.status).toBe('DEACTIVATED');
    // only the uploaded operator: Tri packages are not touched
    expect(byCode.TDH1).toBeUndefined();

    await request(app).post('/api/admin/product-updater/apply').set(auth(admin)).send(body(cheaper));
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'IMA30' } })).isActive).toBe(false);
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'DY3' } })).hargaAgen).toBe(8100);
    expect((await prisma.package.findUniqueOrThrow({ where: { code: '12K' } })).hargaAgen).toBe(14000);
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'TDH1' } })).isActive).toBe(true);
    const indosat = await prisma.segment.findUniqueOrThrow({ where: { slug: 'paket-indosat' }, include: { publishedVersion: true } });
    const rows = (indosat.publishedVersion!.tree as { nodes: { cat: { rows: { label: string }[] } } }).nodes.cat.rows;
    expect(rows.map((r) => r.label)).toEqual(['Harian', '5G', 'Telepon']);

    const back = await request(app).post('/api/admin/product-updater/apply').set(auth(admin)).send(body(INDOSAT));
    expect(back.body.rows.find((r: { sku: string }) => r.sku === 'IMA30').status).toBe('REACTIVATED');
  });

  it('never touches non-OtomaX packages and flags bad rows', async () => {
    const admin = await adminToken();
    const seedPkg = await prisma.package.findFirstOrThrow({ where: { supplierName: null } });
    const res = await request(app)
      .post('/api/admin/product-updater/preview')
      .set(auth(admin))
      .send(body([
        { provider: 'INDOSAT', sku: seedPkg.code, name: 'clash', category: 'HARIAN', cost: 1000 },
        { provider: 'INDOSAT', sku: 'ZZ1', name: 'no price', category: 'HARIAN', cost: 0 },
        { provider: 'INDOSAT', sku: 'ZZ2', name: 'dup', category: 'HARIAN', cost: 1000 },
        { provider: 'INDOSAT', sku: 'ZZ2', name: 'dup', category: 'HARIAN', cost: 1000 },
        { provider: 'INDOSAT', sku: 'bad code!', name: 'x', category: 'HARIAN', cost: 1000 },
      ]));
    const errors = res.body.rows.filter((r: { status: string }) => r.status === 'ERROR').map((r: { error: string }) => r.error);
    expect(errors).toHaveLength(4);
    expect(errors[0]).toMatch(/sudah dipakai/);
    const staff = await adminToken('STAFF');
    expect((await request(app).post('/api/admin/product-updater/preview').set(auth(staff)).send(body(INDOSAT))).status).toBe(403);
  });
});

describe('market reference mode', () => {
  const XL = [
    { provider: 'XL', sku: 'X10', name: 'Xl 10.000', category: 'Pulsa', cost: 10944 },
    { provider: 'XL', sku: 'XDH3', name: '3GB Full 24 Jam 30 Hari', category: 'XL Data All jaringan 24 Jam 30 Hari', cost: 24450 },
  ];
  const market = (rows: unknown[]) => ({ ...body(rows), codeType: 'MARKET' });

  it('imports as manual PSR-<code> packages and builds the Paket XL tile', async () => {
    const admin = await adminToken();
    const res = await request(app).post('/api/admin/product-updater/apply').set(auth(admin)).send(market(XL));
    expect(res.status).toBe(200);
    expect(res.body.summary.NEW).toBe(2);
    const x10 = await prisma.package.findUniqueOrThrow({ where: { code: 'PSR-X10' } });
    expect(x10).toMatchObject({ supplierName: 'Pasar', supplierSku: null, provider: 'XL', category: 'XL_PULSA', hargaBeli: 10944, hargaAgen: 11500 });
    expect(res.body.segments[0]).toMatchObject({ slug: 'paket-xl', published: true });
    // long competitor group names still give valid ids (≤ 40 chars)
    const xl = await prisma.segment.findUniqueOrThrow({ where: { slug: 'paket-xl' }, include: { publishedVersion: true } });
    const ids = Object.keys((xl.publishedVersion!.tree as { nodes: object }).nodes);
    expect(ids.every((id) => id.length <= 40)).toBe(true);
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'PSR-XDH3' } })).category.length).toBeLessThanOrEqual(60);
    const history = await request(app).get('/api/admin/product-updater').set(auth(admin));
    expect(history.body.history[0].summary.codeType).toBe('MARKET');
  });

  it('modes never deactivate each other; same code can exist in both', async () => {
    const admin = await adminToken();
    // market sheet that happens to contain an OtomaX code for Indosat
    const res = await request(app)
      .post('/api/admin/product-updater/apply')
      .set(auth(admin))
      .send(market([{ provider: 'INDOSAT', sku: 'DY3', name: 'pasar DY3', category: 'HARIAN', cost: 7900 }]));
    expect(res.body.summary.NEW).toBe(1);
    expect(res.body.summary.DEACTIVATED).toBe(0);
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'DY3' } })).isActive).toBe(true);
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'PSR-DY3' } })).supplierName).toBe('Pasar');
    // an OtomaX re-upload of Indosat leaves the market Indosat product alone
    const otx = await request(app).post('/api/admin/product-updater/apply').set(auth(admin)).send(body(INDOSAT));
    expect(otx.body.rows.some((r: { sku: string }) => r.sku === 'PSR-DY3')).toBe(false);
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'PSR-DY3' } })).isActive).toBe(true);
  });

  it('keeps an OtomaX code assigned later, and deactivates only market products', async () => {
    const admin = await adminToken();
    const x10 = await prisma.package.findUniqueOrThrow({ where: { code: 'PSR-X10' } });
    await request(app).put(`/api/admin/packages/${x10.id}`).set(auth(admin)).send({ supplierSku: 'XL10OTX' });
    const res = await request(app).post('/api/admin/product-updater/apply').set(auth(admin)).send(market([XL[0]]));
    expect(res.body.summary.DEACTIVATED).toBe(1);
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'PSR-X10' } })).supplierSku).toBe('XL10OTX');
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'PSR-XDH3' } })).isActive).toBe(false);
  });

  it('imports an OtomaX product export and can retire the market products it replaces', async () => {
    const admin = await adminToken();
    const exported = readOtomaxExport([
      ['Aktif', 'Kode', 'Nama', 'Provider', 'Nominal', 'Hrg Beli', 'Hrg Jual', 'Kosong', 'Gangguan'],
      ['1', 'XR5', 'XL REGULER 5K', 'X', '5', '5850.0000', '6000.0000', '0', '0'],
      ['1', 'XR10', 'XL REGULER 10K', 'X', '10', '10800.0000', '11000.0000', '0', '0'],
      ['1', 'GRB10', 'SALDO GRAB / OVO 10K', 'GRAB', '10', '10000.0000', '10900.0000', '0', '0'],
    ]);
    const { rows } = planOtomaxImport(exported, { GRAB: false });
    expect(rows.map((r) => r.sku)).toEqual(['XR5', 'XR10']);

    const keep = await request(app).post('/api/admin/product-updater/preview').set(auth(admin)).send({ ...body(rows), fileName: 'Produk.tsv' });
    expect(keep.body.summary).toMatchObject({ NEW: 2, DEACTIVATED: 0 });
    expect(keep.body.tiles[0]).toMatchObject({ slug: 'paket-xl', products: 3, marketProducts: 1 });

    const res = await request(app)
      .post('/api/admin/product-updater/apply')
      .set(auth(admin))
      .send({ ...body(rows), fileName: 'Produk.tsv', retireMarketFor: ['XL'] });
    expect(res.body.summary).toMatchObject({ NEW: 2, DEACTIVATED: 1 });
    // cost = Hrg Beli (the app's reseller account pays Hrg Beli in OtomaX)
    expect(await prisma.package.findUniqueOrThrow({ where: { code: 'XR5' } })).toMatchObject({ supplierSku: 'XR5', hargaBeli: 5850, hargaAgen: 6400, category: 'XL_PULSA' });
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'PSR-X10' } })).isActive).toBe(false);
    // market products of other operators stay
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'PSR-DY3' } })).isActive).toBe(true);
  });
});

describe('non-operator OtomaX groups', () => {
  const exported = () =>
    readOtomaxExport([
      ['Aktif', 'Kode', 'Nama', 'Provider', 'Nominal', 'Hrg Beli', 'Hrg Jual', 'Kosong', 'Gangguan'],
      ['1', 'PLN20', 'PLN', 'PLN', '20', '20644.0000', '21600.0000', '0', '0'],
      ['1', 'PLN50', 'PLN', 'PLN', '50', '50644.0000', '51600.0000', '0', '0'],
      ['1', 'DANA10', 'SALDO DANA 10K', 'D', '10', '10350.0000', '10400.0000', '0', '0'],
      ['1', 'VML15', 'ML 15 Diamod', 'VML', '15', '4675.0000', '4700.0000', '0', '0'],
      ['1', 'VMLS1', 'Starlight 30hr + 127 Diamond', 'VML', '1', '196550.0000', '197000.0000', '0', '0'],
    ]);

  it('get their own tiles with the input OtomaX needs as destination', async () => {
    const admin = await adminToken();
    const { rows } = planOtomaxImport(exported());
    const res = await request(app).post('/api/admin/product-updater/apply').set(auth(admin)).send({ ...body(rows), fileName: 'Produk.tsv' });
    expect(res.status).toBe(200);
    expect(res.body.summary.NEW).toBe(5);
    expect(res.body.segments.map((s: { slug: string; published: boolean }) => [s.slug, s.published])).toEqual([
      ['dana', true],
      ['mobile-legends', true],
      ['token-pln', true],
    ]);
    expect(await prisma.package.findUniqueOrThrow({ where: { code: 'PLN20' } })).toMatchObject({
      provider: null, supplierSku: 'PLN20', supplierName: 'OtomaX', category: 'PLN_TOKEN_PLN', name: 'PLN 20K', hargaAgen: 21200,
    });

    const { token } = await registerAgent('Tiles');
    // one category: meter number → packages
    const pln = await request(app).get('/api/agent/segments/token-pln/tree').set(auth(token));
    const plnRoot = pln.body.tree.nodes[pln.body.tree.rootId];
    expect(plnRoot).toMatchObject({ type: 'CustomerIdInput', fields: [expect.objectContaining({ regex: '^[0-9]{11,12}$' })] });
    expect(pln.body.tree.nodes[plnRoot.nextId]).toMatchObject({ type: 'PackagesList', source: { kind: 'CATEGORY', category: 'PLN_TOKEN_PLN' } });
    // e-wallets: any phone number
    const dana = await request(app).get('/api/agent/segments/dana/tree').set(auth(token));
    expect(dana.body.tree.nodes.phone).toMatchObject({ type: 'PhoneNumberInput', allowedProviders: null });
    // a new tile is created on the fly
    expect(await prisma.segment.findUniqueOrThrow({ where: { slug: 'dana' } })).toMatchObject({ label: 'DANA', iconUrl: 'builtin:dana', groupLabel: 'E-Wallet', isActive: true });

    // re-import without Starlight: only that ML package goes, other tiles untouched
    const fewer = planOtomaxImport(exported().filter((r) => r.code !== 'VMLS1')).rows;
    const again = await request(app).post('/api/admin/product-updater/apply').set(auth(admin)).send({ ...body(fewer), fileName: 'Produk.tsv' });
    expect(again.body.summary).toMatchObject({ DEACTIVATED: 1, UNCHANGED: 4 });
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'VMLS1' } })).isActive).toBe(false);
    // seed demo packages (no OtomaX code) are never touched
    expect((await prisma.package.findUniqueOrThrow({ where: { code: 'ML_86' } })).isActive).toBe(true);
  });

  it('a game order sends user id + zone id as the destination', async () => {
    const { token, agent } = await registerAgent('Gamer');
    await giveSaldo(agent.id, 50000);
    const tree = await request(app).get('/api/agent/segments/mobile-legends/tree').set(auth(token));
    const nodes = tree.body.tree.nodes;
    expect(nodes.idinput.fields.map((f: { key: string }) => f.key)).toEqual(['customerId', 'secondaryId']);
    // Starlight was removed above: one category left, so the id input leads straight to the packages
    expect(nodes[nodes.idinput.nextId]).toMatchObject({ type: 'PackagesList', title: 'Mobile Legends' });
    const vml15 = (Object.values(tree.body.packages) as PackagePublic[]).find((p) => p.code === 'VML15')!;
    const steps: FlowStep[] = [
      { nodeId: 'idinput', type: 'CustomerIdInput', values: { customerId: '12345678', secondaryId: '1234' } },
      { nodeId: nodes.idinput.nextId, type: 'PackagesList', packageId: vml15.id },
    ];
    const trx = await request(app)
      .post('/api/agent/transactions')
      .set(auth(token))
      .send({ segmentId: tree.body.segment.id, treeVersion: tree.body.treeVersion, steps, clientTotal: vml15.hargaAgen, idempotencyKey: 'ml-' + Date.now() });
    expect(trx.status).toBe(201);
    expect(trx.body.transaction).toMatchObject({ customerId: '123456781234', total: 5200 });
  });
});

describe('large market catalogs', () => {
  it('pages more than 50 categories, clips long labels, previews the tile', async () => {
    const admin = await adminToken();
    const rows = Array.from({ length: 60 }, (_, i) => ({
      provider: 'SMARTFREN',
      sku: `SFX${i}`,
      name: `Paket ${i}`,
      category: `Voucher Data Smartfren Sangat Panjang Sekali Nama Kategorinya Untuk Wilayah Nomor ${i} Khusus`,
      cost: 10000 + i,
    }));
    const preview = await request(app).post('/api/admin/product-updater/preview').set(auth(admin)).send({ ...body(rows), codeType: 'MARKET' });
    expect(preview.body.tiles).toEqual([expect.objectContaining({ slug: 'paket-smartfren', categories: 60, products: 60, errors: [] })]);
    const res = await request(app).post('/api/admin/product-updater/apply').set(auth(admin)).send({ ...body(rows), codeType: 'MARKET' });
    expect(res.status).toBe(200);
    const seg = await prisma.segment.findUniqueOrThrow({ where: { slug: 'paket-smartfren' }, include: { publishedVersion: true } });
    const nodes = (seg.publishedVersion!.tree as { nodes: Record<string, { rows?: { label: string; childId: string }[] }> }).nodes;
    expect(nodes.cat.rows).toHaveLength(50);
    expect(nodes.cat.rows![49]).toMatchObject({ label: 'Kategori lainnya…', childId: 'cat_2' });
    expect(nodes.cat_2.rows).toHaveLength(11);
    expect(nodes.cat.rows!.every((r) => r.label.length <= 80)).toBe(true);
  });
});
