import { ArrowDownward, ArrowUpward } from '@mui/icons-material';
import { Box, Button, Chip, IconButton, Paper, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, errMsg, fmtDate } from '../api';
import { useRole } from '../auth/useSession';
import { ConfirmDialog, PageHeader } from '../components/common';
import { MediaDropZone } from '../components/DropZone';
import { ServiceTile } from '../components/BuiltinIcon';
import { BUILTIN_PREFIX, ICON_KEYS, ICONS } from 'pulsa-juan-common';

export interface SegmentRow {
  id: string; slug: string; label: string; iconUrl: string | null; groupLabel: string | null; badge: string | null; sortOrder: number; isActive: boolean;
  maintenanceMessage: string | null; draftUpdatedAt: string | null; publishedVersionId: string | null; publishedVersion: { id: string; version: number; publishedAt: string } | null;
}
const EMPTY: Partial<SegmentRow> = { slug: '', label: '', iconUrl: null, groupLabel: 'Pulsa & Data', badge: null, isActive: false, maintenanceMessage: null };

export function hasUnpublishedDraft(s: SegmentRow) {
  if (!s.draftUpdatedAt) return false;
  if (!s.publishedVersion) return true;
  return new Date(s.draftUpdatedAt).getTime() > new Date(s.publishedVersion.publishedAt).getTime();
}

export default function SegmentsPage() {
  const role = useRole();
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['admin-segments'], queryFn: async () => (await api.get<{ segments: SegmentRow[] }>('/admin/segments')).data.segments });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-segments'] });
  const [edit, setEdit] = useState<Partial<SegmentRow> | null>(null);
  const save = useMutation({
    mutationFn: async (s: Partial<SegmentRow>) => {
      const body = { slug: s.slug, label: s.label, iconUrl: s.iconUrl || null, groupLabel: s.groupLabel || null, badge: s.badge || null, isActive: s.isActive, maintenanceMessage: s.maintenanceMessage || null };
      return s.id ? (await api.put(`/admin/segments/${s.id}`, body)).data : (await api.post('/admin/segments', body)).data;
    },
    onSuccess: (data: SegmentRow, vars) => { refresh(); setEdit(null); if (!vars.id) nav(`/segments/${data.id}/tree`); },
  });
  const toggle = useMutation({ mutationFn: async (s: SegmentRow) => (await api.put(`/admin/segments/${s.id}`, { isActive: !s.isActive })).data, onSuccess: refresh });
  const reorder = useMutation({ mutationFn: async (ids: string[]) => (await api.put('/admin/segments/reorder', { ids })).data, onSuccess: refresh });
  const [dup, setDup] = useState<SegmentRow | null>(null);
  const [dupForm, setDupForm] = useState({ newSlug: '', newLabel: '' });
  const dupM = useMutation({ mutationFn: async () => (await api.post(`/admin/segments/${dup!.id}/duplicate`, dupForm)).data, onSuccess: () => { refresh(); setDup(null); } });
  const del = useMutation({ mutationFn: async (id: string) => api.delete(`/admin/segments/${id}`), onSuccess: refresh });
  const canEdit = role !== 'STAFF';
  const rows = q.data ?? [];
  const move = (i: number, d: number) => { const ids = rows.map((r) => r.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; reorder.mutate(ids); };

  return (
    <Box>
      <PageHeader title="Segmen & Alur" subtitle="Ikon di beranda aplikasi agen. Setiap segmen punya alur (segmentDisplayTree) yang bisa diedit secara visual." actions={canEdit && <Button variant="contained" onClick={() => setEdit({ ...EMPTY })}>Tambah segmen</Button>} />
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Urutan</TableCell><TableCell>Ikon</TableCell><TableCell>Label</TableCell><TableCell>Slug</TableCell><TableCell>Grup</TableCell><TableCell>Badge</TableCell><TableCell>Aktif</TableCell><TableCell>Versi</TableCell><TableCell>Draf</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {rows.map((s, i) => (
              <TableRow key={s.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" disabled={!canEdit || i === 0} onClick={() => move(i, -1)}><ArrowUpward fontSize="inherit" /></IconButton>
                  <IconButton size="small" disabled={!canEdit || i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDownward fontSize="inherit" /></IconButton>
                </TableCell>
                <TableCell><ServiceTile iconUrl={s.iconUrl} slug={s.slug} px={40} /></TableCell>
                <TableCell><b>{s.label}</b>{s.maintenanceMessage && <Chip size="small" color="warning" label="maintenance" sx={{ ml: 1 }} />}</TableCell>
                <TableCell><code>{s.slug}</code></TableCell>
                <TableCell>{s.groupLabel ?? '-'}</TableCell>
                <TableCell>{s.badge ?? '-'}</TableCell>
                <TableCell><Switch size="small" checked={s.isActive} disabled={!canEdit || !s.publishedVersion} onChange={() => toggle.mutate(s)} /></TableCell>
                <TableCell>{s.publishedVersion ? `v${s.publishedVersion.version} · ${fmtDate(s.publishedVersion.publishedAt)}` : <Chip size="small" label="Belum dipublikasi" />}</TableCell>
                <TableCell>{hasUnpublishedDraft(s) && <Chip size="small" color="warning" label="Draf belum dipublikasi" />}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Button size="small" variant="outlined" onClick={() => nav(`/segments/${s.id}/tree`)}>Edit alur</Button>
                  {canEdit && <Button size="small" onClick={() => setEdit(s)} sx={{ ml: 1 }}>Edit</Button>}
                  {canEdit && <Button size="small" onClick={() => { setDup(s); setDupForm({ newSlug: s.slug + '-copy', newLabel: s.label + ' (salinan)' }); }} sx={{ ml: 1 }}>Duplikat</Button>}
                  {role === 'OWNER' && <Button size="small" color="error" onClick={() => window.confirm(`Hapus segmen ${s.label}?`) && del.mutate(s.id)} sx={{ ml: 1 }}>Hapus</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      {del.isError && <Typography color="error" sx={{ mt: 1 }}>{errMsg(del.error)}</Typography>}
      <ConfirmDialog open={!!edit} title={edit?.id ? 'Edit segmen' : 'Tambah segmen'} confirmLabel="Simpan" busy={save.isPending} disabled={!edit?.slug || !edit?.label} error={save.isError ? errMsg(save.error) : null} onClose={() => { setEdit(null); save.reset(); }} onConfirm={() => edit && save.mutate(edit)} maxWidth="sm">
        {edit && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 0.5 }}>
            <TextField label="Label" size="small" value={edit.label ?? ''} onChange={(e) => setEdit({ ...edit, label: e.target.value, slug: edit.id ? edit.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} />
            <TextField label="Slug" size="small" value={edit.slug ?? ''} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} />
            <TextField label="Grup (judul bagian di beranda)" size="small" value={edit.groupLabel ?? ''} onChange={(e) => setEdit({ ...edit, groupLabel: e.target.value })} />
            <TextField label="Badge (mis. BARU / PROMO)" size="small" value={edit.badge ?? ''} onChange={(e) => setEdit({ ...edit, badge: e.target.value.toUpperCase() })} />
            <TextField label="Pesan maintenance (kosongkan bila normal)" size="small" value={edit.maintenanceMessage ?? ''} onChange={(e) => setEdit({ ...edit, maintenanceMessage: e.target.value })} sx={{ gridColumn: '1 / -1' }} />
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Ikon</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                {ICON_KEYS.map((k) => {
                  const selected = edit.iconUrl === BUILTIN_PREFIX + k;
                  return (
                    <Box key={k} onClick={() => setEdit({ ...edit, iconUrl: BUILTIN_PREFIX + k })} title={ICONS[k].label} sx={{ p: 0.5, borderRadius: 2, border: '2px solid', borderColor: selected ? 'primary.main' : 'transparent', cursor: 'pointer', textAlign: 'center', width: 64 }}>
                      <Box sx={{ display: 'grid', placeItems: 'center' }}><ServiceTile iconUrl={BUILTIN_PREFIX + k} px={44} /></Box>
                      <Typography variant="caption" sx={{ fontSize: 10, display: 'block', lineHeight: 1.1, mt: 0.5 }} noWrap>{ICONS[k].label}</Typography>
                    </Box>
                  );
                })}
              </Box>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <ServiceTile iconUrl={edit.iconUrl} slug={edit.slug} px={56} />
                <Box sx={{ flex: 1 }}><MediaDropZone compact folder="icons" onUploaded={(u) => setEdit({ ...edit, iconUrl: u[0] })} /></Box>
              </Box>
              <Typography variant="caption" color="text.secondary">Pilih ikon bawaan di atas, atau unggah gambar sendiri (PNG/SVG transparan disarankan).</Typography>
            </Box>
          </Box>
        )}
      </ConfirmDialog>
      <ConfirmDialog open={!!dup} title={`Duplikat "${dup?.label ?? ''}"`} confirmLabel="Duplikat" busy={dupM.isPending} error={dupM.isError ? errMsg(dupM.error) : null} onClose={() => setDup(null)} onConfirm={() => dupM.mutate()}>
        <TextField label="Slug baru" size="small" fullWidth margin="dense" value={dupForm.newSlug} onChange={(e) => setDupForm({ ...dupForm, newSlug: e.target.value })} />
        <TextField label="Label baru" size="small" fullWidth margin="dense" value={dupForm.newLabel} onChange={(e) => setDupForm({ ...dupForm, newLabel: e.target.value })} />
        <Typography variant="caption" color="text.secondary">Alur disalin sebagai draf dengan ID node baru; segmen hasil salinan nonaktif sampai dipublikasikan.</Typography>
      </ConfirmDialog>
    </Box>
  );
}
