import { Alert, Box, Button, Chip, Divider, FormControlLabel, Paper, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BillerPatterns, DEFAULT_BILL_PATTERNS, parseBillMessage, SAMPLE_BILL_REPLIES } from 'pulsa-juan-common';
import { useEffect, useState } from 'react';

import { api, errMsg, fmtRp } from '../api';
import { useRole } from '../auth/useSession';
import { ConfirmDialog, PageHeader } from '../components/common';

type CheckStatus = 'PENDING' | 'READY' | 'NOT_PAYABLE' | 'FAILED' | 'USED' | 'EXPIRED';

interface BillCheck {
  id: string; number: number; status: CheckStatus; customerId: string; rawMessage: string | null; customerName: string | null; periode: string | null;
  amountDue: number; supplierAdmin: number; ourFee: number; createdAt: string; agentId: string | null;
}

interface Biller extends Required<{ [K in keyof BillerPatterns]: string | null }> {
  id: string; key: string; name: string; checkCode: string; payCode: string; ourFee: number; validityMinutes: number; isActive: boolean;
  usable?: boolean; lastCheck?: BillCheck | null;
}

const PATTERN_FIELDS: { key: keyof BillerPatterns; label: string }[] = [
  { key: 'nameRe', label: 'Nama pelanggan' },
  { key: 'amountRe', label: 'Tagihan' },
  { key: 'adminRe', label: 'Admin supplier' },
  { key: 'totalRe', label: 'Total (opsional)' },
  { key: 'periodeRe', label: 'Periode (opsional)' },
  { key: 'notPayableRe', label: 'Tidak ada tagihan / lunas' },
  { key: 'failRe', label: 'Gagal' },
];

const EMPTY: Partial<Biller> = { key: '', name: '', checkCode: '', payCode: '', ourFee: 0, validityMinutes: 30, isActive: false };

const CHECK_LABEL: Record<CheckStatus, { label: string; color: 'default' | 'warning' | 'success' | 'error' | 'info' }> = {
  PENDING: { label: 'Menunggu', color: 'warning' },
  READY: { label: 'Ada tagihan', color: 'success' },
  NOT_PAYABLE: { label: 'Lunas / tidak ada', color: 'info' },
  FAILED: { label: 'Gagal', color: 'error' },
  USED: { label: 'Dibayar', color: 'success' },
  EXPIRED: { label: 'Kedaluwarsa', color: 'default' },
};

export function CheckChip({ status }: { status: CheckStatus }) {
  const m = CHECK_LABEL[status] ?? { label: status, color: 'default' as const };
  return <Chip size="small" label={m.label} color={m.color} variant={m.color === 'default' ? 'outlined' : 'filled'} />;
}

/** Live result of the biller's patterns on a pasted reply (same parser as the server). */
function PatternTester({ biller }: { biller: Partial<Biller> }) {
  const sample = biller.key === 'TELKOM' ? SAMPLE_BILL_REPLIES.TELKOM : SAMPLE_BILL_REPLIES.PLN_POSTPAID;
  const [text, setText] = useState<string>(sample.ready);
  const parsed = parseBillMessage(biller, text);
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mr: 1 }}>Tes pola</Typography>
        <Typography variant="caption" color="text.secondary">Contoh balasan:</Typography>
        <Button size="small" onClick={() => setText(sample.ready)}>Ada tagihan</Button>
        <Button size="small" onClick={() => setText(sample.notPayable)}>Lunas</Button>
        <Button size="small" onClick={() => setText(sample.pending)}>Diproses</Button>
      </Box>
      <TextField multiline minRows={2} fullWidth size="small" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel balasan cek tagihan dari OtomaX" />
      <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: parsed.status === 'READY' ? 1 : 0 }}>
          <CheckChip status={parsed.status} />
          {parsed.status !== 'READY' && <Typography variant="body2" color="text.secondary">{parsed.status === 'PENDING' ? 'Belum ada data tagihan — aplikasi menunggu laporan OtomaX' : 'Agen melihat pesan ini, tanpa teks asli'}</Typography>}
        </Box>
        {parsed.status === 'READY' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.25, fontSize: 14 }}>
            <span>Nama</span><b>{parsed.customerName ?? '—'}</b>
            <span>Periode</span><b>{parsed.periode ?? '—'}</b>
            <span>Tagihan</span><b>{fmtRp(parsed.amountDue)}</b>
            <span>Admin supplier</span><b>{fmtRp(parsed.supplierAdmin)}</b>
            <span>Biaya kita</span><b>{fmtRp(biller.ourFee ?? 0)}</b>
            <span>Dibayar agen</span><b>{fmtRp(parsed.amountDue + parsed.supplierAdmin + (biller.ourFee ?? 0))} <Typography component="span" variant="caption" color="text.secondary">+ markup referral</Typography></b>
            {parsed.total !== undefined && parsed.total !== parsed.amountDue + parsed.supplierAdmin && (
              <Typography sx={{ gridColumn: '1 / -1' }} variant="caption" color="warning.main">Total di balasan ({fmtRp(parsed.total)}) ≠ tagihan + admin — periksa pola admin.</Typography>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

/** Dashboard "Cek tagihan nyata": real OtomaX check, polled while PENDING. */
function RealCheckDialog({ biller, onClose }: { biller: Biller; onClose: () => void }) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [check, setCheck] = useState<BillCheck | null>(null);
  const start = useMutation({
    mutationFn: async () => (await api.post<BillCheck>(`/admin/billers/${biller.id}/check`, { customerId: customerId.trim() })).data,
    onSuccess: (c) => {
      setCheck(c);
      qc.invalidateQueries({ queryKey: ['admin-billers'] });
    },
  });
  useEffect(() => {
    if (!check || check.status !== 'PENDING') return;
    const started = Date.now();
    const t = setInterval(async () => {
      if (Date.now() - started > 45_000) return clearInterval(t);
      const fresh = (await api.get<BillCheck>(`/admin/bill-checks/${check.id}`)).data;
      if (fresh.status !== 'PENDING') {
        clearInterval(t);
        setCheck(fresh);
        qc.invalidateQueries({ queryKey: ['admin-billers'] });
      }
    }, 2000);
    return () => clearInterval(t);
  }, [check, qc]);

  return (
    <ConfirmDialog open title={`Cek tagihan nyata — ${biller.name}`} confirmLabel="Cek" busy={start.isPending} disabled={!customerId.trim()} error={start.isError ? errMsg(start.error) : null} onClose={onClose} onConfirm={() => start.mutate()} maxWidth="sm">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Mengirim <code>{biller.checkCode || '(kode cek kosong)'}</code> ke OtomaX untuk satu ID pelanggan. Tidak membuat order dan tidak memotong saldo agen.
      </Typography>
      <TextField fullWidth size="small" label="ID pelanggan" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
      {check && (
        <Paper variant="outlined" sx={{ p: 1.5, mt: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
            <CheckChip status={check.status} />
            <Typography variant="caption" color="text.secondary">refID {`C${check.number}`}{check.status === 'PENDING' && ' · menunggu laporan OtomaX…'}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">Balasan asli</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', mb: 1 }}>{check.rawMessage ?? '—'}</Typography>
          {check.status === 'READY' && (
            <Typography variant="body2">
              {check.customerName ?? '—'} · {check.periode ?? '—'} · Tagihan <b>{fmtRp(check.amountDue)}</b> · Admin <b>{fmtRp(check.supplierAdmin)}</b>
            </Typography>
          )}
        </Paper>
      )}
    </ConfirmDialog>
  );
}

export default function BillersPage() {
  const role = useRole();
  const canEdit = role !== 'STAFF';
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Biller> | null>(null);
  const [checking, setChecking] = useState<Biller | null>(null);
  const list = useQuery({ queryKey: ['admin-billers'], queryFn: async () => (await api.get<Biller[]>('/admin/billers')).data });
  const integrations = useQuery({ queryKey: ['admin-integrations'], queryFn: async () => (await api.get<{ otomax: { enabled: boolean } }>('/admin/integrations')).data });
  const save = useMutation({
    mutationFn: async (b: Partial<Biller>) => {
      const body = {
        key: b.key, name: b.name, checkCode: b.checkCode ?? '', payCode: b.payCode ?? '', ourFee: Number(b.ourFee ?? 0), validityMinutes: Number(b.validityMinutes ?? 30), isActive: !!b.isActive,
        ...Object.fromEntries(PATTERN_FIELDS.map((f) => [f.key, b[f.key] || null])),
      };
      return b.id ? (await api.put(`/admin/billers/${b.id}`, body)).data : (await api.post('/admin/billers', body)).data;
    },
    onSuccess: () => {
      setEdit(null);
      qc.invalidateQueries({ queryKey: ['admin-billers'] });
    },
  });

  return (
    <Box>
      <PageHeader
        title="Tagihan (Biller)"
        subtitle="Tagihan pascabayar via OtomaX: kode cek → tagihan dibaca dengan pola, kode bayar → pembayaran. Kunci dipakai di node Cek tagihan."
        actions={canEdit && <Button variant="contained" onClick={() => setEdit({ ...EMPTY })}>Tambah biller</Button>}
      />
      {integrations.data && !integrations.data.otomax.enabled && (
        <Alert severity="warning" sx={{ mb: 2 }}>OtomaX belum terhubung di server — cek tagihan belum bisa dipakai agen (lihat Pengaturan → Integrasi).</Alert>
      )}
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Biller</TableCell><TableCell>Kunci</TableCell><TableCell>Kode cek</TableCell><TableCell>Kode bayar</TableCell>
            <TableCell align="right">Biaya kita</TableCell><TableCell align="right">Berlaku</TableCell><TableCell>Status</TableCell><TableCell>Cek terakhir</TableCell><TableCell />
          </TableRow></TableHead>
          <TableBody>
            {(list.data ?? []).map((b) => (
              <TableRow key={b.id} hover>
                <TableCell><b>{b.name}</b></TableCell>
                <TableCell><code>{b.key}</code></TableCell>
                <TableCell>{b.checkCode ? <code>{b.checkCode}</code> : <Typography variant="body2" color="text.disabled">belum diisi</Typography>}</TableCell>
                <TableCell>{b.payCode ? <code>{b.payCode}</code> : <Typography variant="body2" color="text.disabled">belum diisi</Typography>}</TableCell>
                <TableCell align="right">{fmtRp(b.ourFee)}</TableCell>
                <TableCell align="right">{b.validityMinutes} mnt</TableCell>
                <TableCell>
                  {b.usable ? <Chip size="small" color="success" label="Siap" /> : b.isActive ? <Chip size="small" color="warning" label="Aktif, belum siap" /> : <Chip size="small" variant="outlined" label="Nonaktif" />}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {b.lastCheck ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }} title={b.lastCheck.rawMessage ?? ''}>
                      <CheckChip status={b.lastCheck.status} />
                      <Typography variant="caption" color="text.secondary">{new Date(b.lastCheck.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</Typography>
                    </Box>
                  ) : '—'}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {canEdit && <Button size="small" onClick={() => setChecking(b)} disabled={!b.checkCode}>Cek nyata</Button>}
                  {canEdit && <Button size="small" onClick={() => setEdit(b)}>Edit</Button>}
                </TableCell>
              </TableRow>
            ))}
            {list.data?.length === 0 && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 3, color: 'text.secondary' }}>Belum ada biller</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      <ConfirmDialog
        open={!!edit}
        title={edit?.id ? `Edit ${edit.name}` : 'Tambah biller'}
        confirmLabel="Simpan"
        busy={save.isPending}
        disabled={!edit?.key || !edit?.name}
        error={save.isError ? errMsg(save.error) : null}
        onClose={() => { setEdit(null); save.reset(); }}
        onConfirm={() => edit && save.mutate(edit)}
        maxWidth="md"
      >
        {edit && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mt: 0.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, alignContent: 'start' }}>
              <TextField size="small" label="Nama" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <TextField size="small" label="Kunci" value={edit.key ?? ''} onChange={(e) => setEdit({ ...edit, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} helperText="dipakai node Cek tagihan" />
              <TextField size="small" label="Kode cek OtomaX" value={edit.checkCode ?? ''} onChange={(e) => setEdit({ ...edit, checkCode: e.target.value.toUpperCase().trim() })} placeholder="mis. CEKPLN" InputLabelProps={{ shrink: true }} />
              <TextField size="small" label="Kode bayar OtomaX" value={edit.payCode ?? ''} onChange={(e) => setEdit({ ...edit, payCode: e.target.value.toUpperCase().trim() })} placeholder="mis. BYRPLN" InputLabelProps={{ shrink: true }} />
              <TextField size="small" type="number" label="Biaya kita (Rp)" value={edit.ourFee ?? 0} onChange={(e) => setEdit({ ...edit, ourFee: Number(e.target.value) })} helperText="ditambah ke admin supplier" />
              <TextField size="small" type="number" label="Hasil cek berlaku (menit)" value={edit.validityMinutes ?? 30} onChange={(e) => setEdit({ ...edit, validityMinutes: Number(e.target.value) })} />
              <FormControlLabel sx={{ gridColumn: '1 / -1' }} control={<Switch checked={!!edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />} label="Aktif (butuh kode cek + kode bayar)" />
              <Divider sx={{ gridColumn: '1 / -1' }} />
              <Typography variant="subtitle2" sx={{ gridColumn: '1 / -1' }}>Pola balasan (regex, 1 grup tangkap; kosong = bawaan)</Typography>
              {PATTERN_FIELDS.map((f) => (
                <TextField
                  key={f.key}
                  size="small"
                  label={f.label}
                  value={edit[f.key] ?? ''}
                  onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })}
                  placeholder={DEFAULT_BILL_PATTERNS[f.key]}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
                  sx={{ gridColumn: '1 / -1' }}
                />
              ))}
            </Box>
            <PatternTester biller={edit} />
          </Box>
        )}
      </ConfirmDialog>
      {checking && <RealCheckDialog biller={checking} onClose={() => setChecking(null)} />}
    </Box>
  );
}
