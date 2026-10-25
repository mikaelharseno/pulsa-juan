import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { Box, Button, Checkbox, Chip, FormControlLabel, IconButton, Menu, MenuItem, Select, TextField, Typography, Autocomplete } from '@mui/material';
import {
  BillInquiry,
  CustomerIdInput,
  EnterAmount,
  ListNode,
  NODE_TYPE_LABELS,
  NODE_TYPES,
  NodeId,
  NodeType,
  PackagePublic,
  PackagesList,
  PhoneNumberInput,
  PROVIDER_LABELS,
  PROVIDERS,
  SegmentTree,
  TreeNode,
} from 'pulsa-juan-common';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api } from '../../api';
import { MediaDropZone } from '../../components/DropZone';

export interface FormCtx {
  tree: SegmentTree;
  packages: Record<string, PackagePublic>;
  categories: string[];
  errorsFor: (nodeId: NodeId, field?: string) => string[];
  select: (id: NodeId) => void;
  /** Create a node of `type`, link it via `link`, select it. */
  addChild: (type: NodeType, link: (childId: NodeId) => void) => void;
}

/** One outgoing link: shows the target, lets the admin create/connect/detach. */
export function ChildSlot({ label, childId, ctx, onLink }: { label: string; childId: NodeId | null | undefined; ctx: FormCtx; onLink: (id: NodeId | null) => void }) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [connect, setConnect] = useState(false);
  const target = childId ? ctx.tree.nodes[childId] : null;
  const others = Object.values(ctx.tree.nodes);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, flexWrap: 'wrap' }}>
      <Typography variant="body2" sx={{ minWidth: 90, color: 'text.secondary' }}>{label} →</Typography>
      {target ? (
        <Chip size="small" color="primary" variant="outlined" label={`${NODE_TYPE_LABELS[target.type]}: ${target.title || target.id}`} onClick={() => ctx.select(target.id)} onDelete={() => onLink(null)} deleteIcon={<Delete />} />
      ) : childId ? (
        <Chip size="small" color="error" label={`"${childId}" tidak ada`} onDelete={() => onLink(null)} />
      ) : (
        <Chip size="small" label="belum terhubung" />
      )}
      <Button size="small" startIcon={<Add />} onClick={(e) => setAnchor(e.currentTarget)}>{target ? 'Ganti' : 'Tambah'}</Button>
      <Menu open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {NODE_TYPES.map((t) => (
          <MenuItem key={t} onClick={() => { setAnchor(null); ctx.addChild(t, onLink); }}>Node baru: {NODE_TYPE_LABELS[t]}</MenuItem>
        ))}
        <MenuItem onClick={() => { setAnchor(null); setConnect(true); }}>Hubungkan ke node yang ada…</MenuItem>
      </Menu>
      {connect && (
        <Autocomplete size="small" sx={{ minWidth: 260 }} options={others} getOptionLabel={(n) => `${n.title || n.id} (${NODE_TYPE_LABELS[n.type]})`} onChange={(_, v) => { setConnect(false); if (v) onLink(v.id); }} renderInput={(p) => <TextField {...p} label="Pilih node" autoFocus />} openOnFocus />
      )}
    </Box>
  );
}

function Err({ list }: { list: string[] }) {
  if (!list.length) return null;
  return <Typography variant="caption" color="error" display="block">{list.join(' · ')}</Typography>;
}

interface P<T extends TreeNode> { node: T; ctx: FormCtx; onChange: (n: T) => void }

export function CommonFields({ node, ctx, onChange, onChangeType }: P<TreeNode> & { onChangeType: (t: NodeType) => void }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
      <TextField size="small" label="ID node" value={node.id} InputProps={{ readOnly: true }} />
      <Select size="small" value={node.type} onChange={(e) => onChangeType(e.target.value as NodeType)}>{NODE_TYPES.map((t) => <MenuItem key={t} value={t}>{NODE_TYPE_LABELS[t]}</MenuItem>)}</Select>
      <Box><TextField size="small" fullWidth label="Judul layar" value={node.title} onChange={(e) => onChange({ ...node, title: e.target.value })} /><Err list={ctx.errorsFor(node.id, 'title')} /></Box>
      <TextField size="small" label="Subjudul (opsional)" value={node.subtitle ?? ''} onChange={(e) => onChange({ ...node, subtitle: e.target.value || undefined })} />
    </Box>
  );
}

export function ListNodeForm({ node, ctx, onChange }: P<ListNode>) {
  const setRow = (i: number, patch: Partial<ListNode['rows'][number]>) => onChange({ ...node, rows: node.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const move = (i: number, d: number) => { const rows = [...node.rows]; const j = i + d; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j], rows[i]]; onChange({ ...node, rows }); };
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Baris pilihan</Typography>
      <Err list={ctx.errorsFor(node.id, 'rows')} />
      {node.rows.map((r, i) => (
        <Box key={r.id} sx={{ border: '1px solid #E3E9EA', borderRadius: 1, p: 1.5, mb: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField size="small" label="Label" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} sx={{ flex: 1 }} />
            <TextField size="small" label="Sub-label" value={r.sublabel ?? ''} onChange={(e) => setRow(i, { sublabel: e.target.value || undefined })} sx={{ flex: 1 }} />
            <FormControlLabel control={<Checkbox size="small" checked={r.isActive} onChange={(e) => setRow(i, { isActive: e.target.checked })} />} label="Aktif" />
            <IconButton size="small" onClick={() => move(i, -1)}><ArrowUpward fontSize="inherit" /></IconButton>
            <IconButton size="small" onClick={() => move(i, 1)}><ArrowDownward fontSize="inherit" /></IconButton>
            <IconButton size="small" color="error" disabled={node.rows.length <= 1} onClick={() => onChange({ ...node, rows: node.rows.filter((_, j) => j !== i) })}><Delete fontSize="inherit" /></IconButton>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
            {r.imageUrl ? <img src={r.imageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} /> : null}
            <Box sx={{ flex: 1 }}><MediaDropZone compact folder="rows" onUploaded={(u) => setRow(i, { imageUrl: u[0] })} /></Box>
            {r.imageUrl && <Button size="small" onClick={() => setRow(i, { imageUrl: undefined })}>hapus gambar</Button>}
          </Box>
          <ChildSlot label="Menuju" childId={r.childId} ctx={ctx} onLink={(id) => setRow(i, { childId: id ?? '' })} />
          <Err list={ctx.errorsFor(node.id, `rows.${i}.childId`)} />
        </Box>
      ))}
      <Button size="small" startIcon={<Add />} onClick={() => onChange({ ...node, rows: [...node.rows, { id: 'r' + (node.rows.length + 1) + '_' + Math.random().toString(36).slice(2, 6), label: 'Pilihan baru', childId: '', isActive: true }] })}>Tambah baris</Button>
    </Box>
  );
}

export function PackagesListForm({ node, ctx, onChange }: P<PackagesList>) {
  const pkgs = Object.values(ctx.packages);
  const src = node.source;
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Sumber paket</Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Select size="small" value={src.kind} onChange={(e) => onChange({ ...node, source: e.target.value === 'IDS' ? { kind: 'IDS', packageIds: [] } : { kind: 'CATEGORY', category: '' } })}>
          <MenuItem value="CATEGORY">Semua paket aktif dalam kategori</MenuItem>
          <MenuItem value="IDS">Pilih paket satu per satu</MenuItem>
        </Select>
        {src.kind === 'CATEGORY' ? (
          <Autocomplete size="small" freeSolo sx={{ flex: 1 }} options={ctx.categories} value={src.category} onInputChange={(_, v) => onChange({ ...node, source: { kind: 'CATEGORY', category: v.toUpperCase() } })} renderInput={(p) => <TextField {...p} label="Kategori" helperText={`${pkgs.filter((x) => x.category === src.category && x.isActive).length} paket aktif`} />} />
        ) : (
          <Autocomplete size="small" multiple sx={{ flex: 1 }} options={pkgs} getOptionLabel={(p) => `${p.code} — ${p.name} (Rp ${p.hargaAgen})`} value={src.packageIds.map((id) => ctx.packages[id]).filter(Boolean)} onChange={(_, v) => onChange({ ...node, source: { kind: 'IDS', packageIds: v.map((p) => p.id) } })} renderInput={(p) => <TextField {...p} label="Paket" />} />
        )}
      </Box>
      <Err list={ctx.errorsFor(node.id, 'source')} />
      <Typography variant="subtitle2" sx={{ mt: 2 }}>Setelah memilih paket</Typography>
      <ChildSlot label="Lanjut ke" childId={node.nextId} ctx={ctx} onLink={(id) => onChange({ ...node, nextId: id })} />
      <Typography variant="caption" color="text.secondary">Biasanya kosong: memilih paket langsung ke halaman konfirmasi.</Typography>
    </Box>
  );
}

export function PhoneNumberInputForm({ node, ctx, onChange }: P<PhoneNumberInput>) {
  const allowed = node.allowedProviders;
  return (
    <Box>
      <TextField size="small" fullWidth label="Label input" value={node.label} onChange={(e) => onChange({ ...node, label: e.target.value })} sx={{ mt: 2 }} />
      <Typography variant="subtitle2" sx={{ mt: 2 }}>Operator yang diizinkan</Typography>
      <FormControlLabel control={<Checkbox size="small" checked={allowed === null} onChange={(e) => onChange({ ...node, allowedProviders: e.target.checked ? null : [...PROVIDERS] })} />} label="Semua operator" />
      {allowed !== null && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
          {PROVIDERS.map((p) => (
            <FormControlLabel key={p} control={<Checkbox size="small" checked={allowed.includes(p)} onChange={(e) => onChange({ ...node, allowedProviders: e.target.checked ? [...allowed, p] : allowed.filter((x) => x !== p) })} />} label={PROVIDER_LABELS[p]} />
          ))}
        </Box>
      )}
      <Err list={ctx.errorsFor(node.id, 'allowedProviders')} />
      <Typography variant="subtitle2" sx={{ mt: 2 }}>Cabang per operator (opsional)</Typography>
      <Typography variant="caption" color="text.secondary">Isi bila layar berikutnya berbeda per operator (mis. segmen "Pulsa" umum). Kosongkan semua dan pakai cabang default bila tidak.</Typography>
      {PROVIDERS.filter((p) => allowed === null || allowed.includes(p)).map((p) => (
        <ChildSlot key={p} label={PROVIDER_LABELS[p]} childId={node.branches[p]} ctx={ctx} onLink={(id) => { const branches = { ...node.branches }; if (id) branches[p] = id; else delete branches[p]; onChange({ ...node, branches }); }} />
      ))}
      <Err list={ctx.errorsFor(node.id, 'branches')} />
      <Typography variant="subtitle2" sx={{ mt: 2 }}>Cabang default</Typography>
      <ChildSlot label="Lanjut ke" childId={node.defaultChildId} ctx={ctx} onLink={(id) => onChange({ ...node, defaultChildId: id })} />
    </Box>
  );
}

export function EnterAmountForm({ node, ctx, onChange }: P<EnterAmount>) {
  const num = (k: 'min' | 'max' | 'step' | 'adminFee') => ({ size: 'small' as const, type: 'number', value: node[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...node, [k]: Number(e.target.value) }) });
  return (
    <Box>
      <TextField size="small" fullWidth label="Label input" value={node.label} onChange={(e) => onChange({ ...node, label: e.target.value })} sx={{ mt: 2 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mt: 1.5 }}>
        <TextField label="Minimal (Rp)" {...num('min')} />
        <TextField label="Maksimal (Rp)" {...num('max')} />
        <TextField label="Kelipatan (Rp)" {...num('step')} />
        <TextField label="Biaya admin (Rp)" {...num('adminFee')} />
      </Box>
      <Err list={[...ctx.errorsFor(node.id, 'max'), ...ctx.errorsFor(node.id, 'min'), ...ctx.errorsFor(node.id, 'step')]} />
      <TextField size="small" fullWidth sx={{ mt: 1.5 }} label="Nominal cepat (pisahkan koma)" value={node.quickAmounts.join(',')} onChange={(e) => onChange({ ...node, quickAmounts: e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x) && x > 0) })} />
      <Err list={ctx.errorsFor(node.id, 'quickAmounts')} />
      <Typography variant="subtitle2" sx={{ mt: 2 }}>Setelah nominal diisi</Typography>
      <ChildSlot label="Lanjut ke" childId={node.nextId} ctx={ctx} onLink={(id) => onChange({ ...node, nextId: id })} />
    </Box>
  );
}

export function CustomerIdInputForm({ node, ctx, onChange }: P<CustomerIdInput>) {
  const setField = (i: number, patch: Partial<CustomerIdInput['fields'][number]>) => onChange({ ...node, fields: node.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const [test, setTest] = useState('');
  return (
    <Box>
      {node.fields.map((f, i) => {
        let ok: boolean | null = null;
        if (test && i === 0) { try { ok = f.regex ? new RegExp(f.regex).test(test) : true; } catch { ok = false; } }
        return (
          <Box key={f.key} sx={{ border: '1px solid #E3E9EA', borderRadius: 1, p: 1.5, mt: 1.5 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{i === 0 ? 'Field utama (customerId)' : 'Field kedua (secondaryId, mis. Zone ID)'}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField size="small" label="Label" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
              <TextField size="small" label="Placeholder" value={f.placeholder ?? ''} onChange={(e) => setField(i, { placeholder: e.target.value || undefined })} />
              <TextField size="small" label="Regex validasi" value={f.regex ?? ''} onChange={(e) => setField(i, { regex: e.target.value || undefined })} helperText={i === 0 && test ? (ok ? 'Uji: cocok ✓' : 'Uji: tidak cocok ✗') : 'contoh: ^[0-9]{11,12}$'} />
              {i === 0 ? <TextField size="small" label="Uji dengan nilai" value={test} onChange={(e) => setTest(e.target.value)} /> : <Box />}
              <TextField size="small" type="number" label="Panjang min" value={f.minLength ?? ''} onChange={(e) => setField(i, { minLength: e.target.value ? Number(e.target.value) : undefined })} />
              <TextField size="small" type="number" label="Panjang maks" value={f.maxLength ?? ''} onChange={(e) => setField(i, { maxLength: e.target.value ? Number(e.target.value) : undefined })} />
              <Select size="small" value={f.keyboard} onChange={(e) => setField(i, { keyboard: e.target.value as 'numeric' | 'default' })}><MenuItem value="numeric">Keyboard angka</MenuItem><MenuItem value="default">Keyboard teks</MenuItem></Select>
              <FormControlLabel control={<Checkbox size="small" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />} label="Wajib diisi" />
              <TextField size="small" label="Teks bantuan" value={f.helpText ?? ''} onChange={(e) => setField(i, { helpText: e.target.value || undefined })} sx={{ gridColumn: '1 / -1' }} />
            </Box>
            <Err list={ctx.errorsFor(node.id, `fields.${i}.regex`)} />
            {i === 1 && <Button size="small" color="error" onClick={() => onChange({ ...node, fields: [node.fields[0]] })}>Hapus field kedua</Button>}
          </Box>
        );
      })}
      {node.fields.length < 2 && <Button size="small" startIcon={<Add />} sx={{ mt: 1 }} onClick={() => onChange({ ...node, fields: [...node.fields, { key: 'secondaryId', label: 'Zone ID', keyboard: 'numeric', required: true }] })}>Tambah field kedua</Button>}
      <Typography variant="subtitle2" sx={{ mt: 2 }}>Setelah ID diisi</Typography>
      <ChildSlot label="Lanjut ke" childId={node.nextId} ctx={ctx} onLink={(id) => onChange({ ...node, nextId: id })} />
    </Box>
  );
}

export function BillInquiryForm({ node, ctx, onChange }: P<BillInquiry>) {
  const billers = useQuery({ queryKey: ['admin-billers'], queryFn: async () => (await api.get<{ key: string; name: string; usable: boolean; ourFee: number }[]>('/admin/billers')).data });
  const known = (billers.data ?? []).some((b) => b.key === node.product);
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 2 }}>
        <TextField
          select
          size="small"
          label="Biller"
          value={node.product}
          onChange={(e) => onChange({ ...node, product: e.target.value })}
          helperText={known || !node.product ? 'Kode cek/bayar & pola diatur di Katalog → Tagihan (Biller)' : 'Kunci ini belum ada di halaman Tagihan (Biller)'}
          error={!!node.product && !!billers.data && !known}
        >
          {(billers.data ?? []).map((b) => (
            <MenuItem key={b.key} value={b.key}>{b.name} <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>{b.key}{b.usable ? '' : ' · belum siap'}</Typography></MenuItem>
          ))}
          {node.product && !known && <MenuItem value={node.product}>{node.product}</MenuItem>}
        </TextField>
        <TextField size="small" type="number" label="Biaya admin cadangan (Rp)" value={node.adminFee} onChange={(e) => onChange({ ...node, adminFee: Number(e.target.value) })} helperText="dipakai hanya bila hasil cek tidak membawa admin" />
      </Box>
      <Err list={ctx.errorsFor(node.id, 'product')} />
      <Typography variant="caption" color="text.secondary">Membutuhkan node Input ID pelanggan sebelumnya. Tagihan dan admin diambil dari hasil cek OtomaX; agen membayar tagihan + admin supplier + biaya kita (+ markup referral).</Typography>
      <Typography variant="subtitle2" sx={{ mt: 2 }}>Setelah tagihan tampil</Typography>
      <ChildSlot label="Lanjut ke" childId={node.nextId} ctx={ctx} onLink={(id) => onChange({ ...node, nextId: id })} />
    </Box>
  );
}

export const NODE_FORMS: { [K in NodeType]: React.ComponentType<P<Extract<TreeNode, { type: K }>>> } = {
  ListNode: ListNodeForm,
  PackagesList: PackagesListForm,
  PhoneNumberInput: PhoneNumberInputForm,
  EnterAmount: EnterAmountForm,
  CustomerIdInput: CustomerIdInputForm,
  BillInquiry: BillInquiryForm,
};
