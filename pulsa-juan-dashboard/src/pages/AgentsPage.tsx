import { Box, Chip, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, fmtDate, fmtRp } from '../api';
import { PageHeader, StatusChip } from '../components/common';
import { SortableCell, useTableSort } from '../components/sortableTable';

export interface AgentRow {
  id: string; name: string; email: string | null; phone: string; nik: string | null; status: string; saldo: number; hutang: number; poin: number;
  commisionUniqueId: string; saldoKomisi: number; referralMarkup: number; referrerMarkup: number; joinedAt: string; createdAt: string;
  googleSub: string | null; referrer: { id: string; name: string } | null;
}

export default function AgentsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['admin-agents', search, status],
    queryFn: async () => (await api.get<{ agents: AgentRow[] }>('/admin/agents', { params: { search: search || undefined, status } })).data.agents,
  });
  const { sorted, sort, toggleSort } = useTableSort(q.data ?? [], {
    name: (r) => r.name, saldo: (r) => r.saldo, hutang: (r) => r.hutang, poin: (r) => r.poin, saldoKomisi: (r) => r.saldoKomisi, joinedAt: (r) => new Date(r.joinedAt),
  });

  return (
    <Box>
      <PageHeader title="Daftar Agen" subtitle="Cari agen lalu klik untuk melihat semua data tersimpan, mutasi saldo, order dan top up." actions={
        <>
          <TextField size="small" placeholder="Cari nama / HP / NIK / email / kode" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 280 }} autoFocus />
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
              <TableCell>NIK</TableCell>
              <TableCell>Status</TableCell>
              <SortableCell label="Saldo" sortKey="saldo" sort={sort} onToggle={toggleSort} align="right" />
              <SortableCell label="Hutang" sortKey="hutang" sort={sort} onToggle={toggleSort} align="right" />
              <SortableCell label="Poin" sortKey="poin" sort={sort} onToggle={toggleSort} align="right" />
              <SortableCell label="Komisi diterima" sortKey="saldoKomisi" sort={sort} onToggle={toggleSort} align="right" />
              <TableCell>Kode referral</TableCell>
              <TableCell>Pengundang</TableCell>
              <SortableCell label="Bergabung" sortKey="joinedAt" sort={sort} onToggle={toggleSort} />
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/agents/${r.id}`)}>
                <TableCell><b>{r.name}</b>{r.googleSub && <Chip size="small" label="Google" sx={{ ml: 1 }} />}</TableCell>
                <TableCell>{r.phone}<br /><Typography variant="caption" color="text.secondary">{r.email ?? '-'}</Typography></TableCell>
                <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{r.nik ?? '-'}</Typography></TableCell>
                <TableCell><StatusChip status={r.status} /></TableCell>
                <TableCell align="right">{fmtRp(r.saldo)}</TableCell>
                <TableCell align="right" sx={{ color: r.hutang > 0 ? 'error.main' : undefined }}>{fmtRp(r.hutang)}</TableCell>
                <TableCell align="right">{r.poin}</TableCell>
                <TableCell align="right">{fmtRp(r.saldoKomisi)}</TableCell>
                <TableCell><code>{r.commisionUniqueId}</code></TableCell>
                <TableCell>{r.referrer ? `${r.referrer.name} (+${fmtRp(r.referrerMarkup)})` : '-'}</TableCell>
                <TableCell>{fmtDate(r.joinedAt)}</TableCell>
              </TableRow>
            ))}
            {q.isSuccess && sorted.length === 0 && <TableRow><TableCell colSpan={11} align="center" sx={{ py: 4, color: 'text.secondary' }}>Tidak ada agen</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
