import { Box, Button, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, errMsg, fmtDate, fmtRp } from '../api';
import { useRole } from '../auth/useSession';
import { ConfirmDialog, PageHeader, StatusChip } from '../components/common';

interface Conn { id: string; parentCommisionId: string; childCommisionId: string; commisionAmount: number; createdAt: string; parent: { name: string } | null; child: { name: string } | null }
interface Comm { id: string; level: number; amount: number; status: string; beneficiaryCommisionId: string; createdAt: string; claimedAt: string | null; transaction: { trxNumber: number; status: string }; sourceAgent: { name: string } }

export default function MitraPage() {
  const role = useRole();
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ['admin-connections'], queryFn: async () => (await api.get<{ connections: Conn[] }>('/admin/mitra-connections')).data.connections });
  const [status, setStatus] = useState('ALL');
  const comms = useQuery({ queryKey: ['admin-commissions', status], queryFn: async () => (await api.get<{ commissions: Comm[] }>('/admin/commissions', { params: { status } })).data.commissions });
  const [edit, setEdit] = useState<Conn | null>(null);
  const [amount, setAmount] = useState('');
  const editM = useMutation({ mutationFn: async () => (await api.put(`/admin/mitra-connections/${edit!.id}`, { commisionAmount: Number(amount) })).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-connections'] }); setEdit(null); } });

  return (
    <Box>
      <PageHeader title="Referral & Komisi" subtitle="Koneksi mitra (pengundang → mitra) dengan markup per transaksi, dan komisi yang dihasilkan." />
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Koneksi mitra</Typography>
      <Paper sx={{ overflowX: 'auto', mb: 3 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Pengundang</TableCell><TableCell>Mitra</TableCell><TableCell align="right">Markup / trx</TableCell><TableCell>Sejak</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {(conns.data ?? []).map((c) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.parent?.name ?? '-'} <code>{c.parentCommisionId}</code></TableCell>
                <TableCell>{c.child?.name ?? '-'} <code>{c.childCommisionId}</code></TableCell>
                <TableCell align="right">{fmtRp(c.commisionAmount)}</TableCell>
                <TableCell>{fmtDate(c.createdAt)}</TableCell>
                <TableCell align="right">{role === 'OWNER' && <Button size="small" onClick={() => { setEdit(c); setAmount(String(c.commisionAmount)); }}>Ubah markup</Button>}</TableCell>
              </TableRow>
            ))}
            {conns.data?.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>Belum ada koneksi</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Komisi</Typography>
        <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)}>
          <MenuItem value="ALL">Semua</MenuItem><MenuItem value="UNCLAIMED">Belum diklaim</MenuItem><MenuItem value="CLAIMED">Diklaim</MenuItem><MenuItem value="VOIDED">Batal</MenuItem>
        </Select>
      </Box>
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Waktu</TableCell><TableCell>Transaksi</TableCell><TableCell>Dari agen</TableCell><TableCell>Penerima (kode)</TableCell><TableCell>Tingkat</TableCell><TableCell align="right">Nominal</TableCell><TableCell>Status</TableCell><TableCell>Diklaim</TableCell></TableRow></TableHead>
          <TableBody>
            {(comms.data ?? []).map((c) => (
              <TableRow key={c.id} hover>
                <TableCell>{fmtDate(c.createdAt)}</TableCell>
                <TableCell>#{c.transaction.trxNumber} <StatusChip status={c.transaction.status} /></TableCell>
                <TableCell>{c.sourceAgent.name}</TableCell>
                <TableCell><code>{c.beneficiaryCommisionId}</code></TableCell>
                <TableCell>{c.level === 1 ? 'Pengundang' : 'Tingkat 2'}</TableCell>
                <TableCell align="right">{fmtRp(c.amount)}</TableCell>
                <TableCell><StatusChip status={c.status} /></TableCell>
                <TableCell>{fmtDate(c.claimedAt)}</TableCell>
              </TableRow>
            ))}
            {comms.data?.length === 0 && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>Belum ada komisi</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>
      <ConfirmDialog open={!!edit} title="Ubah markup koneksi" confirmLabel="Simpan" busy={editM.isPending} error={editM.isError ? errMsg(editM.error) : null} onClose={() => setEdit(null)} onConfirm={() => editM.mutate()}>
        <TextField label="Markup per transaksi (Rp)" type="number" fullWidth value={amount} onChange={(e) => setAmount(e.target.value)} />
      </ConfirmDialog>
    </Box>
  );
}
