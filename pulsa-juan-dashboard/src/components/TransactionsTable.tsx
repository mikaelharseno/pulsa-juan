import { Box, Button, Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { api, errMsg, fmtDate, fmtRp } from '../api';
import { ConfirmDialog, StatusChip } from './common';

export interface Trx {
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
  fulfillmentMode: 'MANUAL' | 'AUTO';
  provider: string | null;
  serialNumber: string | null;
  failReason: string | null;
  refundReason: string | null;
  supplierMessage: string | null;
  createdAt: string;
  processedAt: string | null;
  refundedAt: string | null;
  agent: { id: string; name: string; phone: string | null };
  package: { code: string; name: string; supplierSku: string | null } | null;
  supplierAdmin?: number;
  billCheck?: {
    number: number; customerName: string | null; periode: string | null; amountDue: number; supplierAdmin: number; ourFee: number;
    biller: { key: string; name: string; payCode: string };
  } | null;
}

interface TrxPage {
  transactions: Trx[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;
const STATUS_FILTERS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'PENDING', label: 'Menunggu' },
  { value: 'SUCCESS', label: 'Sukses' },
  { value: 'FAILED', label: 'Gagal' },
  { value: 'REFUNDED', label: 'Direfund' },
];

/**
 * "Isi pulsa" order log: newest first, all statuses by default, "Muat lagi"
 * paging. With `agentId` it is scoped to one agent (agent detail page and
 * /transactions?agentId=…).
 */
export function TransactionsTable({ agentId, showAgent = true }: { agentId?: string; showAgent?: boolean }) {
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['admin-transactions', status, applied, agentId ?? null],
    queryFn: async ({ pageParam }) =>
      (await api.get<TrxPage>('/admin/transactions', { params: { status, search: applied || undefined, agentId, page: pageParam, pageSize: PAGE_SIZE } })).data,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    refetchInterval: 20_000,
  });
  const rows = q.data?.pages.flatMap((p) => p.transactions) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;

  const [succeed, setSucceed] = useState<Trx | null>(null);
  const [fail, setFail] = useState<Trx | null>(null);
  const [refund, setRefund] = useState<Trx | null>(null);
  const [detail, setDetail] = useState<Trx | null>(null);
  const [sn, setSn] = useState('');
  const [reason, setReason] = useState('');
  const settle = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: object }) => (await api.put(`/admin/transactions/${id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-transactions'] });
      qc.invalidateQueries({ queryKey: ['admin-agents'] });
      qc.invalidateQueries({ queryKey: ['admin-agent'] });
      setSucceed(null);
      setFail(null);
      setRefund(null);
      setSn('');
      setReason('');
    },
  });
  const closeDialogs = () => {
    setSucceed(null);
    setFail(null);
    setRefund(null);
    setReason('');
    settle.reset();
  };
  const cols = showAgent ? 11 : 10;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <ToggleButtonGroup size="small" exclusive value={status} onChange={(_, v) => v && setStatus(v)}>
          {STATUS_FILTERS.map((f) => (
            <ToggleButton key={f.value} value={f.value} sx={{ px: 1.5 }}>
              {f.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          size="small"
          placeholder={showAgent ? 'Cari no. HP / ID / agen / SN / #' : 'Cari no. HP / ID / SN / #'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setApplied(search)}
          onBlur={() => setApplied(search)}
          sx={{ minWidth: 240 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {rows.length} dari {total} order · terbaru di atas
        </Typography>
      </Box>
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Waktu</TableCell>
              {showAgent && <TableCell>Agen</TableCell>}
              <TableCell>Layanan</TableCell>
              <TableCell>Tujuan</TableCell>
              <TableCell>Paket / SKU</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Proses</TableCell>
              <TableCell>SN / alasan</TableCell>
              <TableCell align="right">Aksi</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.trxNumber}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(t.createdAt)}</TableCell>
                {showAgent && (
                  <TableCell>
                    <RouterLink to={`/agents/${t.agent.id}`} style={{ color: 'inherit', fontWeight: 700 }}>
                      {t.agent.name}
                    </RouterLink>
                    <br />
                    <Typography variant="caption" color="text.secondary">{t.agent.phone}</Typography>
                  </TableCell>
                )}
                <TableCell>{t.segmentLabel}</TableCell>
                <TableCell>{t.phoneNumber ?? t.customerId ?? '-'}</TableCell>
                <TableCell>
                  {t.package ? (
                    <>
                      {t.package.name}
                      <br />
                      <Typography variant="caption" color="text.secondary">{t.package.supplierSku ?? t.package.code}</Typography>
                    </>
                  ) : t.billCheck ? (
                    <>
                      Tagihan {fmtRp(t.amountBase)}
                      <br />
                      <Typography variant="caption" color="text.secondary">{t.billCheck.biller.payCode || t.billCheck.biller.key}</Typography>
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
                <TableCell>
                  <Chip size="small" variant="outlined" label={t.fulfillmentMode === 'AUTO' ? `Otomatis · ${t.provider ?? '-'}` : t.provider && t.provider !== 'manual' ? `Manual · ${t.provider}` : 'Manual'} />
                </TableCell>
                <TableCell>
                  {t.status === 'REFUNDED' ? (
                    <>
                      {t.refundReason ?? '-'}
                      {t.serialNumber && (
                        <>
                          <br />
                          <Typography variant="caption" color="text.secondary">SN {t.serialNumber}</Typography>
                        </>
                      )}
                    </>
                  ) : (
                    t.serialNumber ?? t.failReason ?? '-'
                  )}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Button size="small" onClick={() => setDetail(t)}>Detail</Button>
                  {t.status === 'PENDING' && (
                    <>
                      <Button size="small" variant="contained" color="success" sx={{ ml: 1 }} onClick={() => setSucceed(t)}>Sukses</Button>
                      <Button size="small" color="error" sx={{ ml: 1 }} onClick={() => setFail(t)}>Gagal</Button>
                    </>
                  )}
                  {t.status === 'SUCCESS' && (
                    <Button size="small" color="warning" sx={{ ml: 1 }} onClick={() => setRefund(t)}>Refund</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {q.isSuccess && rows.length === 0 && (
              <TableRow><TableCell colSpan={cols} align="center" sx={{ color: 'text.secondary', py: 4 }}>Tidak ada order</TableCell></TableRow>
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

      <ConfirmDialog open={!!succeed} title={`Tandai sukses #${succeed?.trxNumber ?? ''}`} confirmLabel="Sukses" confirmColor="success" busy={settle.isPending} error={settle.isError ? errMsg(settle.error) : null} onClose={closeDialogs} onConfirm={() => succeed && settle.mutate({ id: succeed.id, body: { status: 'SUCCESS', serialNumber: sn || undefined } })}>
        <TextField label="SN / token (opsional)" fullWidth value={sn} onChange={(e) => setSn(e.target.value)} autoFocus />
      </ConfirmDialog>
      <ConfirmDialog open={!!fail} title={`Tandai gagal #${fail?.trxNumber ?? ''}`} confirmLabel="Gagal & refund" confirmColor="error" busy={settle.isPending} error={settle.isError ? errMsg(settle.error) : null} onClose={closeDialogs} onConfirm={() => fail && settle.mutate({ id: fail.id, body: { status: 'FAILED', failReason: reason || undefined } })}>
        <Typography variant="body2" sx={{ mb: 1 }}>Saldo {fmtRp(fail?.total ?? 0)} akan dikembalikan ke agen dan komisi mitra dibatalkan.</Typography>
        <TextField label="Alasan" fullWidth value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </ConfirmDialog>
      <ConfirmDialog open={!!refund} title={`Refund order sukses #${refund?.trxNumber ?? ''}`} confirmLabel="Refund" confirmColor="warning" busy={settle.isPending} disabled={!reason.trim()} error={settle.isError ? errMsg(settle.error) : null} onClose={closeDialogs} onConfirm={() => refund && settle.mutate({ id: refund.id, body: { status: 'REFUNDED', refundReason: reason.trim() } })}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Order ini sudah sukses. Saldo {fmtRp(refund?.total ?? 0)} dikembalikan ke agen; komisi mitra dibatalkan, dan komisi yang sudah diklaim ditarik dari saldo pengundang (kekurangan dicatat sebagai hutang).
        </Typography>
        <TextField label="Alasan refund" fullWidth value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </ConfirmDialog>
      <ConfirmDialog open={!!detail} title={`Detail order #${detail?.trxNumber ?? ''}`} confirmLabel="Tutup" onClose={() => setDetail(null)} onConfirm={() => setDetail(null)} maxWidth="sm">
        {detail && (
          <Table size="small">
            <TableBody>
              {detail.summary.map((r, i) => (
                <TableRow key={i}><TableCell sx={{ color: 'text.secondary' }}>{r.label}</TableCell><TableCell align="right">{r.value}</TableCell></TableRow>
              ))}
              <TableRow><TableCell sx={{ color: 'text.secondary' }}>Harga dasar</TableCell><TableCell align="right">{fmtRp(detail.amountBase)}</TableCell></TableRow>
              <TableRow><TableCell sx={{ color: 'text.secondary' }}>Biaya admin</TableCell><TableCell align="right">{fmtRp(detail.adminFee)}{detail.billCheck && <Typography component="span" variant="caption" color="text.secondary"> (supplier {fmtRp(detail.billCheck.supplierAdmin)} + kita {fmtRp(detail.billCheck.ourFee)})</Typography>}</TableCell></TableRow>
              <TableRow><TableCell sx={{ color: 'text.secondary' }}>Markup referral</TableCell><TableCell align="right">{fmtRp(detail.markupTotal)}</TableCell></TableRow>
              <TableRow><TableCell><b>Total</b></TableCell><TableCell align="right"><b>{fmtRp(detail.total)}</b></TableCell></TableRow>
              <TableRow><TableCell sx={{ color: 'text.secondary' }}>Status</TableCell><TableCell align="right"><StatusChip status={detail.status} /></TableCell></TableRow>
              <TableRow><TableCell sx={{ color: 'text.secondary' }}>Diproses</TableCell><TableCell align="right">{fmtDate(detail.processedAt)}</TableCell></TableRow>
              {detail.billCheck && (
                <TableRow><TableCell sx={{ color: 'text.secondary' }}>Tagihan</TableCell><TableCell align="right">{detail.billCheck.biller.name} · cek C{detail.billCheck.number} · kode bayar <code>{detail.billCheck.biller.payCode || '-'}</code></TableCell></TableRow>
              )}
              {detail.billCheck && detail.serialNumber && (
                <TableRow><TableCell sx={{ color: 'text.secondary' }}>No. Referensi</TableCell><TableCell align="right" sx={{ fontFamily: 'monospace' }}>{detail.serialNumber}</TableCell></TableRow>
              )}
              {detail.provider === 'otomax' && (
                <TableRow><TableCell sx={{ color: 'text.secondary' }}>OtomaX (refID #{detail.trxNumber})</TableCell><TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-word' }}>{detail.supplierMessage ?? 'belum ada balasan'}</TableCell></TableRow>
              )}
              {detail.refundedAt && (
                <TableRow><TableCell sx={{ color: 'text.secondary' }}>Direfund</TableCell><TableCell align="right">{fmtDate(detail.refundedAt)} · {detail.refundReason}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </ConfirmDialog>
    </Box>
  );
}
