import { DEFAULT_PREFIXES } from '../src/phone';
import { SEED_PACKAGES, SEED_SEGMENTS } from '../src/seedTrees';
import { hasBlockingErrors, validateTreeStructure } from '../src/tree/schema';
import { FlowStep, PackagePublic, SegmentTree, WalkContext } from '../src/tree/types';
import { computeTotal, describeSteps, walkPath } from '../src/tree/walk';

const packages: Record<string, PackagePublic> = Object.fromEntries(
  SEED_PACKAGES.map((p, i) => [
    'pkg' + i,
    { id: 'pkg' + i, code: p.code, name: p.name, category: p.category, provider: (p.provider as any) ?? null, hargaAgen: p.hargaAgen, isActive: true, sortOrder: p.sortOrder },
  ]),
);
const ctx: WalkContext = { prefixes: DEFAULT_PREFIXES, packages };
const seg = (slug: string) => SEED_SEGMENTS.find((s) => s.slug === slug)!.tree;
const pkgByCode = (code: string) => Object.values(packages).find((p) => p.code === code)!;

describe('seed trees validate', () => {
  for (const s of SEED_SEGMENTS) {
    it(s.slug + ' has no blocking errors', () => {
      const errors = validateTreeStructure(s.tree, { strict: true, packages });
      expect(errors.filter((e) => e.severity === 'error')).toEqual([]);
    });
  }
});

describe('validator catches bad trees', () => {
  const base: SegmentTree = seg('xl');
  it('dangling reference', () => {
    const t = JSON.parse(JSON.stringify(base));
    t.nodes.phone.defaultChildId = 'nope';
    const errs = validateTreeStructure(t);
    expect(errs.some((e) => e.message.includes('tidak ada'))).toBe(true);
  });
  it('path without price', () => {
    const t = JSON.parse(JSON.stringify(base));
    t.nodes.phone.defaultChildId = null;
    const errs = validateTreeStructure(t);
    expect(errs.some((e) => e.message.includes('berakhir tanpa harga'))).toBe(true);
  });
  it('cycle', () => {
    const t = JSON.parse(JSON.stringify(seg('gopay')));
    t.nodes.amount_c.nextId = 'jenis';
    const errs = validateTreeStructure(t);
    expect(errs.some((e) => e.message.includes('siklus'))).toBe(true);
  });
  it('second price on same path', () => {
    const t = JSON.parse(JSON.stringify(base));
    t.nodes.pk.nextId = 'pk2';
    t.nodes.pk2 = { ...t.nodes.pk, id: 'pk2', nextId: null };
    const errs = validateTreeStructure(t);
    expect(errs.some((e) => e.message.includes('harga kedua'))).toBe(true);
  });
  it('missing provider branch without default', () => {
    const t = JSON.parse(JSON.stringify(seg('paket-data')));
    delete t.nodes.phone.branches.XL;
    const errs = validateTreeStructure(t);
    expect(errs.some((e) => e.message.includes('Operator XL belum punya cabang'))).toBe(true);
  });
  it('BillInquiry without prior id input', () => {
    const t = JSON.parse(JSON.stringify(seg('pln-pascabayar')));
    t.rootId = 'inquiry';
    const errs = validateTreeStructure(t);
    expect(errs.some((e) => e.message.includes('membutuhkan input ID'))).toBe(true);
  });
  it('unreachable node is warning on draft, error on publish', () => {
    const t = JSON.parse(JSON.stringify(base));
    t.nodes.orphan = { ...t.nodes.pk, id: 'orphan' };
    expect(validateTreeStructure(t).find((e) => e.nodeId === 'orphan')?.severity).toBe('warning');
    expect(validateTreeStructure(t, { strict: true }).find((e) => e.nodeId === 'orphan')?.severity).toBe('error');
    expect(hasBlockingErrors(validateTreeStructure(t))).toBe(false);
  });
  it('zod errors map to nodeId', () => {
    const t = JSON.parse(JSON.stringify(seg('gopay')));
    t.nodes.amount_c.min = 5000000;
    const errs = validateTreeStructure(t);
    expect(errs[0].nodeId).toBe('amount_c');
  });
  it('unknown package id', () => {
    const t = JSON.parse(JSON.stringify(base));
    t.nodes.pk.source = { kind: 'IDS', packageIds: ['ghost'] };
    const errs = validateTreeStructure(t, { packages });
    expect(errs.some((e) => e.message.includes('Paket "ghost" tidak ditemukan'))).toBe(true);
  });
});

describe('walkPath + computeTotal', () => {
  it('pulsa: branches on provider and prices the package', () => {
    const tree = seg('pulsa');
    const pkg = pkgByCode('XL_10K');
    const steps: FlowStep[] = [
      { nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '0877 1234 5678' },
      { nodeId: 'pk_xl', type: 'PackagesList', packageId: pkg.id },
    ];
    expect(walkPath(tree, steps, ctx)).toEqual({ ok: true });
    const price = computeTotal(steps, tree, ctx, 700);
    expect(price.total).toBe(pkg.hargaAgen + 700);
    expect(price.markupTotal).toBe(700);
    const rows = describeSteps(steps, tree, ctx);
    expect(rows[0].value).toBe('087712345678 (XL)');
    expect(rows[1]).toEqual({ label: 'Paket', value: pkg.name });
  });
  it('pulsa: wrong branch for the number is an illegal path', () => {
    const tree = seg('pulsa');
    const steps: FlowStep[] = [
      { nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '081234567890' },
      { nodeId: 'pk_xl', type: 'PackagesList', packageId: pkgByCode('XL_10K').id },
    ];
    const r = walkPath(tree, steps, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('ILLEGAL_PATH');
  });
  it('xl: rejects a Telkomsel number', () => {
    const r = walkPath(seg('xl'), [{ nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '081234567890' }], ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('bukan nomor XL');
  });
  it('incomplete path', () => {
    const r = walkPath(seg('xl'), [{ nodeId: 'phone', type: 'PhoneNumberInput', phoneNumber: '087712345678' }], ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INCOMPLETE_PATH');
  });
  it('gopay: list + phone + amount with admin fee', () => {
    const tree = seg('gopay');
    const steps: FlowStep[] = [
      { nodeId: 'jenis', type: 'ListNode', rowId: 'driver' },
      { nodeId: 'phone_d', type: 'PhoneNumberInput', phoneNumber: '085712345678' },
      { nodeId: 'amount_d', type: 'EnterAmount', amount: 50000 },
    ];
    expect(walkPath(tree, steps, ctx)).toEqual({ ok: true });
    expect(computeTotal(steps, tree, ctx, 0)).toMatchObject({ amountBase: 50000, adminFee: 1500, total: 51500 });
    const bad = walkPath(tree, [...steps.slice(0, 2), { nodeId: 'amount_d', type: 'EnterAmount', amount: 50500 }], ctx);
    expect(bad.ok).toBe(false);
  });
  it('mobile legends: regex on both ids', () => {
    const tree = seg('mobile-legends');
    const good: FlowStep[] = [
      { nodeId: 'ids', type: 'CustomerIdInput', values: { customerId: '12345678', secondaryId: '1234' } },
      { nodeId: 'pk', type: 'PackagesList', packageId: pkgByCode('ML_86').id },
    ];
    expect(walkPath(tree, good, ctx)).toEqual({ ok: true });
    const bad = walkPath(tree, [{ ...good[0], values: { customerId: '12', secondaryId: '1234' } } as FlowStep, good[1]], ctx);
    expect(bad.ok).toBe(false);
  });
  it('pln pascabayar: inquiry must match collected id, server inquiry overrides price', () => {
    const tree = seg('pln-pascabayar');
    const steps: FlowStep[] = [
      { nodeId: 'idpel', type: 'CustomerIdInput', values: { customerId: '123456789012' } },
      { nodeId: 'inquiry', type: 'BillInquiry', customerId: '123456789012', amountDue: 150000 },
    ];
    expect(walkPath(tree, steps, ctx)).toEqual({ ok: true });
    expect(computeTotal(steps, tree, ctx, 0).total).toBe(152500);
    expect(computeTotal(steps, tree, ctx, 0, { customerId: '123456789012', amountDue: 160000, adminFee: 2500 }).total).toBe(162500);
    const mismatch = walkPath(tree, [steps[0], { ...steps[1], customerId: '999' } as FlowStep], ctx);
    expect(mismatch.ok).toBe(false);
  });
});
