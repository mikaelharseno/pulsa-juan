import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { api, errMsg, fmtDate, fmtRp } from '../api';
import { useRole } from '../auth/useSession';
import { ConfirmDialog, StatusChip } from './common';
import { FileDropZone, PROOF_ACCEPT } from './DropZone';

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
  agent: { id: string; name: string; phone: string | null; email: string | null };
}

interface TopUpPage {
  topUps: TopUp[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;

/**
 * Saldo top-up requests with manual confirmation. The agent is credited the
 * whole transfer (nominal + kode unik). With `agentId` it is scoped to one agent.
 */
export function TopUpsTable({ agentId, showAgent = true, defaultStatus = 'OPEN' }: { agentId?: string; showAgent?: boolean; defaultStatus?: string }) {
  const [status, setStatus] = useState(defaultStatus);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const qc = useQueryClient();
  const role = useRole();
  const q = useInfiniteQuery({
    queryKey: ['admin-topups', status, applied, agentId ?? null],
    queryFn: async ({ pageParam }) =>
      (await api.get<TopUpPage>('/admin/topups', { params: { status, search: applied || undefined, agentId, page: pageParam, pageSize: PAGE_SIZE } })).data,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    refetchInterval: 30_000,
  });
  const rows = q.data?.pages.flatMap((p) => p.topUps) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;
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
      qc.invalidateQueries({ queryKey: ['admin-agent'] });
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
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)}>
          <MenuItem value="OPEN">Menunggu & klaim</MenuItem>
          <MenuItem value="CLAIMED">Sudah klaim bayar</MenuItem>
          <MenuItem value="PENDING">Belum klaim</MenuItem>
          <MenuItem value="PAID">Dibayar</MenuItem>
          <MenuItem value="REJECTED">Ditolak</MenuItem>
          <MenuItem value="EXPIRED">Kedaluwarsa</MenuItem>
          <MenuItem value="ALL">Semua</MenuItem>
        </Select>
        <TextField
          size="small"
          placeholder={showAgent ? 'Cari agen / HP / # / total transfer' : 'Cari # / total transfer'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setApplied(search)}
          onBlur={() => setApplied(search)}
          sx={{ minWidth: 240 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {rows.length} dari {total} · terbaru di atas
        </Typography>
      </Box>
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              {showAgent && <TableCell>Agen</TableCell>}
              <TableCell align="right">Nominal</TableCell>
              <TableCell align="right">Kode unik</TableCell>
              <TableCell align="right">Total transfer = saldo masuk</TableCell>
              <TableCell>Bank</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Klaim bayar</TableCell>
              <TableCell>Dibuat</TableCell>
              <TableCell>Bukti</TableCell>
              <TableCell align="right">Aksi</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.orderNumber}</TableCell>
                {showAgent && (
                  <TableCell>
                    <RouterLink to={`/agents/${t.agent.id}`} style={{ color: 'inherit', fontWeight: 700 }}>
                      {t.agent.name}
                    </RouterLink>
                    <br />
                    <Typography variant="caption" color="text.secondary">
                      {t.agent.phone ?? t.agent.email}
                    </Typography>
                  </TableCell>
                )}
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
            {q.isSuccess && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={showAgent ? 11 : 10} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                  Tidak ada top up
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      {q.hasNextPage && (
        <Box sx={{ textAlign: 'center', mt: 1.5 }}>
          <Button variant="outlined" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? 'Memuat...' : 'Muat lagi'}
          </Button>
        </Box>
      )}

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
              <b>{confirm.agent.name}</b> · Bank {confirm.bank ?? '-'} · total transfer <b>{fmtRp(confirm.totalTransfer)}</b> ({fmtRp(confirm.amount)} + kode unik {confirm.kodeUnik})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Saldo agen bertambah {fmtRp(confirm.totalTransfer)} (kode unik ikut masuk). Unggah screenshot mutasi rekening yang menunjukkan dana masuk sebesar {fmtRp(confirm.totalTransfer)} (JPG/PNG).
            </Typography>
            {credit ? (
              <Alert severity="warning">Konfirmasi kredit: saldo ditambah tanpa bukti transfer dan hutang agen bertambah {fmtRp(confirm.totalTransfer)}.</Alert>
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
