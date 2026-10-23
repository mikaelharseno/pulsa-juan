import { ArrowBack } from '@mui/icons-material';
import { Autocomplete, Box, Button, Chip, IconButton, Paper, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { api, errMsg, fmtDate, fmtRp } from '../api';
import { useRole } from '../auth/useSession';
import { ConfirmDialog, StatusChip } from '../components/common';
import { FileDropZone, PROOF_ACCEPT } from '../components/DropZone';
import { TopUpsTable } from '../components/TopUpsTable';
import { TransactionsTable } from '../components/TransactionsTable';
import type { AgentRow } from './AgentsPage';

interface LedgerEntry { id: string; type: string; delta: number; balanceAfter: number; note: string | null; referenceId: string | null; createdAt: string }

interface AgentDetail {
  id: string; name: string; email: string | null; phone: string; nik: string | null; avatarUrl: string | null; status: string;
  saldo: number; hutang: number; poin: number; saldoKomisi: number; commisionUniqueId: string; referralMarkup: number; referrerMarkup: number;
  googleSub: string | null; hasPassword: boolean; hasPin: boolean; otpPending: boolean; pinFailedAttempts: number; pinLockedUntil: string | null;
  confirmationCodeExpiresAt: string | null; confirmationCodePurpose: string | null; confirmationCodeSentAt: string | null; phoneVerifiedAt: string | null;
  joinedAt: string; createdAt: string; updatedAt: string;
  upline: { commisionAmount: number; agent: { id: string; name: string; commisionUniqueId: string } } | null;
  downline: { id: string; commisionAmount: number; createdAt: string; agent: { id: string; name: string; commisionUniqueId: string } }[];
  unclaimedCommission: number;
  transactionCount: number;
  topUpCount: number;
}

const TABS = ['profil', 'saldo', 'order', 'topup', 'referral'] as const;
type TabKey = (typeof TABS)[number];

const LEDGER_LABEL: Record<string, string> = { TOPUP: 'Top up', PURCHASE: 'Order', REFUND: 'Refund', ADJUSTMENT: 'Penyesuaian', COMMISSION: 'Komisi' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell sx={{ color: 'text.secondary', width: 260, verticalAlign: 'top' }}>{label}</TableCell>
      <TableCell>{children}</TableCell>
    </TableRow>
  );
}

function LedgerTable({ agentId }: { agentId: string }) {
  const q = useInfiniteQuery({
    queryKey: ['admin-agent', agentId, 'ledger'],
    queryFn: async ({ pageParam }) =>
      (await api.get<{ entries: LedgerEntry[]; total: number; page: number; pageSize: number }>(`/admin/agents/${agentId}/ledger`, { params: { page: pageParam } })).data,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const rows = q.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <>
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Waktu</TableCell><TableCell>Jenis</TableCell><TableCell align="right">Mutasi</TableCell><TableCell align="right">Saldo setelah</TableCell><TableCell>Catatan</TableCell></TableRow></TableHead>
          <TableBody>
            {rows.map((l) => (
              <TableRow key={l.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(l.createdAt)}</TableCell>
                <TableCell>{LEDGER_LABEL[l.type] ?? l.type}</TableCell>
                <TableCell align="right" sx={{ color: l.delta < 0 ? 'error.main' : 'success.main', fontWeight: 600 }}>{l.delta > 0 ? '+' : ''}{fmtRp(l.delta)}</TableCell>
                <TableCell align="right">{fmtRp(l.balanceAfter)}</TableCell>
                <TableCell>{l.note}</TableCell>
              </TableRow>
            ))}
            {q.isSuccess && rows.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>Belum ada mutasi</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>
      {q.hasNextPage && (
        <Box sx={{ textAlign: 'center', mt: 1.5 }}>
          <Button variant="outlined" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>Muat lagi</Button>
        </Box>
      )}
    </>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const tab: TabKey = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as TabKey) : 'profil';
  const navigate = useNavigate();
  const role = useRole();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['admin-agent', id], queryFn: async () => (await api.get<AgentDetail>(`/admin/agents/${id}`)).data });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-agents'] });
    qc.invalidateQueries({ queryKey: ['admin-agent'] });
  };

  const [adjust, setAdjust] = useState(false);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const adjustM = useMutation({ mutationFn: async () => (await api.post(`/admin/agents/${id}/adjust-saldo`, { delta: Number(delta), note })).data, onSuccess: () => { refresh(); setAdjust(false); setDelta(''); setNote(''); } });

  const [hutang, setHutang] = useState(false);
  const [hutangAmount, setHutangAmount] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const hutangM = useMutation({
    mutationFn: async () => { const fd = new FormData(); fd.append('amount', hutangAmount); if (proof) fd.append('proof', proof); return (await api.post(`/admin/agents/${id}/hutang-payment`, fd)).data; },
    onSuccess: () => { refresh(); setHutang(false); setHutangAmount(''); setProof(null); },
  });

  const [transfer, setTransfer] = useState(false);
  const [targetSearch, setTargetSearch] = useState('');
  const [target, setTarget] = useState<AgentRow | null>(null);
  const targets = useQuery({
    queryKey: ['admin-agents', targetSearch, 'ALL'],
    queryFn: async () => (await api.get<{ agents: AgentRow[] }>('/admin/agents', { params: { search: targetSearch || undefined } })).data.agents,
    enabled: transfer,
  });
  const transferM = useMutation({ mutationFn: async () => (await api.post(`/admin/agents/${id}/transfer-commission-id`, { toAgentId: target!.id })).data, onSuccess: () => { refresh(); setTransfer(false); setTarget(null); } });

  const [editNik, setEditNik] = useState(false);
  const [nik, setNik] = useState('');
  const nikM = useMutation({ mutationFn: async () => (await api.put(`/admin/agents/${id}`, { nik: nik.trim() || null })).data, onSuccess: () => { refresh(); setEditNik(false); } });

  const statusM = useMutation({ mutationFn: async (s: string) => (await api.put(`/admin/agents/${id}`, { status: s })).data, onSuccess: refresh });
  const a = detail.data;
  if (detail.isError) return <Typography color="error">{errMsg(detail.error)}</Typography>;
  if (!a || !id) return <Typography color="text.secondary">Memuat…</Typography>;

  const authMethods = [a.hasPin && 'PIN', a.hasPassword && 'Password', a.googleSub && 'Google'].filter(Boolean).join(', ') || '-';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <IconButton onClick={() => navigate('/agents')} size="small"><ArrowBack /></IconButton>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>{a.name}</Typography>
        <StatusChip status={a.status} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ ml: 5 }}>{a.phone}{a.email ? ` · ${a.email}` : ''} · bergabung {fmtDate(a.joinedAt)}</Typography>
      <Box sx={{ display: 'flex', gap: 1, my: 1.5, ml: 5, flexWrap: 'wrap' }}>
        <Chip size="small" label={`Saldo ${fmtRp(a.saldo)}`} color="primary" />
        <Chip size="small" label={`Hutang ${fmtRp(a.hutang)}`} color={a.hutang > 0 ? 'error' : 'default'} />
        <Chip size="small" label={`Poin ${a.poin}`} />
        <Chip size="small" label={`Komisi belum diklaim ${fmtRp(a.unclaimedCommission)}`} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" onClick={() => setAdjust(true)}>Sesuaikan saldo</Button>
        <Button size="small" variant="outlined" color={a.status === 'ACTIVE' ? 'error' : 'success'} onClick={() => statusM.mutate(a.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE')}>{a.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}</Button>
        {role === 'OWNER' && <Button size="small" variant="outlined" onClick={() => setHutang(true)} disabled={a.hutang <= 0}>Bayar hutang</Button>}
        {role === 'OWNER' && <Button size="small" variant="outlined" color="warning" onClick={() => setTransfer(true)}>Pindahkan kode komisi</Button>}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setParams({ tab: v }, { replace: true })} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }} variant="scrollable">
        <Tab value="profil" label="Profil" />
        <Tab value="saldo" label="Mutasi Saldo" />
        <Tab value="order" label={`Order Isi Pulsa (${a.transactionCount})`} />
        <Tab value="topup" label={`Top Up Saldo (${a.topUpCount})`} />
        <Tab value="referral" label={`Referral (${a.downline.length})`} />
      </Tabs>

      {tab === 'profil' && (
        <Paper sx={{ maxWidth: 820 }}>
          <Table size="small">
            <TableBody>
              <Field label="ID">{a.id}</Field>
              <Field label="Nama">{a.name}</Field>
              <Field label="Nomor HP">{a.phone} {a.phoneVerifiedAt ? <Chip size="small" color="success" label={`terverifikasi ${fmtDate(a.phoneVerifiedAt)}`} sx={{ ml: 1 }} /> : <Chip size="small" label="belum verifikasi" sx={{ ml: 1 }} />}</Field>
              <Field label="NIK">
                <span style={{ fontFamily: 'monospace' }}>{a.nik ?? '-'}</span>
                <Button size="small" sx={{ ml: 1 }} onClick={() => { setNik(a.nik ?? ''); setEditNik(true); }}>Ubah</Button>
              </Field>
              <Field label="Email">{a.email ?? '-'}</Field>
              <Field label="Tanggal bergabung">{fmtDate(a.joinedAt)}</Field>
              <Field label="Metode masuk">{authMethods}</Field>
              <Field label="PIN">
                {a.hasPin ? 'Sudah diatur' : 'Belum diatur'}
                {a.pinLockedUntil && new Date(a.pinLockedUntil) > new Date() && <Chip size="small" color="error" label={`terkunci s/d ${fmtDate(a.pinLockedUntil)}`} sx={{ ml: 1 }} />}
                {a.pinFailedAttempts > 0 && <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{a.pinFailedAttempts} percobaan salah</Typography>}
              </Field>
              <Field label="Kode OTP (konfirmasi)">
                {a.otpPending ? `Aktif (${a.confirmationCodePurpose}) s/d ${fmtDate(a.confirmationCodeExpiresAt)}` : 'Tidak ada'}
                {a.confirmationCodeSentAt && <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>terakhir dikirim {fmtDate(a.confirmationCodeSentAt)}</Typography>}
              </Field>
              <Field label="Saldo">{fmtRp(a.saldo)}</Field>
              <Field label="Poin">{a.poin}</Field>
              <Field label="Hutang">{fmtRp(a.hutang)}</Field>
              <Field label="Komisi diterima (total)">{fmtRp(a.saldoKomisi)}</Field>
              <Field label="Kode referral (crown)"><code>{a.commisionUniqueId}</code> · markup untuk mitra {fmtRp(a.referralMarkup)}/trx</Field>
              <Field label="Pengundang (referrer)">
                {a.upline ? (
                  <><RouterLink to={`/agents/${a.upline.agent.id}`}>{a.upline.agent.name}</RouterLink> · referrer markup {fmtRp(a.referrerMarkup)}/trx</>
                ) : '-'}
              </Field>
              <Field label="Diperbarui">{fmtDate(a.updatedAt)}</Field>
            </TableBody>
          </Table>
        </Paper>
      )}
      {tab === 'saldo' && <LedgerTable agentId={id} />}
      {tab === 'order' && <TransactionsTable agentId={id} showAgent={false} />}
      {tab === 'topup' && <TopUpsTable agentId={id} showAgent={false} defaultStatus="ALL" />}
      {tab === 'referral' && (
        <Paper sx={{ overflowX: 'auto', maxWidth: 820 }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Mitra</TableCell><TableCell>Kode</TableCell><TableCell align="right">Markup / trx</TableCell><TableCell>Bergabung</TableCell></TableRow></TableHead>
            <TableBody>
              {a.downline.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell><RouterLink to={`/agents/${d.agent.id}`}>{d.agent.name}</RouterLink></TableCell>
                  <TableCell><code>{d.agent.commisionUniqueId}</code></TableCell>
                  <TableCell align="right">{fmtRp(d.commisionAmount)}</TableCell>
                  <TableCell>{fmtDate(d.createdAt)}</TableCell>
                </TableRow>
              ))}
              {a.downline.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>Belum ada mitra</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}

      <ConfirmDialog open={adjust} title="Sesuaikan saldo" confirmLabel="Simpan" busy={adjustM.isPending} disabled={!delta || !note} error={adjustM.isError ? errMsg(adjustM.error) : null} onClose={() => { setAdjust(false); adjustM.reset(); }} onConfirm={() => adjustM.mutate()}>
        <TextField label="Delta (negatif untuk mengurangi)" type="number" fullWidth margin="dense" value={delta} onChange={(e) => setDelta(e.target.value)} />
        <TextField label="Catatan" fullWidth margin="dense" value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmDialog>
      <ConfirmDialog open={hutang} title="Pembayaran hutang" confirmLabel="Catat pembayaran" busy={hutangM.isPending} disabled={!hutangAmount} error={hutangM.isError ? errMsg(hutangM.error) : null} onClose={() => { setHutang(false); hutangM.reset(); }} onConfirm={() => hutangM.mutate()} maxWidth="sm">
        <TextField label="Nominal" type="number" fullWidth margin="dense" value={hutangAmount} onChange={(e) => setHutangAmount(e.target.value)} helperText={`Hutang saat ini ${fmtRp(a.hutang)}`} />
        {proof ? <Typography variant="body2">{proof.name} <Button size="small" onClick={() => setProof(null)}>ganti</Button></Typography> : <FileDropZone accept={PROOF_ACCEPT} onFiles={(f) => setProof(f[0] ?? null)} label="Bukti transfer (opsional, JPG/PNG)" compact />}
      </ConfirmDialog>
      <ConfirmDialog open={transfer} title="Pindahkan kode komisi (crown)" confirmLabel="Pindahkan" confirmColor="warning" busy={transferM.isPending} disabled={!target} error={transferM.isError ? errMsg(transferM.error) : null} onClose={() => { setTransfer(false); transferM.reset(); }} onConfirm={() => transferM.mutate()}>
        <Typography variant="body2" sx={{ mb: 1 }}>Posisi kode <code>{a.commisionUniqueId}</code> (pengundang, jaringan mitra dan komisi belum diklaim) berpindah ke agen tujuan. Agen asal mendapat kode baru dan posisi lama agen tujuan.</Typography>
        <Autocomplete
          options={(targets.data ?? []).filter((r) => r.id !== id)}
          getOptionLabel={(o) => `${o.name} · ${o.phone} (${o.commisionUniqueId})`}
          value={target}
          onChange={(_, v) => setTarget(v)}
          onInputChange={(_, v) => setTargetSearch(v)}
          filterOptions={(x) => x}
          renderInput={(p) => <TextField {...p} label="Agen tujuan" />}
        />
      </ConfirmDialog>
      <ConfirmDialog open={editNik} title="Ubah NIK" confirmLabel="Simpan" busy={nikM.isPending} disabled={!!nik.trim() && !/^\d{16}$/.test(nik.trim())} error={nikM.isError ? errMsg(nikM.error) : null} onClose={() => { setEditNik(false); nikM.reset(); }} onConfirm={() => nikM.mutate()}>
        <TextField label="NIK (16 angka, kosongkan untuk menghapus)" fullWidth margin="dense" value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, '').slice(0, 16))} />
      </ConfirmDialog>
    </Box>
  );
}
