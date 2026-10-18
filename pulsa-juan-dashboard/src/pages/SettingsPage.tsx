import { ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { Alert, Box, Button, Grid, IconButton, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PROVIDERS } from 'pulsa-juan-common';
import { useEffect, useState } from 'react';

import { api, errMsg } from '../api';
import { useRole } from '../auth/useSession';
import { PageHeader } from '../components/common';
import { MediaDropZone } from '../components/DropZone';

interface Config {
  appName: string; csWhatsapp: string; csTelegram: string; topUpMin: number; topUpMax: number; topUpExpiryHours: number;
  briAccountNumber: string; briAccountName: string; bcaAccountNumber: string; bcaAccountName: string; banners: { imageUrl: string; linkUrl?: string }[]; maxReferralMarkup: number;
}
interface Prefix { id: string; prefix: string; provider: string; isActive: boolean }

export default function SettingsPage() {
  const role = useRole();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-config'], queryFn: async () => (await api.get<Config>('/admin/config')).data });
  const [form, setForm] = useState<Config | null>(null);
  useEffect(() => { if (q.data) setForm(q.data); }, [q.data]);
  const save = useMutation({ mutationFn: async () => (await api.put('/admin/config', { ...form, topUpMin: Number(form!.topUpMin), topUpMax: Number(form!.topUpMax), topUpExpiryHours: Number(form!.topUpExpiryHours), maxReferralMarkup: Number(form!.maxReferralMarkup) })).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config'] }) });
  const prefixes = useQuery({ queryKey: ['admin-prefixes'], queryFn: async () => (await api.get<{ prefixes: Prefix[] }>('/admin/provider-prefixes')).data.prefixes });
  const [newPrefix, setNewPrefix] = useState({ prefix: '', provider: 'TELKOMSEL' });
  const addPrefix = useMutation({ mutationFn: async () => (await api.post('/admin/provider-prefixes', newPrefix)).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-prefixes'] }); setNewPrefix({ prefix: '', provider: 'TELKOMSEL' }); } });
  const delPrefix = useMutation({ mutationFn: async (id: string) => api.delete(`/admin/provider-prefixes/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-prefixes'] }) });
  const canEdit = role !== 'STAFF';
  if (!form) return null;
  const f = (k: keyof Config) => ({ value: String(form[k] ?? ''), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }), size: 'small' as const, fullWidth: true, disabled: !canEdit });
  const moveBanner = (i: number, d: number) => { const b = [...form.banners]; const j = i + d; if (j < 0 || j >= b.length) return; [b[i], b[j]] = [b[j], b[i]]; setForm({ ...form, banners: b }); };

  return (
    <Box>
      <PageHeader title="Pengaturan" subtitle="Rekening bank tujuan top up, kontak CS, batas top up, banner beranda dan prefix operator." actions={canEdit && <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Menyimpan...' : 'Simpan pengaturan'}</Button>} />
      {save.isSuccess && <Alert severity="success" sx={{ mb: 2 }}>Tersimpan.</Alert>}
      {save.isError && <Alert severity="error" sx={{ mb: 2 }}>{errMsg(save.error)}</Alert>}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Rekening tujuan top up</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={6}><TextField label="No. rekening BRI" {...f('briAccountNumber')} /></Grid>
              <Grid item xs={6}><TextField label="Atas nama (BRI)" {...f('briAccountName')} /></Grid>
              <Grid item xs={6}><TextField label="No. rekening BCA" {...f('bcaAccountNumber')} /></Grid>
              <Grid item xs={6}><TextField label="Atas nama (BCA)" {...f('bcaAccountName')} /></Grid>
            </Grid>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 3, mb: 1.5 }}>Customer service & aplikasi</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={6}><TextField label="Nama aplikasi" {...f('appName')} /></Grid>
              <Grid item xs={6}><TextField label="WhatsApp CS (08xx)" {...f('csWhatsapp')} /></Grid>
              <Grid item xs={6}><TextField label="Telegram CS (username)" {...f('csTelegram')} /></Grid>
              <Grid item xs={6}><TextField label="Markup referral maks (Rp)" type="number" {...f('maxReferralMarkup')} /></Grid>
              <Grid item xs={4}><TextField label="Top up min (Rp)" type="number" {...f('topUpMin')} /></Grid>
              <Grid item xs={4}><TextField label="Top up maks (Rp)" type="number" {...f('topUpMax')} /></Grid>
              <Grid item xs={4}><TextField label="Kedaluwarsa (jam)" type="number" {...f('topUpExpiryHours')} /></Grid>
            </Grid>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Banner beranda (carousel, geser tiap 2 detik)</Typography>
            {form.banners.map((b, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <img src={b.imageUrl} alt="" style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 6 }} />
                <TextField size="small" placeholder="Link (opsional)" value={b.linkUrl ?? ''} onChange={(e) => { const bs = [...form.banners]; bs[i] = { ...b, linkUrl: e.target.value }; setForm({ ...form, banners: bs }); }} sx={{ flex: 1 }} disabled={!canEdit} />
                <IconButton size="small" onClick={() => moveBanner(i, -1)} disabled={!canEdit}><ArrowUpward fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => moveBanner(i, 1)} disabled={!canEdit}><ArrowDownward fontSize="small" /></IconButton>
                <IconButton size="small" color="error" onClick={() => setForm({ ...form, banners: form.banners.filter((_, j) => j !== i) })} disabled={!canEdit}><Delete fontSize="small" /></IconButton>
              </Box>
            ))}
            {canEdit && <MediaDropZone folder="banners" multiple onUploaded={(urls) => setForm({ ...form, banners: [...form.banners, ...urls.map((imageUrl) => ({ imageUrl }))] })} />}
            <Typography variant="caption" color="text.secondary">Rasio 16:9 disarankan. Jangan lupa tekan "Simpan pengaturan".</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Prefix operator (deteksi otomatis nomor HP)</Typography>
            {canEdit && (
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                <TextField size="small" label="Prefix (mis. 0812)" value={newPrefix.prefix} onChange={(e) => setNewPrefix({ ...newPrefix, prefix: e.target.value.replace(/\D/g, '') })} />
                <Select size="small" value={newPrefix.provider} onChange={(e) => setNewPrefix({ ...newPrefix, provider: e.target.value })}>{PROVIDERS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}</Select>
                <Button variant="outlined" onClick={() => addPrefix.mutate()} disabled={newPrefix.prefix.length < 4}>Tambah</Button>
                {addPrefix.isError && <Typography color="error" variant="body2" sx={{ alignSelf: 'center' }}>{errMsg(addPrefix.error)}</Typography>}
              </Box>
            )}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {PROVIDERS.map((prov) => (
                <Box key={prov} sx={{ minWidth: 140 }}>
                  <Typography variant="subtitle2">{prov}</Typography>
                  <Table size="small"><TableHead><TableRow><TableCell>Prefix</TableCell><TableCell /></TableRow></TableHead><TableBody>
                    {(prefixes.data ?? []).filter((p) => p.provider === prov).map((p) => (
                      <TableRow key={p.id}><TableCell>{p.prefix}</TableCell><TableCell align="right" sx={{ p: 0 }}>{canEdit && <IconButton size="small" onClick={() => delPrefix.mutate(p.id)}><Delete fontSize="inherit" /></IconButton>}</TableCell></TableRow>
                    ))}
                  </TableBody></Table>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
