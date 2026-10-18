import { Alert, Box, Checkbox, FormControlLabel, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, Button } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, errMsg, fmtDate, fmtRp } from '../api';
import { useRole } from '../auth/useSession';
import { ConfirmDialog, PageHeader, StatusChip } from '../components/common';
import { FileDropZone, PROOF_ACCEPT } from '../components/DropZone';

interface TopUp {
  id: string;
  orderNumber: number;
  amount: number;
  kodeUnik: number;
  totalTransfer: number;
  bank: string | null;
  status: string;
  claimedAt: string | null;
  paidAt: string | null;
  proofImageUrl: string | null;
  isCredit: boolean;
  rejectReason: string | null;
  createdAt: string;
  expiresAt: string;
  agent: { id: string; name: string; phone: string | null; email: string };
}

export default function TopUpsPage() {
  const [status, setStatus] = useState('OPEN');
  const qc = useQueryClient();
  const role = useRole();
  const q = useQuery({
    queryKey: ['admin-topups', status],
    queryFn: async () => (await api.get<{ topUps: TopUp[] }>('/admin/topups', { params: { status: status === 'OPEN' ? undefined : status } })).data.topUps,
    refetchInterval: 30_000,
  });
  const [confirm, setConfirm] = useState<TopUp | null>(null);
  const [reject, setReject] = useState<TopUp | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [credit, setCredit] = useState(false);
  const [reason, setReason] = useState('');

  const update = useMutation({
    mutationFn: async ({ id, fd }: { id: string; fd: FormData }) => (await api.put(`/admin/topups/${id}`, fd)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-topups'] });
      qc.invalidateQueries({ queryKey: ['admin-agents'] });
      setConfirm(null);
      setReject(null);
      setFile(null);
      setCredit(false);
      setReason('');
    },
  });

  const submitConfirm = () => {
    if (!confirm) return;
    const fd = new FormData();
    fd.append('status', 'PAID');
    fd.append('credit', credit ? 'true' : 'false');
    if (file) fd.append('proof', file);
    update.mutate({ id: confirm.id, fd });
  };
  const submitReject = () => {
    if (!reject) return;
    const fd = new FormData();
    fd.append('status', 'REJECTED');
    fd.append('reason', reason);
    update.mutate({ id: reject.id, fd });
  };

  return (
    <Box>
      <PageHeader
        title="Top Up Saldo"
        subtitle="Cocokkan total transfer (nominal + kode unik) dengan mutasi bank, lalu konfirmasi dengan bukti screenshot."
        actions={
          <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="OPEN">Menunggu & klaim</MenuItem>
            <MenuItem value="CLAIMED">Sudah klaim bayar</MenuItem>
            <MenuItem value="PENDING">Belum klaim</MenuItem>
            <MenuItem value="PAID">Dibayar</MenuItem>
            <MenuItem value="REJECTED">Ditolak</MenuItem>
            <MenuItem value="EXPIRED">Kedaluwarsa</MenuItem>
          </Select>
        }
      />
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Agen</TableCell>
              <TableCell align="right">Nominal</TableCell>
              <TableCell align="right">Kode unik</TableCell>
              <TableCell align="right">Total transfer</TableCell>
              <TableCell>Bank</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Klaim bayar</TableCell>
              <TableCell>Dibuat</TableCell>
              <TableCell>Bukti</TableCell>
              <TableCell align="right">Aksi</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(q.data ?? []).map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.orderNumber}</TableCell>
                <TableCell>
                  <b>{t.agent.name}</b>
                  <br />
                  <Typography variant="caption" color="text.secondary">
                    {t.agent.phone ?? t.agent.email}
                  </Typography>
                </TableCell>
                <TableCell align="right">{fmtRp(t.amount)}</TableCell>
                <TableCell align="right">{t.kodeUnik}</TableCell>
                <TableCell align="right">
                  <b>{fmtRp(t.totalTransfer)}</b>
                </TableCell>
                <TableCell>{t.bank ?? '-'}</TableCell>
                <TableCell>
                  <StatusChip status={t.status} />
                </TableCell>
                <TableCell>{fmtDate(t.claimedAt)}</TableCell>
                <TableCell>{fmtDate(t.createdAt)}</TableCell>
                <TableCell>
                  {t.isCredit ? (
                    <StatusChip status="KREDIT" />
                  ) : t.proofImageUrl ? (
                    <a href={t.proofImageUrl} target="_blank" rel="noreferrer">
                      <img src={t.proofImageUrl} alt="bukti" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} />
                    </a>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {(t.status === 'PENDING' || t.status === 'CLAIMED') && (
                    <>
                      <Button size="small" variant="contained" onClick={() => setConfirm(t)} sx={{ mr: 1 }}>
                        Konfirmasi
                      </Button>
                      <Button size="small" color="error" onClick={() => setReject(t)}>
                        Tolak
                      </Button>
                    </>
                  )}
                  {t.status === 'REJECTED' && t.rejectReason && <Typography variant="caption">{t.rejectReason}</Typography>}
                </TableCell>
              </TableRow>
            ))}
            {q.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                  Tidak ada top up
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <ConfirmDialog
        open={!!confirm}
        title={`Konfirmasi top up #${confirm?.orderNumber ?? ''}`}
        confirmLabel="Konfirmasi Bayar"
        busy={update.isPending}
        disabled={!file && !credit}
        error={update.isError ? errMsg(update.error) : null}
        onClose={() => { setConfirm(null); setFile(null); setCredit(false); update.reset(); }}
        onConfirm={submitConfirm}
        maxWidth="sm"
      >
        {confirm && (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <b>{confirm.agent.name}</b> · Bank {confirm.bank ?? '-'} · total transfer <b>{fmtRp(confirm.totalTransfer)}</b> (kode unik {confirm.kodeUnik})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Unggah screenshot mutasi rekening yang menunjukkan dana masuk sebesar {fmtRp(confirm.totalTransfer)} (JPG/PNG).
            </Typography>
            {credit ? (
              <Alert severity="warning">Konfirmasi kredit: saldo ditambah tanpa bukti transfer dan hutang agen bertambah {fmtRp(confirm.amount)}.</Alert>
            ) : file ? (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <img src={URL.createObjectURL(file)} alt="preview" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                <Box>
                  <Typography variant="body2">{file.name}</Typography>
                  <Button size="small" onClick={() => setFile(null)}>
                    Ganti gambar
                  </Button>
                </Box>
              </Box>
            ) : (
              <FileDropZone accept={PROOF_ACCEPT} onFiles={(f) => setFile(f[0] ?? null)} label="Tarik & letakkan screenshot mutasi bank (JPG/PNG), atau klik untuk pilih" />
            )}
            {role === 'OWNER' && (
              <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={credit} onChange={(e) => setCredit(e.target.checked)} />} label="Konfirmasi sebagai kredit (hutang) — tanpa bukti transfer" />
            )}
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!reject}
        title={`Tolak top up #${reject?.orderNumber ?? ''}`}
        confirmLabel="Tolak"
        confirmColor="error"
        busy={update.isPending}
        error={update.isError ? errMsg(update.error) : null}
        onClose={() => { setReject(null); update.reset(); }}
        onConfirm={submitReject}
      >
        <TextField label="Alasan" fullWidth multiline minRows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </Box>
  );
}
