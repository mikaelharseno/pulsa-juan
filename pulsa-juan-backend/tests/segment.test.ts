import { SegmentTree } from 'pulsa-juan-common';

import { adminToken, app, auth, prisma, registerAgent, request, resetDb } from './helpers';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('segment admin', () => {
  it('draft validation, publish bumps version, duplicate remaps ids, roles enforced', async () => {
    const admin = await adminToken();
    const list = await request(app).get('/api/admin/segments').set(auth(admin));
    expect(list.body.segments).toHaveLength(8);
    const xl = list.body.segments.find((s: { slug: string }) => s.slug === 'xl');
    expect(xl.publishedVersion.version).toBe(1);

    const detail = await request(app).get(`/api/admin/segments/${xl.id}`).set(auth(admin));
    const tree = detail.body.draftTree as SegmentTree;
    expect(Object.keys(detail.body.packages).length).toBeGreaterThan(0);

    const broken = JSON.parse(JSON.stringify(tree));
    broken.nodes.phone.defaultChildId = 'ghost';
    const bad = await request(app).put(`/api/admin/segments/${xl.id}/draft`).set(auth(admin)).send({ tree: broken });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('TREE_INVALID');
    expect(bad.body.errors[0].nodeId).toBe('phone');

    const edited = JSON.parse(JSON.stringify(tree));
    edited.nodes.phone.title = 'Pulsa XL Baru';
    const saved = await request(app).put(`/api/admin/segments/${xl.id}/draft`).set(auth(admin)).send({ tree: edited });
    expect(saved.status).toBe(200);

    const staff = await adminToken('STAFF');
    expect((await request(app).post(`/api/admin/segments/${xl.id}/publish`).set(auth(staff))).status).toBe(403);
    const published = await request(app).post(`/api/admin/segments/${xl.id}/publish`).set(auth(admin));
    expect(published.status).toBe(200);
    expect(published.body.publishedVersion.version).toBe(2);

    const { token } = await registerAgent('Viewer');
    const agentTree = await request(app).get(`/api/agent/segments/${xl.id}/tree`).set(auth(token));
    expect(agentTree.body.treeVersion).toBe(2);
    expect(agentTree.body.tree.nodes.phone.title).toBe('Pulsa XL Baru');
    expect(Object.values(agentTree.body.packages).every((p: any) => p.hargaBeli === undefined)).toBe(true);

    const versions = await request(app).get(`/api/admin/segments/${xl.id}/versions`).set(auth(admin));
    expect(versions.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);

    const dup = await request(app).post(`/api/admin/segments/${xl.id}/duplicate`).set(auth(admin)).send({ newSlug: 'xl-2', newLabel: 'XL 2' });
    expect(dup.status).toBe(201);
    expect(dup.body.isActive).toBe(false);
    const dupTree = dup.body.draftTree as SegmentTree;
    expect(Object.keys(dupTree.nodes).every((id) => id.startsWith('n_'))).toBe(true);
    expect(dupTree.nodes[dupTree.rootId].type).toBe('PhoneNumberInput');
    const validate = await request(app).post(`/api/admin/segments/${dup.body.id}/validate`).set(auth(admin)).send({ tree: dupTree, strict: true });
    expect(validate.body.ok).toBe(true);

    const reorder = await request(app).put('/api/admin/segments/reorder').set(auth(admin)).send({ ids: [dup.body.id, xl.id] });
    expect(reorder.body.segments[0].id).toBe(dup.body.id);

    expect((await request(app).delete(`/api/admin/segments/${dup.body.id}`).set(auth(admin))).status).toBe(204);
  });

  it('packages: csv import upserts and invalid rows are reported', async () => {
    const admin = await adminToken();
    const res = await request(app).post('/api/admin/packages/import').set(auth(admin)).send({
      csv: 'code,name,category,provider,hargaAgen,hargaBeli,sortOrder\nXL_10K,XL 10.000 (edit),PULSA_XL,XL,11700,11000,1\nBAD ROW,,,,x',
    });
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    const pkg = await prisma.package.findUnique({ where: { code: 'XL_10K' } });
    expect(pkg?.hargaAgen).toBe(11700);
    const cats = await request(app).get('/api/admin/packages/categories').set(auth(admin));
    expect(cats.body.categories.some((c: { category: string }) => c.category === 'GAME_ML')).toBe(true);
  });

  it('config + prefixes + uploads', async () => {
    const admin = await adminToken();
    const cfg = await request(app).put('/api/admin/config').set(auth(admin)).send({ csWhatsapp: '0811222333', banners: [{ imageUrl: 'https://x/y.png' }] });
    expect(cfg.status).toBe(200);
    const pub = await request(app).get('/api/agent/config');
    expect(pub.body.cs.whatsapp).toBe('0811222333');
    expect(pub.body.banners).toHaveLength(1);
    expect(pub.body.prefixes.length).toBeGreaterThan(30);
    const pre = await request(app).post('/api/admin/provider-prefixes').set(auth(admin)).send({ prefix: '0800', provider: 'TRI' });
    expect(pre.status).toBe(201);
    const up = await request(app).post('/api/admin/uploads').set(auth(admin)).field('folder', 'icons').attach('file', Buffer.from('89504e47', 'hex'), 'icon.png');
    expect(up.status).toBe(201);
    expect(up.body.url).toMatch(/\/uploads\/icons\//);
  });
});
