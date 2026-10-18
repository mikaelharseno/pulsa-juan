import { Autocomplete, Box, Button, Chip, Divider, Drawer, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, errMsg, fmtDate, fmtRp } from '../api';
import { useRole } from '../auth/useSession';
import { ConfirmDialog, PageHeader, StatusChip } from '../components/common';
import { FileDropZone, PROOF_ACCEPT } from '../components/DropZone';
import { SortableCell, useTableSort } from '../components/sortableTable';

interface AgentRow {
  id: string; name: string; email: string; phone: string | null; status: string; saldo: number; hutang: number; poin: number;
  commisionUniqueId: string; saldoKomisi: number; referralMarkup: number; createdAt: string; googleSub: string | null;
}
interface AgentDetail extends AgentRow {
  upline: { parentCommisionId: string; commisionAmount: number; agent: { id: string; name: string } | null } | null;
  downline: { id: string; childCommisionId: string; commisionAmount: number; createdAt: string; agent: { id: string; name: string } | null }[];
  ledger: { id: string; type: string; delta: number; balanceAfter: number; note: string | null; createdAt: string }[];
  unclaimedCommission: number;
}

export default function AgentsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const role = useRole();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-agents', search, status],
    queryFn: async () => (await api.get<{ agents: AgentRow[] }>('/admin/agents', { params: { search: search || undefined, status } })).data.agents,
  });
  const { sorted, sort, toggleSort } = useTableSort(q.data ?? [], {
    name: (r) => r.name, saldo: (r) => r.saldo, hutang: (r) => r.hutang, poin: (r) => r.poin, saldoKomisi: (r) => r.saldoKomisi, createdAt: (r) => new Date(r.createdAt),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ['admin-agent', selected],
    queryFn: async () => (await api.get<AgentDetail>(`/admin/agents/${selected}`)).data,
    enabled: !!selected,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-agents'] });
    qc.invalidateQueries({ queryKey: ['admin-agent'] });
  };

  const [adjust, setAdjust] = useState(false);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const adjustM = useMutation({ mutationFn: async () => (await api.post(`/admin/agents/${selected}/adjust-saldo`, { delta: Number(delta), note })).data, onSuccess: () => { refresh(); setAdjust(false); setDelta(''); setNote(''); } });

  const [hutang, setHutang] = useState(false);
  const [hutangAmount, setHutangAmount] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const hutangM = useMutation({
    mutationFn: async () => { const fd = new FormData(); fd.append('amount', hutangAmount); if (proof) fd.append('proof', proof); return (await api.post(`/admin/agents/${selected}/hutang-payment`, fd)).data; },
    onSuccess: () => { refresh(); setHutang(false); setHutangAmount(''); setProof(null); },
  });

  const [transfer, setTransfer] = useState(false);
  const [target, setTarget] = useState<AgentRow | null>(null);
  const transferM = useMutation({ mutationFn: async () => (await api.post(`/admin/agents/${selected}/transfer-commission-id`, { toAgentId: target!.id })).data, onSuccess: () => { refresh(); setTransfer(false); setTarget(null); } });

  const statusM = useMutation({ mutationFn: async (s: string) => (await api.put(`/admin/agents/${selected}`, { status: s })).data, onSuccess: refresh });
  const a = detail.data;

  return (
    <Box>
      <PageHeader title="Agen" subtitle="Daftar agen, saldo, hutang, poin dan jaringan referral." actions={
        <>
          <TextField size="small" placeholder="Cari nama / email / HP / kode" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="ALL">Semua</MenuItem><MenuItem value="ACTIVE">Aktif</MenuItem><MenuItem value="DISABLED">Nonaktif</MenuItem>
          </Select>
        </>
      } />
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableCell label="Nama" sortKey="name" sort={sort} onToggle={toggleSort} />
              <TableCell>Kontak</TableCell>
              <TableCell>Status</TableCell>
              <SortableCell label="Saldo" sortKey="saldo" sort={sort} onToggle={toggleSort} align="right" />
              <SortableCell label="Hutang" sortKey="hutang" sort={sort} onToggle={toggleSort} align="right" />
              <SortableCell label="Poin" sortKey="poin" sort={sort} onToggle={toggleSort} align="right" />
              <SortableCell label="Komisi diterima" sortKey="saldoKomisi" sort={sort} onToggle={toggleSort} align="right" />
              <TableCell>Kode referral</TableCell>
              <TableCell align="right">Markup</TableCell>
              <SortableCell label="Daftar" sortKey="createdAt" sort={sort} onToggle={toggleSort} />
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(r.id)}>
                <TableCell><b>{r.name}</b>{r.googleSub && <Chip size="small" label="Google" sx={{ ml: 1 }} />}</TableCell>
                <TableCell>{r.phone ?? '-'}<br /><Typography variant="caption" color="text.secondary">{r.email}</Typography></TableCell>
                <TableCell><StatusChip status={r.status} /></TableCell>
                <TableCell align="right">{fmtRp(r.saldo)}</TableCell>
                <TableCell align="right" sx={{ color: r.hutang > 0 ? 'error.main' : undefined }}>{fmtRp(r.hutang)}</TableCell>
                <TableCell align="right">{r.poin}</TableCell>
                <TableCell align="right">{fmtRp(r.saldoKomisi)}</TableCell>
                <TableCell><code>{r.commisionUniqueId}</code></TableCell>
                <TableCell align="right">{fmtRp(r.referralMarkup)}</TableCell>
                <TableCell>{fmtDate(r.createdAt)}</TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && <TableRow><TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>Tidak ada agen</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      <Drawer anchor="right" open={!!selected} onClose={() => setSelected(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 3 } }}>
        {a && (
          <>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{a.name}</Typography>
            <Typography variant="body2" color="text.secondary">{a.email} · {a.phone ?? '-'}</Typography>
            <Box sx={{ display: 'flex', gap: 1, my: 1.5, flexWrap: 'wrap' }}>
              <StatusChip status={a.status} />
              <Chip size="small" label={`Saldo ${fmtRp(a.saldo)}`} color="primary" />
              <Chip size="small" label={`Hutang ${fmtRp(a.hutang)}`} color={a.hutang > 0 ? 'error' : 'default'} />
              <Chip size="small" label={`Poin ${a.poin}`} />
              <Chip size="small" label={`Komisi belum diklaim ${fmtRp(a.unclaimedCommission)}`} />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Button size="small" variant="outlined" onClick={() => setAdjust(true)}>Sesuaikan saldo</Button>
              <Button size="small" variant="outlined" color={a.status === 'ACTIVE' ? 'error' : 'success'} onClick={() => statusM.mutate(a.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE')}>{a.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}</Button>
              {role === 'OWNER' && <Button size="small" variant="outlined" onClick={() => setHutang(true)} disabled={a.hutang <= 0}>Bayar hutang</Button>}
              {role === 'OWNER' && <Button size="small" variant="outlined" color="warning" onClick={() => setTransfer(true)}>Pindahkan kode komisi</Button>}
            </Box>
            <Divider />
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Referral — kode <code>{a.commisionUniqueId}</code>, markup {fmtRp(a.referralMarkup)}/trx</Typography>
            <Typography variant="body2">Pengundang: {a.upline ? `${a.upline.agent?.name ?? a.upline.parentCommisionId} (+${fmtRp(a.upline.commisionAmount)}/trx)` : '-'}</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>Mitra ({a.downline.length}): {a.downline.map((d) => `${d.agent?.name ?? d.childCommisionId} (+${fmtRp(d.commisionAmount)})`).join(', ') || '-'}</Typography>
            <Divider />
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Mutasi saldo terakhir</Typography>
            <Table size="small">
              <TableHead><TableRow><TableCell>Waktu</TableCell><TableCell>Jenis</TableCell><TableCell align="right">Delta</TableCell><TableCell align="right">Saldo</TableCell><TableCell>Catatan</TableCell></TableRow></TableHead>
              <TableBody>
                {a.ledger.map((l) => (
                  <TableRow key={l.id}><TableCell>{fmtDate(l.createdAt)}</TableCell><TableCell>{l.type}</TableCell><TableCell align="right" sx={{ color: l.delta < 0 ? 'error.main' : 'success.main' }}>{fmtRp(l.delta)}</TableCell><TableCell align="right">{fmtRp(l.balanceAfter)}</TableCell><TableCell>{l.note}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Drawer>

      <ConfirmDialog open={adjust} title="Sesuaikan saldo" confirmLabel="Simpan" busy={adjustM.isPending} disabled={!delta || !note} error={adjustM.isError ? errMsg(adjustM.error) : null} onClose={() => { setAdjust(false); adjustM.reset(); }} onConfirm={() => adjustM.mutate()}>
        <TextField label="Delta (negatif untuk mengurangi)" type="number" fullWidth margin="dense" value={delta} onChange={(e) => setDelta(e.target.value)} />
        <TextField label="Catatan" fullWidth margin="dense" value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmDialog>
      <ConfirmDialog open={hutang} title="Pembayaran hutang" confirmLabel="Catat pembayaran" busy={hutangM.isPending} disabled={!hutangAmount} error={hutangM.isError ? errMsg(hutangM.error) : null} onClose={() => { setHutang(false); hutangM.reset(); }} onConfirm={() => hutangM.mutate()} maxWidth="sm">
        <TextField label="Nominal" type="number" fullWidth margin="dense" value={hutangAmount} onChange={(e) => setHutangAmount(e.target.value)} helperText={`Hutang saat ini ${fmtRp(a?.hutang ?? 0)}`} />
        {proof ? <Typography variant="body2">{proof.name} <Button size="small" onClick={() => setProof(null)}>ganti</Button></Typography> : <FileDropZone accept={PROOF_ACCEPT} onFiles={(f) => setProof(f[0] ?? null)} label="Bukti transfer (opsional, JPG/PNG)" compact />}
      </ConfirmDialog>
      <ConfirmDialog open={transfer} title="Pindahkan kode komisi (crown)" confirmLabel="Pindahkan" confirmColor="warning" busy={transferM.isPending} disabled={!target} error={transferM.isError ? errMsg(transferM.error) : null} onClose={() => { setTransfer(false); transferM.reset(); }} onConfirm={() => transferM.mutate()}>
        <Typography variant="body2" sx={{ mb: 1 }}>Seluruh jaringan mitra dan komisi belum diklaim milik kode <code>{a?.commisionUniqueId}</code> berpindah ke agen tujuan. Agen asal mendapat kode baru.</Typography>
        <Autocomplete options={(q.data ?? []).filter((r) => r.id !== selected)} getOptionLabel={(o) => `${o.name} (${o.commisionUniqueId})`} value={target} onChange={(_, v) => setTarget(v)} renderInput={(p) => <TextField {...p} label="Agen tujuan" />} />
      </ConfirmDialog>
    </Box>
  );
}
