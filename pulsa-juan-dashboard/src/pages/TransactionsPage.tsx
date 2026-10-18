import { Box, Button, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, errMsg, fmtDate, fmtRp } from '../api';
import { ConfirmDialog, PageHeader, StatusChip } from '../components/common';

interface Trx {
  id: string;
  trxNumber: number;
  segmentLabel: string;
  phoneNumber: string | null;
  customerId: string | null;
  summary: { label: string; value: string }[];
  amountBase: number;
  adminFee: number;
  markupTotal: number;
  total: number;
  status: string;
  serialNumber: string | null;
  failReason: string | null;
  createdAt: string;
  processedAt: string | null;
  agent: { id: string; name: string; phone: string | null };
  package: { code: string; name: string; supplierSku: string | null } | null;
}

export default function TransactionsPage() {
  const [status, setStatus] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-transactions', status, applied],
    queryFn: async () => (await api.get<{ transactions: Trx[]; total: number }>('/admin/transactions', { params: { status, search: applied || undefined, pageSize: 100 } })).data,
    refetchInterval: 20_000,
  });
  const [succeed, setSucceed] = useState<Trx | null>(null);
  const [fail, setFail] = useState<Trx | null>(null);
  const [detail, setDetail] = useState<Trx | null>(null);
  const [sn, setSn] = useState('');
  const [reason, setReason] = useState('');
  const settle = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: object }) => (await api.put(`/admin/transactions/${id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-transactions'] });
      qc.invalidateQueries({ queryKey: ['admin-agents'] });
      setSucceed(null);
      setFail(null);
      setSn('');
      setReason('');
    },
  });

  return (
    <Box>
      <PageHeader
        title="Transaksi"
        subtitle="Antrian pembelian agen. Tandai Sukses (isi SN/token bila ada) atau Gagal (saldo otomatis dikembalikan)."
        actions={
          <>
            <TextField size="small" placeholder="Cari no. HP / ID / agen / #" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setApplied(search)} />
            <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)}>
              <MenuItem value="PENDING">Menunggu</MenuItem>
              <MenuItem value="SUCCESS">Sukses</MenuItem>
              <MenuItem value="FAILED">Gagal</MenuItem>
              <MenuItem value="ALL">Semua</MenuItem>
            </Select>
          </>
        }
      />
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Waktu</TableCell>
              <TableCell>Agen</TableCell>
              <TableCell>Layanan</TableCell>
              <TableCell>Tujuan</TableCell>
              <TableCell>Paket / SKU</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>SN / alasan</TableCell>
              <TableCell align="right">Aksi</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(q.data?.transactions ?? []).map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.trxNumber}</TableCell>
                <TableCell>{fmtDate(t.createdAt)}</TableCell>
                <TableCell>
                  <b>{t.agent.name}</b>
                  <br />
                  <Typography variant="caption" color="text.secondary">{t.agent.phone}</Typography>
                </TableCell>
                <TableCell>{t.segmentLabel}</TableCell>
                <TableCell>{t.phoneNumber ?? t.customerId ?? '-'}</TableCell>
                <TableCell>
                  {t.package ? (
                    <>
                      {t.package.name}
                      <br />
                      <Typography variant="caption" color="text.secondary">{t.package.supplierSku ?? t.package.code}</Typography>
                    </>
                  ) : (
                    <Typography variant="caption" color="text.secondary">{fmtRp(t.amountBase)} + admin {fmtRp(t.adminFee)}</Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <b>{fmtRp(t.total)}</b>
                  {t.markupTotal > 0 && (
                    <>
                      <br />
                      <Typography variant="caption" color="text.secondary">termasuk markup {fmtRp(t.markupTotal)}</Typography>
                    </>
                  )}
                </TableCell>
                <TableCell><StatusChip status={t.status} /></TableCell>
                <TableCell>{t.serialNumber ?? t.failReason ?? '-'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Button size="small" onClick={() => setDetail(t)}>Detail</Button>
                  {t.status === 'PENDING' && (
                    <>
                      <Button size="small" variant="contained" color="success" sx={{ ml: 1 }} onClick={() => setSucceed(t)}>Sukses</Button>
                      <Button size="small" color="error" sx={{ ml: 1 }} onClick={() => setFail(t)}>Gagal</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {q.data?.transactions.length === 0 && (
              <TableRow><TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 4 }}>Tidak ada transaksi</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <ConfirmDialog open={!!succeed} title={`Tandai sukses #${succeed?.trxNumber ?? ''}`} confirmLabel="Sukses" confirmColor="success" busy={settle.isPending} error={settle.isError ? errMsg(settle.error) : null} onClose={() => { setSucceed(null); settle.reset(); }} onConfirm={() => succeed && settle.mutate({ id: succeed.id, body: { status: 'SUCCESS', serialNumber: sn || undefined } })}>
        <TextField label="SN / token (opsional)" fullWidth value={sn} onChange={(e) => setSn(e.target.value)} autoFocus />
      </ConfirmDialog>
      <ConfirmDialog open={!!fail} title={`Tandai gagal #${fail?.trxNumber ?? ''}`} confirmLabel="Gagal & refund" confirmColor="error" busy={settle.isPending} error={settle.isError ? errMsg(settle.error) : null} onClose={() => { setFail(null); settle.reset(); }} onConfirm={() => fail && settle.mutate({ id: fail.id, body: { status: 'FAILED', failReason: reason || undefined } })}>
        <Typography variant="body2" sx={{ mb: 1 }}>Saldo {fmtRp(fail?.total ?? 0)} akan dikembalikan ke agen dan komisi mitra dibatalkan.</Typography>
        <TextField label="Alasan" fullWidth value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </ConfirmDialog>
      <ConfirmDialog open={!!detail} title={`Detail transaksi #${detail?.trxNumber ?? ''}`} confirmLabel="Tutup" onClose={() => setDetail(null)} onConfirm={() => setDetail(null)} maxWidth="sm">
        {detail && (
          <Table size="small">
            <TableBody>
              {detail.summary.map((r, i) => (
                <TableRow key={i}><TableCell sx={{ color: 'text.secondary' }}>{r.label}</TableCell><TableCell align="right">{r.value}</TableCell></TableRow>
              ))}
              <TableRow><TableCell sx={{ color: 'text.secondary' }}>Harga dasar</TableCell><TableCell align="right">{fmtRp(detail.amountBase)}</TableCell></TableRow>
              <TableRow><TableCell sx={{ color: 'text.secondary' }}>Biaya admin</TableCell><TableCell align="right">{fmtRp(detail.adminFee)}</TableCell></TableRow>
              <TableRow><TableCell sx={{ color: 'text.secondary' }}>Markup referral</TableCell><TableCell align="right">{fmtRp(detail.markupTotal)}</TableCell></TableRow>
              <TableRow><TableCell><b>Total</b></TableCell><TableCell align="right"><b>{fmtRp(detail.total)}</b></TableCell></TableRow>
            </TableBody>
          </Table>
        )}
      </ConfirmDialog>
    </Box>
  );
}
