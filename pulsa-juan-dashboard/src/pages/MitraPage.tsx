import { Box, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { useState } from 'react';

import { api, fmtDate, fmtRp } from '../api';
import { PageHeader, StatusChip } from '../components/common';

interface Conn { id: string; parentCommisionId: string; childCommisionId: string; commisionAmount: number; createdAt: string; parent: { name: string } | null; child: { name: string } | null }
interface Comm { id: string; level: number; amount: number; status: string; beneficiaryCommisionId: string; createdAt: string; claimedAt: string | null; transaction: { trxNumber: number; status: string }; sourceAgent: { name: string } }

export default function MitraPage() {
  const conns = useQuery({ queryKey: ['admin-connections'], queryFn: async () => (await api.get<{ connections: Conn[] }>('/admin/mitra-connections')).data.connections });
  const [status, setStatus] = useState('ALL');
  const comms = useQuery({ queryKey: ['admin-commissions', status], queryFn: async () => (await api.get<{ commissions: Comm[] }>('/admin/commissions', { params: { status } })).data.commissions });

  return (
    <Box>
      <PageHeader title="Referral" subtitle="Koneksi mitra (pengundang → mitra) dan komisi yang dihasilkan. Besar komisi diatur per produk di menu Komisi (satu tingkat, dari margin kita; harga mitra tidak naik)." />
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Koneksi mitra</Typography>
      <Paper sx={{ overflowX: 'auto', mb: 3 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Pengundang</TableCell><TableCell>Mitra</TableCell><TableCell>Sejak</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {(conns.data ?? []).map((c) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.parent?.name ?? '-'} <code>{c.parentCommisionId}</code></TableCell>
                <TableCell>{c.child?.name ?? '-'} <code>{c.childCommisionId}</code></TableCell>
                <TableCell>{fmtDate(c.createdAt)}</TableCell>
                <TableCell align="right"><RouterLink to="/komisi">Atur komisi</RouterLink></TableCell>
              </TableRow>
            ))}
            {conns.data?.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>Belum ada koneksi</TableCell></TableRow>}
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
    </Box>
  );
}
