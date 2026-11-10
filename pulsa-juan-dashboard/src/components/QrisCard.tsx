import { Delete } from '@mui/icons-material';
import { Alert, Box, Button, IconButton, LinearProgress, Paper, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, errMsg, fmtRp } from '../api';
import { MediaDropZone } from './DropZone';

interface Qris {
  id: string;
  label: string;
  imageUrl: string;
  monthlyLimit: number;
  isActive: boolean;
  sortOrder: number;
  paidThisMonth: number;
  reservedNow: number;
}

const LIMIT_DEFAULT = 20_000_000;

/**
 * Static QRIS codes for saldo top-ups. A QRIS top-up goes to the active code
 * with the least use this month (paid + still-open orders) that has room
 * under its monthly limit.
 */
export function QrisCard({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-qris'], queryFn: async () => (await api.get<Qris[]>('/admin/qris')).data });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-qris'] });
  const [draft, setDraft] = useState<{ label: string; imageUrl: string; monthlyLimit: string }>({ label: '', imageUrl: '', monthlyLimit: String(LIMIT_DEFAULT) });
  const add = useMutation({
    mutationFn: async () => (await api.post('/admin/qris', { label: draft.label, imageUrl: draft.imageUrl, monthlyLimit: Number(draft.monthlyLimit) || LIMIT_DEFAULT, sortOrder: q.data?.length ?? 0 })).data,
    onSuccess: () => { setDraft({ label: '', imageUrl: '', monthlyLimit: String(LIMIT_DEFAULT) }); refresh(); },
  });
  const update = useMutation({ mutationFn: async (v: { id: string; data: Partial<Qris> }) => (await api.put(`/admin/qris/${v.id}`, v.data)).data, onSuccess: refresh });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete(`/admin/qris/${id}`)).data, onSuccess: refresh });
  const rows = q.data ?? [];

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>QRIS untuk top up</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        QRIS statis: agen membayar nominal persis (dengan kode unik). Top up di atas Rp 500.000 kena biaya admin 1% (tidak masuk saldo). Tiap top up QRIS memakai QRIS aktif yang paling sedikit terpakai bulan ini dan masih di bawah limitnya.
      </Typography>
      {rows.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Belum ada QRIS. Opsi QRIS tidak tampil di aplikasi sampai ada QRIS aktif.</Typography>}
      {rows.length > 0 && (
        <Table size="small" sx={{ mb: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>QRIS</TableCell>
              <TableCell>Terpakai bulan ini</TableCell>
              <TableCell align="right">Limit / bulan</TableCell>
              <TableCell align="center">Aktif</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const used = r.paidThisMonth + r.reservedNow;
              const pct = Math.min(100, (used / r.monthlyLimit) * 100);
              return (
                <TableRow key={r.id}>
                  <TableCell sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <a href={r.imageUrl} target="_blank" rel="noreferrer"><img src={r.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: 'contain', background: '#fff', borderRadius: 4 }} /></a>
                    <b>{r.label}</b>
                  </TableCell>
                  <TableCell sx={{ minWidth: 200 }}>
                    <LinearProgress variant="determinate" value={pct} color={pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'primary'} sx={{ height: 8, borderRadius: 4, mb: 0.5 }} />
                    <Typography variant="caption" color="text.secondary">
                      {fmtRp(r.paidThisMonth)} lunas{r.reservedNow ? ` + ${fmtRp(r.reservedNow)} menunggu` : ''} · sisa {fmtRp(Math.max(0, r.monthlyLimit - used))}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      defaultValue={r.monthlyLimit}
                      disabled={!canEdit}
                      onBlur={(e) => { const v = Number(e.target.value); if (v && v !== r.monthlyLimit) update.mutate({ id: r.id, data: { monthlyLimit: v } }); }}
                      sx={{ width: 140 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={r.isActive} disabled={!canEdit} onChange={(e) => update.mutate({ id: r.id, data: { isActive: e.target.checked } })} />
                  </TableCell>
                  <TableCell align="right">
                    {canEdit && (
                      <Tooltip title="Hapus (QRIS yang sudah dipakai hanya dinonaktifkan)">
                        <IconButton size="small" color="error" onClick={() => remove.mutate(r.id)}><Delete fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {(update.isError || remove.isError) && <Alert severity="error" sx={{ mb: 1 }}>{errMsg(update.error ?? remove.error)}</Alert>}
      {canEdit && (
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Box sx={{ width: 120 }}>
            {draft.imageUrl ? (
              <Box sx={{ position: 'relative' }}>
                <img src={draft.imageUrl} alt="" style={{ width: 120, height: 120, objectFit: 'contain', background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb' }} />
                <Button size="small" onClick={() => setDraft({ ...draft, imageUrl: '' })}>Ganti</Button>
              </Box>
            ) : (
              <MediaDropZone folder="qris" compact onUploaded={(urls) => setDraft({ ...draft, imageUrl: urls[0] ?? '' })} />
            )}
          </Box>
          <TextField size="small" label="Nama QRIS (mis. QRIS Toko A)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} sx={{ minWidth: 220 }} />
          <TextField size="small" label="Limit / bulan (Rp)" type="number" value={draft.monthlyLimit} onChange={(e) => setDraft({ ...draft, monthlyLimit: e.target.value })} sx={{ width: 170 }} />
          <Button variant="outlined" onClick={() => add.mutate()} disabled={!draft.label.trim() || !draft.imageUrl || add.isPending}>Tambah QRIS</Button>
          {add.isError && <Typography color="error" variant="body2" sx={{ alignSelf: 'center' }}>{errMsg(add.error)}</Typography>}
        </Box>
      )}
    </Paper>
  );
}
