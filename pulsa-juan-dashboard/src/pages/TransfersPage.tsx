import { Autocomplete, Box, Button, Chip, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { api, errMsg, fmtDate, fmtRp } from '../api';
import { useRole } from '../auth/useSession';
import { ConfirmDialog, PageHeader } from '../components/common';

interface AgentRef { id: string; name: string; phone: string }
interface Transfer {
  id: string; number: number; amount: number; note: string | null; source: 'AGENT' | 'ADMIN'; status: 'DRAFT' | 'DONE' | 'REJECTED' | 'REVERSED';
  rejectReason: string | null; reverseReason: string | null; createdAt: string; approvedAt: string | null; reversedAt: string | null;
  fromAgent: AgentRef; toAgent: AgentRef;
}

const STATUS: Record<Transfer['status'], { label: string; color: 'warning' | 'success' | 'default' | 'error' }> = {
  DRAFT: { label: 'Menunggu persetujuan', color: 'warning' },
  DONE: { label: 'Selesai', color: 'success' },
  REJECTED: { label: 'Ditolak', color: 'default' },
  REVERSED: { label: 'Dibatalkan', color: 'error' },
};

/** Saldo transfers between agents: agent self-service + admin drafts that an OWNER approves or reverses. */
export default function TransfersPage() {
  const role = useRole();
  const qc = useQueryClient();
  const [status, setStatus] = useState('ALL');
  const list = useQuery({ queryKey: ['admin-transfers', status], queryFn: async () => (await api.get<{ transfers: Transfer[] }>('/admin/transfers', { params: { status } })).data.transfers });
  const agents = useQuery({ queryKey: ['admin-agents-all'], queryFn: async () => (await api.get<{ agents: AgentRef[] }>('/admin/agents')).data.agents });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-transfers'] });

  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState<{ from: AgentRef | null; to: AgentRef | null; amount: string; note: string }>({ from: null, to: null, amount: '', note: '' });
  const create = useMutation({
    mutationFn: async () => (await api.post('/admin/transfers', { fromAgentId: draft.from!.id, toAgentId: draft.to!.id, amount: Number(draft.amount), note: draft.note })).data,
    onSuccess: () => { refresh(); setDraftOpen(false); setDraft({ from: null, to: null, amount: '', note: '' }); },
  });
  const [action, setAction] = useState<{ t: Transfer; kind: 'approve' | 'reject' | 'reverse' } | null>(null);
  const [reason, setReason] = useState('');
  const act = useMutation({
    mutationFn: async () => (await api.post(`/admin/transfers/${action!.t.id}/${action!.kind}`, action!.kind === 'approve' ? {} : { reason })).data,
    onSuccess: () => { refresh(); setAction(null); setReason(''); },
  });

  const agentOption = (a: AgentRef) => `${a.name} · ${a.phone}`;
  const who = (a: AgentRef) => <RouterLink to={`/agents/${a.id}`}>{a.name}</RouterLink>;

  return (
    <Box>
      <PageHeader
        title="Transfer Saldo"
        subtitle="Transfer saldo antar agen. Agen mengirim sendiri dari aplikasi; admin membuat draf yang disetujui OWNER. OWNER bisa membatalkan transfer (kekurangan saldo penerima jadi hutang)."
        actions={
          <>
            <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)}>
              <MenuItem value="ALL">Semua status</MenuItem>
              {Object.entries(STATUS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
            </Select>
            {role !== 'STAFF' && <Button variant="contained" onClick={() => setDraftOpen(true)}>Buat draf transfer</Button>}
          </>
        }
      />
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>No.</TableCell><TableCell>Waktu</TableCell><TableCell>Dari</TableCell><TableCell>Ke</TableCell><TableCell align="right">Nominal</TableCell>
            <TableCell>Sumber</TableCell><TableCell>Status</TableCell><TableCell>Catatan</TableCell><TableCell />
          </TableRow></TableHead>
          <TableBody>
            {(list.data ?? []).map((t) => (
              <TableRow key={t.id} hover>
                <TableCell>#{t.number}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(t.createdAt)}</TableCell>
                <TableCell>{who(t.fromAgent)}</TableCell>
                <TableCell>{who(t.toAgent)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtRp(t.amount)}</TableCell>
                <TableCell>{t.source === 'AGENT' ? 'Aplikasi' : 'Admin'}</TableCell>
                <TableCell><Chip size="small" label={STATUS[t.status].label} color={STATUS[t.status].color} /></TableCell>
                <TableCell>{[t.note, t.rejectReason && `Ditolak: ${t.rejectReason}`, t.reverseReason && `Dibatalkan: ${t.reverseReason}`].filter(Boolean).join(' · ') || '-'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {role === 'OWNER' && t.status === 'DRAFT' && (
                    <>
                      <Button size="small" color="success" onClick={() => setAction({ t, kind: 'approve' })}>Setujui</Button>
                      <Button size="small" onClick={() => setAction({ t, kind: 'reject' })}>Tolak</Button>
                    </>
                  )}
                  {role === 'OWNER' && t.status === 'DONE' && <Button size="small" color="error" onClick={() => setAction({ t, kind: 'reverse' })}>Batalkan</Button>}
                </TableCell>
              </TableRow>
            ))}
            {list.data?.length === 0 && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 3, color: 'text.secondary' }}>Belum ada transfer</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      <ConfirmDialog
        open={draftOpen}
        title="Draf transfer saldo"
        confirmLabel="Simpan draf"
        busy={create.isPending}
        disabled={!draft.from || !draft.to || !(Number(draft.amount) >= 1000) || !draft.note.trim()}
        error={create.isError ? errMsg(create.error) : null}
        onClose={() => { setDraftOpen(false); create.reset(); }}
        onConfirm={() => create.mutate()}
        maxWidth="sm"
      >
        <Box sx={{ display: 'grid', gap: 1.5, mt: 0.5 }}>
          <Autocomplete options={agents.data ?? []} getOptionLabel={agentOption} value={draft.from} onChange={(_, v) => setDraft({ ...draft, from: v })} renderInput={(p) => <TextField {...p} label="Dari agen" size="small" />} />
          <Autocomplete options={agents.data ?? []} getOptionLabel={agentOption} value={draft.to} onChange={(_, v) => setDraft({ ...draft, to: v })} renderInput={(p) => <TextField {...p} label="Ke agen" size="small" />} />
          <TextField size="small" label="Nominal (Rp)" type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          <TextField size="small" label="Catatan" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <Typography variant="caption" color="text.secondary">Saldo baru berpindah setelah OWNER menyetujui draf ini.</Typography>
        </Box>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!action}
        title={action?.kind === 'approve' ? 'Setujui transfer' : action?.kind === 'reject' ? 'Tolak draf' : 'Batalkan transfer'}
        confirmLabel={action?.kind === 'approve' ? 'Setujui & kirim' : action?.kind === 'reject' ? 'Tolak' : 'Batalkan transfer'}
        confirmColor={action?.kind === 'approve' ? 'success' : 'error'}
        busy={act.isPending}
        disabled={action?.kind !== 'approve' && reason.trim().length < 3}
        error={act.isError ? errMsg(act.error) : null}
        onClose={() => { setAction(null); act.reset(); }}
        onConfirm={() => act.mutate()}
      >
        {action && (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              #{action.t.number}: {fmtRp(action.t.amount)} dari {action.t.fromAgent.name} ke {action.t.toAgent.name}.
              {action.kind === 'reverse' && ' Saldo dikembalikan ke pengirim; bila saldo penerima kurang, sisanya dicatat sebagai hutang penerima.'}
            </Typography>
            {action.kind !== 'approve' && <TextField fullWidth size="small" label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} />}
          </>
        )}
      </ConfirmDialog>
    </Box>
  );
}
