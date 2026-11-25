import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Select, Switch,
  Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRODUCT_TILES } from 'pulsa-juan-common';
import { KeyboardEvent, useEffect, useMemo, useState } from 'react';

import { api, errMsg, fmtRp } from '../api';
import { useRole } from '../auth/useSession';
import { PageHeader } from './common';
import { SortableCell, useTableSort } from './sortableTable';

// Shared sheet for "Harga Agen" and "Komisi" (meeting 19 Nov 2026).
// "Semua" edits the default for every agent (Package.hargaAgen / .commission);
// picking one agent edits that agent's special value (AgentPackageOverride),
// shown in yellow. Komisi of an agent = what that agent EARNS when its mitra buy.

export type PricingField = 'hargaAgen' | 'commission';

interface Row {
  id: string; code: string; name: string; category: string; supplierName: string | null; isActive: boolean;
  hargaBeli: number; hargaAgen: number; commission: number; priceLocked: boolean;
  override: { hargaAgen: number | null; commission: number | null } | null;
}
interface AgentOption { id: string; name: string; phone: string | null; commisionUniqueId: string }

const YELLOW = '#FFF4C2';
const PAGE = 100;

const groupOf = (category: string) => category.split('_')[0];
const groupLabel = (g: string) => PRODUCT_TILES[g]?.label ?? g;

export default function PricingGrid({ field, title, subtitle }: { field: PricingField; title: string; subtitle: string }) {
  const role = useRole();
  const canEdit = role !== 'STAFF';
  const qc = useQueryClient();
  const [agent, setAgent] = useState<AgentOption | null>(null);
  const [agentSearch, setAgentSearch] = useState('');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [category, setCategory] = useState('');
  const [onlySpecial, setOnlySpecial] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);

  const agents = useQuery({
    queryKey: ['pricing-agents', agentSearch],
    queryFn: async () => (await api.get<{ agents: AgentOption[] }>('/admin/agents', { params: { search: agentSearch || undefined } })).data.agents.slice(0, 50),
  });
  const sheet = useQuery({
    queryKey: ['admin-pricing', agent?.id ?? ''],
    queryFn: async () => (await api.get<{ rows: Row[]; categories: string[] }>('/admin/pricing', { params: { agentId: agent?.id } })).data,
  });

  const special = (r: Row) => (r.override ? r.override[field] : null);
  const effective = (r: Row) => special(r) ?? r[field];
  const groups = useMemo(() => [...new Set((sheet.data?.categories ?? []).map(groupOf))], [sheet.data]);
  const categories = useMemo(() => (sheet.data?.categories ?? []).filter((c) => !group || groupOf(c) === group), [sheet.data, group]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (sheet.data?.rows ?? []).filter((r) =>
      (!group || groupOf(r.category) === group) &&
      (!category || r.category === category) &&
      (!needle || r.code.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle)) &&
      (!onlySpecial || !agent || special(r) !== null));
  }, [sheet.data, q, group, category, onlySpecial, agent]); // eslint-disable-line react-hooks/exhaustive-deps
  const { sorted, sort, toggleSort } = useTableSort(filtered, {
    code: (r) => r.code, name: (r) => r.name, category: (r) => r.category, hargaBeli: (r) => r.hargaBeli,
    hargaAgen: (r) => r.hargaAgen, commission: (r) => r.commission, special: (r) => special(r), effective: (r) => effective(r),
    margin: (r) => (field === 'hargaAgen' ? effective(r) : r.hargaAgen) - r.hargaBeli,
  });
  useEffect(() => { setPage(0); setSelected(new Set()); }, [agent, q, group, category, onlySpecial]);
  const pageRows = sorted.slice(page * PAGE, page * PAGE + PAGE);

  const save = useMutation({
    mutationFn: async (rows: { packageId: string; value: number | null }[]) =>
      (await api.put<{ updated: number }>('/admin/pricing', { agentId: agent?.id, field, rows })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-pricing'] }),
  });

  const noun = field === 'hargaAgen' ? 'harga agen' : 'komisi';
  const specialCount = agent ? (sheet.data?.rows ?? []).filter((r) => special(r) !== null).length : 0;
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggleRow = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = () => setSelected((s) => { const n = new Set(s); pageRows.forEach((r) => (allOnPageSelected ? n.delete(r.id) : n.add(r.id))); return n; });
  const bulkTargets = selected.size ? sorted.filter((r) => selected.has(r.id)) : sorted;

  return (
    <Box>
      <PageHeader title={title} subtitle={subtitle} actions={
        <Autocomplete
          sx={{ width: 320 }}
          size="small"
          options={[null, ...(agents.data ?? [])] as (AgentOption | null)[]}
          value={agent}
          onChange={(_, v) => setAgent(v)}
          onInputChange={(_, v, reason) => { if (reason === 'input') setAgentSearch(v); }}
          getOptionLabel={(o) => (o ? `${o.name}${o.phone ? ' · ' + o.phone : ''}` : 'Semua agen (default)')}
          isOptionEqualToValue={(a, b) => a?.id === b?.id}
          filterOptions={(x) => x}
          renderInput={(params) => <TextField {...params} label="Agen" placeholder="Semua agen (default)" InputLabelProps={{ ...params.InputLabelProps, shrink: true }} />}
          renderOption={(props, o) => (
            <li {...props} key={o?.id ?? 'all'}>
              {o ? <Box><Typography variant="body2">{o.name}</Typography><Typography variant="caption" color="text.secondary">{o.phone ?? '-'} · {o.commisionUniqueId}</Typography></Box> : <b>Semua agen (default)</b>}
            </li>
          )}
        />
      } />

      <Alert severity={agent ? 'warning' : 'info'} sx={{ mb: 2 }}>
        {agent
          ? <>Mengubah <b>{noun} spesial</b> untuk <b>{agent.name}</b>{field === 'commission' ? ' (yang ia terima saat mitranya membeli)' : ''}. Kosongkan sel untuk kembali ke default. Baris kuning = spesial ({specialCount} produk).</>
          : <>Mengubah <b>{noun} default</b> yang berlaku untuk semua agen. {field === 'hargaAgen' ? 'Harga yang diubah di sini dikunci dari Product Updater.' : 'Komisi dibayar ke pengajak (upline) per transaksi sukses, dari margin kita.'}</>}
      </Alert>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
        <TextField size="small" placeholder="Cari kode / nama" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select size="small" value={group} displayEmpty onChange={(e) => { setGroup(e.target.value); setCategory(''); }}>
          <MenuItem value="">Semua grup</MenuItem>
          {groups.map((g) => <MenuItem key={g} value={g}>{groupLabel(g)}</MenuItem>)}
        </Select>
        <Select size="small" value={category} displayEmpty onChange={(e) => setCategory(e.target.value)}>
          <MenuItem value="">Semua kategori</MenuItem>
          {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </Select>
        {agent && <FormControlLabel control={<Switch checked={onlySpecial} onChange={(e) => setOnlySpecial(e.target.checked)} />} label="Hanya spesial" />}
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" color="text.secondary">{filtered.length} produk{selected.size ? ` · ${selected.size} dipilih` : ''}</Typography>
        {canEdit && <Button variant="contained" disabled={!filtered.length} onClick={() => setBulkOpen(true)}>Ubah massal{selected.size ? ` (${selected.size})` : ''}</Button>}
      </Box>
      {save.isError && <Alert severity="error" sx={{ mb: 1 }}>{errMsg(save.error)}</Alert>}

      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {canEdit && <TableCell padding="checkbox"><Checkbox size="small" checked={allOnPageSelected} indeterminate={!allOnPageSelected && pageRows.some((r) => selected.has(r.id))} onChange={togglePage} /></TableCell>}
              <SortableCell label="Kode" sortKey="code" sort={sort} onToggle={toggleSort} />
              <SortableCell label="Produk" sortKey="name" sort={sort} onToggle={toggleSort} />
              <SortableCell label="Kategori" sortKey="category" sort={sort} onToggle={toggleSort} />
              <SortableCell label="Modal" sortKey="hargaBeli" sort={sort} onToggle={toggleSort} align="right" />
              {field === 'commission' && <SortableCell label="Harga agen" sortKey="hargaAgen" sort={sort} onToggle={toggleSort} align="right" />}
              <SortableCell label={field === 'hargaAgen' ? 'Harga default' : 'Komisi default'} sortKey={field} sort={sort} onToggle={toggleSort} align="right" />
              {agent && <SortableCell label={field === 'hargaAgen' ? 'Harga spesial' : 'Komisi spesial'} sortKey="special" sort={sort} onToggle={toggleSort} align="right" />}
              {agent && <SortableCell label="Berlaku" sortKey="effective" sort={sort} onToggle={toggleSort} align="right" />}
              <SortableCell label={field === 'hargaAgen' ? 'Margin' : 'Margin − komisi'} sortKey="margin" sort={sort} onToggle={toggleSort} align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {sheet.isLoading && <TableRow><TableCell colSpan={10}>Memuat...</TableCell></TableRow>}
            {!sheet.isLoading && !pageRows.length && <TableRow><TableCell colSpan={10}>Tidak ada produk.</TableCell></TableRow>}
            {pageRows.map((r) => {
              const sp = special(r);
              const margin = field === 'hargaAgen' ? effective(r) - r.hargaBeli : r.hargaAgen - r.hargaBeli - effective(r);
              return (
                <TableRow key={r.id} hover sx={sp !== null ? { bgcolor: YELLOW, '&:hover': { bgcolor: '#FFEC99 !important' } } : undefined}>
                  {canEdit && <TableCell padding="checkbox"><Checkbox size="small" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} /></TableCell>}
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.code}</TableCell>
                  <TableCell sx={{ minWidth: 200 }}>{r.name}{r.priceLocked && field === 'hargaAgen' && <Chip size="small" label="dikunci" sx={{ ml: 1, height: 18 }} />}</TableCell>
                  <TableCell sx={{ fontSize: 11, color: 'text.secondary', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.category}>{r.category}</TableCell>
                  <TableCell align="right">{fmtRp(r.hargaBeli)}</TableCell>
                  {field === 'commission' && <TableCell align="right">{fmtRp(r.hargaAgen)}</TableCell>}
                  <TableCell align="right">
                    {agent || !canEdit ? fmtRp(r[field]) : (
                      <MoneyCell value={r[field]} allowEmpty={false} onCommit={(v) => save.mutate([{ packageId: r.id, value: v }])} />
                    )}
                  </TableCell>
                  {agent && (
                    <TableCell align="right">
                      {canEdit
                        ? <MoneyCell value={sp} allowEmpty placeholder={fmtRp(r[field])} onCommit={(v) => save.mutate([{ packageId: r.id, value: v }])} />
                        : sp !== null ? fmtRp(sp) : '-'}
                    </TableCell>
                  )}
                  {agent && <TableCell align="right" sx={{ fontWeight: sp !== null ? 700 : 400 }}>{fmtRp(effective(r))}</TableCell>}
                  <TableCell align="right" sx={{ color: margin < 0 ? 'error.main' : 'text.secondary' }}>{fmtRp(margin)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <TablePagination component="div" count={sorted.length} page={page} onPageChange={(_, p) => setPage(p)} rowsPerPage={PAGE} rowsPerPageOptions={[PAGE]} />
      </Paper>

      <BulkDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        count={bulkTargets.length}
        selectedOnly={selected.size > 0}
        agentName={agent?.name ?? null}
        noun={noun}
        busy={save.isPending}
        onApply={async (mode, amount) => {
          const rows = bulkTargets.map((r) => {
            if (mode === 'clear') return { packageId: r.id, value: null };
            if (mode === 'set') return { packageId: r.id, value: amount };
            return { packageId: r.id, value: Math.max(0, effective(r) + amount) };
          });
          await save.mutateAsync(rows);
          setBulkOpen(false);
          setSelected(new Set());
        }}
      />
    </Box>
  );
}

/** A rupiah input that saves on Enter or when leaving the field. */
function MoneyCell({ value, allowEmpty, placeholder, onCommit }: { value: number | null; allowEmpty: boolean; placeholder?: string; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = () => {
    const clean = text.replace(/\D/g, '');
    if (!clean) {
      if (allowEmpty && value !== null) onCommit(null);
      else setText(value === null ? '' : String(value));
      return;
    }
    const n = Number(clean);
    if (n !== value) onCommit(n);
  };
  return (
    <TextField
      size="small"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(value === null ? '' : String(value)); (e.target as HTMLInputElement).blur(); } }}
      inputProps={{ inputMode: 'numeric', style: { textAlign: 'right', padding: '4px 8px', width: 90 } }}
    />
  );
}

type BulkMode = 'set' | 'adjust' | 'clear';

function BulkDialog({ open, onClose, count, selectedOnly, agentName, noun, busy, onApply }: {
  open: boolean; onClose: () => void; count: number; selectedOnly: boolean; agentName: string | null; noun: string; busy: boolean;
  onApply: (mode: BulkMode, amount: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<BulkMode>('set');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setMode('set'); setAmount(''); setError(null); } }, [open]);
  const n = Number(amount.replace(/[^\d-]/g, ''));
  const valid = mode === 'clear' || (amount.trim() !== '' && Number.isFinite(n) && (mode === 'adjust' || n >= 0));
  const target = agentName ? `${noun} spesial ${agentName}` : `${noun} default (semua agen)`;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Ubah massal</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {count} produk {selectedOnly ? 'yang dipilih' : 'sesuai filter'} · {target}
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)} sx={{ mb: 2 }}>
          <ToggleButton value="set">Set ke</ToggleButton>
          <ToggleButton value="adjust">Tambah / kurang</ToggleButton>
          {agentName && <ToggleButton value="clear">Hapus spesial</ToggleButton>}
        </ToggleButtonGroup>
        {mode !== 'clear' && (
          <TextField
            fullWidth
            size="small"
            autoFocus
            label={mode === 'set' ? 'Rp' : 'Rp (pakai minus untuk mengurangi, mis. -500)'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        )}
        {mode === 'clear' && <Typography variant="body2" color="text.secondary">Produk ini kembali memakai {noun} default.</Typography>}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Batal</Button>
        <Button
          variant="contained"
          disabled={!valid || busy || count === 0}
          onClick={async () => {
            setError(null);
            try {
              await onApply(mode, n);
            } catch (e) {
              setError(errMsg(e));
            }
          }}
        >
          {busy ? 'Menyimpan...' : `Terapkan ke ${count} produk`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
