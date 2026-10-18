import { Box, Button, MenuItem, Paper, Select, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PROVIDERS } from 'pulsa-juan-common';
import { useState } from 'react';

import { api, errMsg, fmtRp } from '../api';
import { useRole } from '../auth/useSession';
import { ConfirmDialog, PageHeader } from '../components/common';
import { MediaDropZone } from '../components/DropZone';
import { SortableCell, useTableSort } from '../components/sortableTable';

export interface Pkg {
  id: string; code: string; name: string; description: string | null; category: string; provider: string | null; hargaAgen: number; hargaBeli: number;
  imageUrl: string | null; supplierName: string | null; supplierSku: string | null; isActive: boolean; sortOrder: number;
}
const EMPTY: Partial<Pkg> = { code: '', name: '', category: '', provider: null, hargaAgen: 0, hargaBeli: 0, imageUrl: null, supplierSku: '', supplierName: '', isActive: true, sortOrder: 0 };

export default function PackagesPage() {
  const role = useRole();
  const qc = useQueryClient();
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const cats = useQuery({ queryKey: ['admin-package-categories'], queryFn: async () => (await api.get<{ categories: { category: string; count: number }[] }>('/admin/packages/categories')).data.categories });
  const list = useQuery({ queryKey: ['admin-packages', category, q], queryFn: async () => (await api.get<{ packages: Pkg[] }>('/admin/packages', { params: { category: category || undefined, q: q || undefined } })).data.packages });
  const { sorted, sort, toggleSort } = useTableSort(list.data ?? [], { code: (r) => r.code, name: (r) => r.name, category: (r) => r.category, hargaAgen: (r) => r.hargaAgen, hargaBeli: (r) => r.hargaBeli, sortOrder: (r) => r.sortOrder });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-packages'] }); qc.invalidateQueries({ queryKey: ['admin-package-categories'] }); };

  const [edit, setEdit] = useState<Partial<Pkg> | null>(null);
  const save = useMutation({
    mutationFn: async (p: Partial<Pkg>) => {
      const body = { ...p, hargaAgen: Number(p.hargaAgen), hargaBeli: Number(p.hargaBeli ?? 0), sortOrder: Number(p.sortOrder ?? 0), provider: p.provider || null, imageUrl: p.imageUrl || null, supplierSku: p.supplierSku || null, supplierName: p.supplierName || null, description: p.description || null };
      delete (body as { id?: string }).id;
      return p.id ? (await api.put(`/admin/packages/${p.id}`, body)).data : (await api.post('/admin/packages', body)).data;
    },
    onSuccess: () => { refresh(); setEdit(null); },
  });
  const toggle = useMutation({ mutationFn: async (p: Pkg) => (await api.put(`/admin/packages/${p.id}`, { isActive: !p.isActive })).data, onSuccess: refresh });
  const del = useMutation({ mutationFn: async (id: string) => api.delete(`/admin/packages/${id}`), onSuccess: refresh });
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const importM = useMutation({ mutationFn: async () => (await api.post<{ imported: number; errors: string[] }>('/admin/packages/import', { csv })).data, onSuccess: refresh });
  const canEdit = role !== 'STAFF';

  return (
    <Box>
      <PageHeader title="Paket" subtitle="Produk berharga yang ditampilkan di node Daftar paket. Kategori menentukan paket mana yang muncul." actions={
        <>
          <TextField size="small" placeholder="Cari kode / nama" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select size="small" value={category} onChange={(e) => setCategory(e.target.value)} displayEmpty>
            <MenuItem value="">Semua kategori</MenuItem>
            {(cats.data ?? []).map((c) => <MenuItem key={c.category} value={c.category}>{c.category} ({c.count})</MenuItem>)}
          </Select>
          {canEdit && <Button variant="outlined" onClick={() => { setImportOpen(true); importM.reset(); }}>Impor CSV</Button>}
          {canEdit && <Button variant="contained" onClick={() => setEdit({ ...EMPTY, category })}>Tambah paket</Button>}
        </>
      } />
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow>
            <SortableCell label="Kode" sortKey="code" sort={sort} onToggle={toggleSort} />
            <SortableCell label="Nama" sortKey="name" sort={sort} onToggle={toggleSort} />
            <SortableCell label="Kategori" sortKey="category" sort={sort} onToggle={toggleSort} />
            <TableCell>Operator</TableCell>
            <SortableCell label="Harga agen" sortKey="hargaAgen" sort={sort} onToggle={toggleSort} align="right" />
            <SortableCell label="Harga beli" sortKey="hargaBeli" sort={sort} onToggle={toggleSort} align="right" />
            <TableCell>SKU supplier</TableCell>
            <SortableCell label="Urutan" sortKey="sortOrder" sort={sort} onToggle={toggleSort} align="right" />
            <TableCell>Aktif</TableCell><TableCell />
          </TableRow></TableHead>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id} hover>
                <TableCell><code>{p.code}</code></TableCell>
                <TableCell>{p.imageUrl && <img src={p.imageUrl} alt="" style={{ width: 24, height: 24, borderRadius: 4, verticalAlign: 'middle', marginRight: 6 }} />}{p.name}</TableCell>
                <TableCell>{p.category}</TableCell>
                <TableCell>{p.provider ?? '-'}</TableCell>
                <TableCell align="right">{fmtRp(p.hargaAgen)}</TableCell>
                <TableCell align="right">{fmtRp(p.hargaBeli)}</TableCell>
                <TableCell>{p.supplierSku ?? '-'}</TableCell>
                <TableCell align="right">{p.sortOrder}</TableCell>
                <TableCell><Switch size="small" checked={p.isActive} disabled={!canEdit} onChange={() => toggle.mutate(p)} /></TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {canEdit && <Button size="small" onClick={() => setEdit(p)}>Edit</Button>}
                  {role === 'OWNER' && <Button size="small" color="error" onClick={() => window.confirm(`Hapus paket ${p.code}?`) && del.mutate(p.id)}>Hapus</Button>}
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && <TableRow><TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>Tidak ada paket</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>
      {del.isError && <Typography color="error" sx={{ mt: 1 }}>{errMsg(del.error)}</Typography>}

      <ConfirmDialog open={!!edit} title={edit?.id ? 'Edit paket' : 'Tambah paket'} confirmLabel="Simpan" busy={save.isPending} disabled={!edit?.code || !edit?.name || !edit?.category} error={save.isError ? errMsg(save.error) : null} onClose={() => { setEdit(null); save.reset(); }} onConfirm={() => edit && save.mutate(edit)} maxWidth="sm">
        {edit && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 0.5 }}>
            <TextField label="Kode" value={edit.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} size="small" />
            <TextField label="Kategori" value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value.toUpperCase() })} size="small" helperText="contoh: PULSA_TELKOMSEL" />
            <TextField label="Nama" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} size="small" sx={{ gridColumn: '1 / -1' }} />
            <TextField label="Harga agen (Rp)" type="number" value={edit.hargaAgen ?? 0} onChange={(e) => setEdit({ ...edit, hargaAgen: Number(e.target.value) })} size="small" />
            <TextField label="Harga beli (Rp)" type="number" value={edit.hargaBeli ?? 0} onChange={(e) => setEdit({ ...edit, hargaBeli: Number(e.target.value) })} size="small" />
            <Select size="small" value={edit.provider ?? ''} onChange={(e) => setEdit({ ...edit, provider: e.target.value || null })} displayEmpty><MenuItem value="">Tanpa operator</MenuItem>{PROVIDERS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}</Select>
            <TextField label="Urutan" type="number" value={edit.sortOrder ?? 0} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) })} size="small" />
            <TextField label="Supplier" value={edit.supplierName ?? ''} onChange={(e) => setEdit({ ...edit, supplierName: e.target.value })} size="small" />
            <TextField label="SKU supplier" value={edit.supplierSku ?? ''} onChange={(e) => setEdit({ ...edit, supplierSku: e.target.value })} size="small" />
            <TextField label="Deskripsi" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} size="small" sx={{ gridColumn: '1 / -1' }} />
            <Box sx={{ gridColumn: '1 / -1', display: 'flex', gap: 2, alignItems: 'center' }}>
              {edit.imageUrl && <img src={edit.imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: 6, objectFit: 'cover' }} />}
              <Box sx={{ flex: 1 }}><MediaDropZone compact folder="packages" onUploaded={(u) => setEdit({ ...edit, imageUrl: u[0] })} /></Box>
              {edit.imageUrl && <Button size="small" onClick={() => setEdit({ ...edit, imageUrl: null })}>Hapus gambar</Button>}
            </Box>
          </Box>
        )}
      </ConfirmDialog>
      <ConfirmDialog open={importOpen} title="Impor paket dari CSV" confirmLabel="Impor" busy={importM.isPending} disabled={!csv.trim()} error={importM.isError ? errMsg(importM.error) : null} onClose={() => setImportOpen(false)} onConfirm={() => importM.mutate()} maxWidth="sm">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Kolom: code,name,category,provider,hargaAgen,hargaBeli,sortOrder — satu paket per baris; kode yang sudah ada akan diperbarui.</Typography>
        <TextField multiline minRows={8} fullWidth value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'TSEL_5K,Telkomsel 5.000,PULSA_TELKOMSEL,TELKOMSEL,6500,6000,0'} />
        {importM.data && <Typography variant="body2" sx={{ mt: 1 }}>Diimpor: {importM.data.imported}. {importM.data.errors.length > 0 && 'Error: ' + importM.data.errors.join('; ')}</Typography>}
      </ConfirmDialog>
    </Box>
  );
}
