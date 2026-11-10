import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { api, errMsg, fmtDate } from '../api';
import { useRole } from '../auth/useSession';
import { PageHeader } from '../components/common';

interface Chroma { r: number; g: number; b: number; luma: number }
interface Submission {
  id: string;
  agentId: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  nik: string;
  name: string;
  ocrNik: string | null;
  ocrName: string | null;
  rejectReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  agent: { id: string; name: string; phone: string; nik: string | null };
  liveness: {
    colors: string[];
    passed: boolean | null;
    frames: number;
    metrics: { minShift: number; baseline: Chroma; frames: { color: string; vsBaseline: number; vsOthers: number }[] } | null;
  };
}
interface Page { total: number; submissions: Submission[] }

const STATUS_LABEL: Record<string, string> = { PENDING: 'Menunggu', VERIFIED: 'Disetujui', REJECTED: 'Ditolak' };
const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error'> = { PENDING: 'warning', VERIFIED: 'success', REJECTED: 'error' };
const SWATCH: Record<string, string> = { white: '#ffffff', red: '#ff0000', blue: '#0000ff', yellow: '#ffff00' };

/** Private photo through the signed-in API (an <img src> cannot send the token). */
function PrivateImage({ submissionId, kind, height = 220, label }: { submissionId: string; kind: string; height?: number; label?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoke: string | null = null;
    let live = true;
    api
      .get(`/admin/kyc/${submissionId}/files/${kind}`, { responseType: 'blob' })
      .then((r) => {
        if (!live) return;
        revoke = URL.createObjectURL(r.data as Blob);
        setUrl(revoke);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [submissionId, kind]);
  return (
    <Box>
      {label && <Typography variant="caption" color="text.secondary">{label}</Typography>}
      <Box sx={{ height, borderRadius: 1, bgcolor: '#f3f4f6', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ display: 'contents' }}>
            <img src={url} alt={kind} style={{ maxWidth: '100%', maxHeight: height, objectFit: 'contain' }} />
          </a>
        ) : (
          <Typography variant="caption" color="text.secondary">{failed ? 'Gagal memuat' : 'Memuat...'}</Typography>
        )}
      </Box>
    </Box>
  );
}

function Review({ s, onClose }: { s: Submission; onClose: () => void }) {
  const qc = useQueryClient();
  const role = useRole();
  const canReview = role === 'OWNER' || role === 'ADMIN';
  const [nik, setNik] = useState(s.nik);
  const [reason, setReason] = useState('');
  const review = useMutation({
    mutationFn: async (body: { status: 'VERIFIED' | 'REJECTED'; reason?: string; nik?: string }) => (await api.put(`/admin/kyc/${s.id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-kyc'] });
      onClose();
    },
  });
  const m = s.liveness.metrics;
  const colorOrder = ['white', ...s.liveness.colors];
  const mismatch = (a: string | null, b: string) => !!a && a.replace(/\s+/g, ' ').trim().toUpperCase() !== b.replace(/\s+/g, ' ').trim().toUpperCase();

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Verifikasi {s.agent.name} <Chip size="small" color={STATUS_COLOR[s.status]} label={STATUS_LABEL[s.status]} sx={{ ml: 1 }} />
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}><PrivateImage submissionId={s.id} kind="ktp" label="Foto KTP" height={300} /></Grid>
          <Grid item xs={12} md={6}><PrivateImage submissionId={s.id} kind="selfie" label="Selfie (setelah cek wajah)" height={300} /></Grid>
        </Grid>
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead><TableRow><TableCell /><TableCell>Dibaca dari KTP (otomatis)</TableCell><TableCell>Dikonfirmasi agen</TableCell></TableRow></TableHead>
          <TableBody>
            <TableRow>
              <TableCell>NIK</TableCell>
              <TableCell sx={{ fontFamily: 'monospace' }}>{s.ocrNik ?? '-'}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', color: mismatch(s.ocrNik, s.nik) ? 'error.main' : undefined, fontWeight: 700 }}>{s.nik}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Nama</TableCell>
              <TableCell>{s.ocrName ?? '-'}</TableCell>
              <TableCell sx={{ color: mismatch(s.ocrName, s.name) ? 'error.main' : undefined, fontWeight: 700 }}>{s.name}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Nama akun</TableCell>
              <TableCell colSpan={2}>{s.agent.name} · {s.agent.phone}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
          Cek wajah langsung: {s.liveness.passed ? <Chip size="small" color="success" label="lolos" /> : <Chip size="small" color="error" label="tidak lolos" />}
          {m && <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>ambang {m.minShift}</Typography>}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${colorOrder.length}, 1fr)`, gap: 1 }}>
          {colorOrder.map((c, i) => (
            <Box key={i}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: SWATCH[c] ?? '#999', border: '1px solid #ccc' }} />
                <Typography variant="caption">{c}</Typography>
                {i > 0 && m?.frames[i - 1] && (
                  <Typography variant="caption" color={m.frames[i - 1].vsBaseline >= m.minShift && m.frames[i - 1].vsOthers >= m.minShift ? 'success.main' : 'error.main'} sx={{ ml: 'auto' }}>
                    {m.frames[i - 1].vsBaseline.toFixed(3)} / {m.frames[i - 1].vsOthers.toFixed(3)}
                  </Typography>
                )}
              </Box>
              <PrivateImage submissionId={s.id} kind={`frame-${i}`} height={120} />
            </Box>
          ))}
        </Box>

        {s.status === 'PENDING' && canReview && (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField label="NIK yang disimpan (bisa dikoreksi dari foto KTP)" size="small" fullWidth value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, '').slice(0, 16))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Alasan penolakan (wajib bila ditolak, dilihat agen)" size="small" fullWidth value={reason} onChange={(e) => setReason(e.target.value)} />
            </Grid>
          </Grid>
        )}
        {s.status === 'REJECTED' && <Alert severity="error" sx={{ mt: 2 }}>Ditolak: {s.rejectReason}</Alert>}
        {review.isError && <Alert severity="error" sx={{ mt: 2 }}>{errMsg(review.error)}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Tutup</Button>
        {s.status === 'PENDING' && canReview && (
          <>
            <Button color="error" disabled={!reason.trim() || review.isPending} onClick={() => review.mutate({ status: 'REJECTED', reason: reason.trim() })}>Tolak</Button>
            <Button variant="contained" disabled={nik.length !== 16 || review.isPending} onClick={() => review.mutate({ status: 'VERIFIED', nik })}>Setujui</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/** Identity checks for "Plus" services: compare KTP, selfie and live-check frames, then approve or reject. */
export default function KycPage() {
  const [status, setStatus] = useState<'PENDING' | 'VERIFIED' | 'REJECTED' | 'ALL'>('PENDING');
  const [open, setOpen] = useState<Submission | null>(null);
  const q = useQuery({ queryKey: ['admin-kyc', status], queryFn: async () => (await api.get<Page>('/admin/kyc', { params: { status, pageSize: 100 } })).data, refetchInterval: 30_000 });
  const rows = q.data?.submissions ?? [];
  return (
    <Box>
      <PageHeader
        title="Verifikasi Identitas"
        subtitle="Agen yang ingin memakai layanan Plus (mis. top up e-wallet). Cocokkan foto KTP, selfie dan cek wajah, lalu setujui atau tolak."
        actions={
          <Select size="small" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <MenuItem value="PENDING">Menunggu</MenuItem>
            <MenuItem value="VERIFIED">Disetujui</MenuItem>
            <MenuItem value="REJECTED">Ditolak</MenuItem>
            <MenuItem value="ALL">Semua</MenuItem>
          </Select>
        }
      />
      {q.isError && <Alert severity="error" sx={{ mb: 2 }}>{errMsg(q.error)}</Alert>}
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Agen</TableCell>
              <TableCell>NIK</TableCell>
              <TableCell>Nama (KTP)</TableCell>
              <TableCell>Cek wajah</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Dikirim</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">{q.isLoading ? 'Memuat...' : 'Tidak ada data.'}</Typography></TableCell></TableRow>
            )}
            {rows.map((s) => (
              <TableRow key={s.id} hover>
                <TableCell>
                  <RouterLink to={`/agents/${s.agent.id}`} style={{ color: 'inherit', fontWeight: 700 }}>{s.agent.name}</RouterLink>
                  <br />
                  <Typography variant="caption" color="text.secondary">{s.agent.phone}</Typography>
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{s.nik}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.liveness.passed ? <Chip size="small" color="success" label="lolos" /> : <Chip size="small" color="error" label="tidak" />}</TableCell>
                <TableCell><Chip size="small" color={STATUS_COLOR[s.status]} label={STATUS_LABEL[s.status]} /></TableCell>
                <TableCell>{fmtDate(s.createdAt)}</TableCell>
                <TableCell align="right"><Button size="small" variant={s.status === 'PENDING' ? 'contained' : 'outlined'} onClick={() => setOpen(s)}>{s.status === 'PENDING' ? 'Periksa' : 'Lihat'}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      {open && <Review s={open} onClose={() => setOpen(null)} />}
    </Box>
  );
}
