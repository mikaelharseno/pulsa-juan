import { Alert, Box, Chip, LinearProgress, MenuItem, Paper, Select, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { api, errMsg, fmtDate } from '../api';
import { PageHeader, StatusChip } from '../components/common';
import { SortableCell, useTableSort } from '../components/sortableTable';

type Mode = 'AUTO' | 'MANUAL' | 'INACTIVE';
type Reason = 'OTOMAX' | 'NO_SKU' | 'OTOMAX_OFF' | 'INACTIVE' | 'NO_CODE';

interface Health { success: number; failed: number; pending: number; lastStatus: string; lastAt: string; lastMessage: string | null }
interface ProductRow {
  id: string; code: string; name: string; category: string; provider: string | null; supplierName: string | null; supplierSku: string | null; isActive: boolean;
  tile: string; mode: Mode; reason: Reason; health: Health | null;
}
interface TileRow { key: string; label: string; groupLabel: string; AUTO: number; MANUAL: number; INACTIVE: number; total: number }
interface BillerRow { id: string; key: string; name: string; checkCode: string; payCode: string; isActive: boolean; mode: Mode; reason: Reason; lastCheck: { status: string; at: string } | null }
interface ProductStatus {
  otomax: { enabled: boolean; host: string | null };
  healthDays: number;
  totals: { AUTO: number; MANUAL: number; INACTIVE: number; total: number };
  tiles: TileRow[];
  packages: ProductRow[];
  billers: BillerRow[];
}

const MODE_LABEL: Record<Mode, string> = { AUTO: 'Otomatis', MANUAL: 'Manual', INACTIVE: 'Nonaktif' };
const MODE_COLOR: Record<Mode, 'success' | 'warning' | 'default'> = { AUTO: 'success', MANUAL: 'warning', INACTIVE: 'default' };
const REASON_LABEL: Record<Reason, string> = {
  OTOMAX: 'Via OtomaX',
  NO_SKU: 'Tanpa kode produk OtomaX',
  OTOMAX_OFF: 'OtomaX belum diatur di server',
  INACTIVE: 'Nonaktif',
  NO_CODE: 'Kode cek / bayar belum diisi',
};

const ModeChip = ({ mode, label }: { mode: Mode; label?: string }) => (
  <Chip size="small" label={label ?? MODE_LABEL[mode]} color={MODE_COLOR[mode]} variant={mode === 'INACTIVE' ? 'outlined' : 'filled'} />
);

function Stat({ label, value, mode, active, onClick }: { label: string; value: number; mode?: Mode; active: boolean; onClick: () => void }) {
  return (
    <Paper
      onClick={onClick}
      sx={{ p: 1.5, minWidth: 130, cursor: 'pointer', border: '2px solid', borderColor: active ? 'primary.main' : 'transparent' }}
    >
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, color: mode === 'AUTO' ? 'success.main' : mode === 'MANUAL' ? 'warning.dark' : undefined }}>{value}</Typography>
    </Paper>
  );
}

function HealthCell({ h }: { h: Health | null }) {
  if (!h) return <Typography variant="caption" color="text.secondary">-</Typography>;
  return (
    <Box title={h.lastMessage ?? undefined}>
      <Typography variant="caption" component="div">
        <span style={{ color: '#2E7D32' }}>✓ {h.success}</span> · <span style={{ color: '#C62828' }}>✗ {h.failed}</span>
        {h.pending > 0 && <> · ⏳ {h.pending}</>}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mt: 0.25 }}>
        <StatusChip status={h.lastStatus} />
        <Typography variant="caption" color="text.secondary">{fmtDate(h.lastAt)}</Typography>
      </Box>
    </Box>
  );
}

/** Which products are fulfilled automatically through OtomaX, which are manual, and why. */
export default function IntegrationStatusPage() {
  const q = useQuery({ queryKey: ['admin-integrations-products'], queryFn: async () => (await api.get<ProductStatus>('/admin/integrations/products')).data });
  const [tile, setTile] = useState('');
  const [mode, setMode] = useState<Mode | ''>('');
  const [reason, setReason] = useState<Reason | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(50);
  const d = q.data;

  const tileLabel = useMemo(() => new Map((d?.tiles ?? []).map((t) => [t.key, t.label])), [d]);
  // manual only because OtomaX is not configured: automatic as soon as it is
  const waiting = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of d?.packages ?? []) if (p.reason === 'OTOMAX_OFF') m.set(p.tile, (m.get(p.tile) ?? 0) + 1);
    return m;
  }, [d]);
  const waitingTotal = [...waiting.values()].reduce((a, b) => a + b, 0);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (d?.packages ?? []).filter(
      (p) =>
        (!tile || p.tile === tile) &&
        (!mode || p.mode === mode) &&
        (!reason || p.reason === reason) &&
        (!s || p.code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || (p.supplierSku ?? '').toLowerCase().includes(s)),
    );
  }, [d, tile, mode, reason, search]);
  const { sorted, sort, toggleSort } = useTableSort(filtered, {
    code: (r) => r.code,
    name: (r) => r.name,
    tile: (r) => tileLabel.get(r.tile) ?? r.tile,
    mode: (r) => r.mode,
    health: (r) => (r.health ? r.health.lastAt : ''),
  });
  const pageRows = sorted.slice(page * perPage, page * perPage + perPage);
  const setFilter = (fn: () => void) => { fn(); setPage(0); };

  return (
    <Box>
      <PageHeader title="Status Integrasi" subtitle="Per produk: diproses otomatis lewat OtomaX, atau manual oleh admin — dan alasannya." />
      {q.isError && <Alert severity="error" sx={{ mb: 2 }}>{errMsg(q.error)}</Alert>}
      {q.isLoading && <LinearProgress />}
      {d && (
        <>
          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 700 }}>Koneksi OtomaX</Typography>
            {d.otomax.enabled ? (
              <>
                <Chip size="small" color="success" label="Terhubung" />
                <Typography variant="body2" color="text.secondary">{d.otomax.host}</Typography>
              </>
            ) : (
              <>
                <Chip size="small" variant="outlined" label="Belum diatur" />
                <Typography variant="body2" color="text.secondary">Semua order diproses manual, termasuk produk yang punya kode OtomaX.</Typography>
              </>
            )}
            <Typography variant="body2" sx={{ ml: 'auto' }}><RouterLink to="/settings">Detail di Pengaturan</RouterLink></Typography>
          </Paper>

          <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
            <Stat label="Semua paket" value={d.totals.total} active={!mode} onClick={() => setFilter(() => setMode(''))} />
            {(['AUTO', 'MANUAL', 'INACTIVE'] as Mode[]).map((m) => (
              <Stat key={m} label={MODE_LABEL[m]} value={d.totals[m]} mode={m} active={mode === m} onClick={() => setFilter(() => setMode(mode === m ? '' : m))} />
            ))}
            {waitingTotal > 0 && (
              <Stat label="Punya kode OtomaX, menunggu koneksi" value={waitingTotal} active={reason === 'OTOMAX_OFF'} onClick={() => setFilter(() => setReason(reason === 'OTOMAX_OFF' ? '' : 'OTOMAX_OFF'))} />
            )}
          </Box>

          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Per tile aplikasi / operator</Typography>
          <Paper sx={{ overflowX: 'auto', mb: 3 }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Tile</TableCell><TableCell>Grup</TableCell>
                <TableCell align="right">Otomatis</TableCell><TableCell align="right">Manual</TableCell><TableCell align="right">Nonaktif</TableCell><TableCell align="right">Total</TableCell>
                <TableCell sx={{ width: 180 }}>% otomatis (aktif)</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {d.tiles.map((t) => {
                  const active = t.AUTO + t.MANUAL;
                  const pct = active ? Math.round((t.AUTO / active) * 100) : 0;
                  return (
                    <TableRow key={t.key} hover selected={tile === t.key} onClick={() => setFilter(() => setTile(tile === t.key ? '' : t.key))} sx={{ cursor: 'pointer' }}>
                      <TableCell sx={{ fontWeight: 600 }}>{t.label}</TableCell>
                      <TableCell>{t.groupLabel}</TableCell>
                      <TableCell align="right" sx={{ color: t.AUTO ? 'success.main' : undefined, fontWeight: 600 }}>{t.AUTO}</TableCell>
                      <TableCell align="right" sx={{ color: t.MANUAL ? 'warning.dark' : undefined, whiteSpace: 'nowrap' }}>
                        {t.MANUAL}
                        {!!waiting.get(t.key) && <Typography variant="caption" color="text.secondary" component="div" title="Punya kode OtomaX; otomatis begitu OtomaX diatur">{waiting.get(t.key)} berkode OtomaX</Typography>}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary' }}>{t.INACTIVE}</TableCell>
                      <TableCell align="right">{t.total}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress variant="determinate" value={pct} color="success" sx={{ flex: 1, height: 6, borderRadius: 3 }} />
                          <Typography variant="caption" sx={{ width: 34, textAlign: 'right' }}>{active ? `${pct}%` : '-'}</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 'auto' }}>Paket ({filtered.length})</Typography>
            <TextField size="small" placeholder="Cari kode / nama / kode OtomaX" value={search} onChange={(e) => setFilter(() => setSearch(e.target.value))} />
            <Select size="small" value={tile} onChange={(e) => setFilter(() => setTile(e.target.value))} displayEmpty>
              <MenuItem value="">Semua tile</MenuItem>
              {d.tiles.map((t) => <MenuItem key={t.key} value={t.key}>{t.label} ({t.total})</MenuItem>)}
            </Select>
            <Select size="small" value={mode} onChange={(e) => setFilter(() => setMode(e.target.value as Mode | ''))} displayEmpty>
              <MenuItem value="">Semua status</MenuItem>
              {(['AUTO', 'MANUAL', 'INACTIVE'] as Mode[]).map((m) => <MenuItem key={m} value={m}>{MODE_LABEL[m]}</MenuItem>)}
            </Select>
            <Select size="small" value={reason} onChange={(e) => setFilter(() => setReason(e.target.value as Reason | ''))} displayEmpty>
              <MenuItem value="">Semua alasan</MenuItem>
              {(['OTOMAX', 'NO_SKU', 'OTOMAX_OFF', 'INACTIVE'] as Reason[]).map((r) => <MenuItem key={r} value={r}>{REASON_LABEL[r]}</MenuItem>)}
            </Select>
          </Box>
          <Paper sx={{ overflowX: 'auto', mb: 3 }}>
            <Table size="small">
              <TableHead><TableRow>
                <SortableCell label="Kode" sortKey="code" sort={sort} onToggle={toggleSort} />
                <SortableCell label="Nama" sortKey="name" sort={sort} onToggle={toggleSort} />
                <SortableCell label="Tile" sortKey="tile" sort={sort} onToggle={toggleSort} />
                <TableCell>Kode produk OtomaX</TableCell>
                <SortableCell label="Status" sortKey="mode" sort={sort} onToggle={toggleSort} />
                <TableCell>Alasan</TableCell>
                <SortableCell label={`Order OtomaX ${d.healthDays} hari`} sortKey="health" sort={sort} onToggle={toggleSort} />
              </TableRow></TableHead>
              <TableBody>
                {pageRows.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell><code>{p.code}</code></TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      {p.name}
                      <Typography variant="caption" color="text.secondary" component="div">{p.category}{p.supplierName ? ` · ${p.supplierName}` : ''}</Typography>
                    </TableCell>
                    <TableCell>{tileLabel.get(p.tile) ?? p.tile}</TableCell>
                    <TableCell>{p.supplierSku ? <code>{p.supplierSku}</code> : '-'}</TableCell>
                    <TableCell><ModeChip mode={p.mode} /></TableCell>
                    <TableCell sx={{ minWidth: 170 }}><Typography variant="body2" color={p.mode === 'AUTO' ? 'text.secondary' : 'text.primary'}>{REASON_LABEL[p.reason]}</Typography></TableCell>
                    <TableCell><HealthCell h={p.health} /></TableCell>
                  </TableRow>
                ))}
                {pageRows.length === 0 && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>Tidak ada paket</TableCell></TableRow>}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={sorted.length}
              page={Math.min(page, Math.max(0, Math.ceil(sorted.length / perPage) - 1))}
              onPageChange={(_e, p) => setPage(p)}
              rowsPerPage={perPage}
              rowsPerPageOptions={[25, 50, 100, 250]}
              onRowsPerPageChange={(e) => setFilter(() => setPerPage(Number(e.target.value)))}
              labelRowsPerPage="Baris"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} dari ${count}`}
            />
          </Paper>

          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Tagihan (biller)</Typography>
          <Paper sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Biller</TableCell><TableCell>Kode cek</TableCell><TableCell>Kode bayar</TableCell><TableCell>Status</TableCell><TableCell>Alasan</TableCell><TableCell>Cek terakhir</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {d.billers.map((b) => (
                  <TableRow key={b.id} hover>
                    <TableCell>{b.name}<Typography variant="caption" color="text.secondary" component="div">{b.key}</Typography></TableCell>
                    <TableCell>{b.checkCode ? <code>{b.checkCode}</code> : '-'}</TableCell>
                    <TableCell>{b.payCode ? <code>{b.payCode}</code> : '-'}</TableCell>
                    <TableCell><ModeChip mode={b.mode} label={b.mode === 'AUTO' ? 'Otomatis' : 'Tidak tersedia'} /></TableCell>
                    <TableCell>{b.reason === 'INACTIVE' ? 'Biller nonaktif' : REASON_LABEL[b.reason]}</TableCell>
                    <TableCell>{b.lastCheck ? <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}><Chip size="small" variant="outlined" label={b.lastCheck.status} /><Typography variant="caption" color="text.secondary">{fmtDate(b.lastCheck.at)}</Typography></Box> : '-'}</TableCell>
                  </TableRow>
                ))}
                {d.billers.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>Belum ada biller</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Paper>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
            Tagihan tanpa OtomaX tidak bisa dicek di aplikasi. Ubah kode di <RouterLink to="/billers">Tagihan (Biller)</RouterLink> atau <RouterLink to="/packages">Paket</RouterLink>.
          </Typography>
        </>
      )}
    </Box>
  );
}
