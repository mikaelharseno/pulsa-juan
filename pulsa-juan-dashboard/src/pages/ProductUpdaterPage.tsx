import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, InputAdornment, MenuItem, Paper, Select, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMarketExport, isOtomaxExport, OtomaxExportRow, planOtomaxImport, PROVIDERS, readOtomaxExport, SkipReason } from 'pulsa-juan-common';
import { useMemo, useState } from 'react';

import { api, errMsg, fmtDate, fmtRp } from '../api';
import { ConfirmDialog, PageHeader } from '../components/common';
import { FileDropZone } from '../components/DropZone';
import { readCsv } from '../lib/csv';
import { readXlsx } from '../lib/xlsx';

type Provider = (typeof PROVIDERS)[number];
type Status = 'NEW' | 'PRICE_CHANGED' | 'DETAILS_CHANGED' | 'UNCHANGED' | 'REACTIVATED' | 'DEACTIVATED' | 'ERROR';

interface Rule { fixed: number; percent: number; roundTo: number }
type CodeType = 'OTOMAX' | 'MARKET';
interface SheetRow { provider: Provider; sku: string; name: string; category: string; description: string; cost: number }
interface ParsedSheet { name: string; provider: Provider | 'SKIP'; rows: Omit<SheetRow, 'provider'>[]; problem: string | null; market: boolean }
interface PreviewRow {
  sku: string; provider: Provider; name: string; category: string; categoryLabel: string; status: Status;
  cost: number | null; oldCost: number | null; agentPrice: number | null; oldAgentPrice: number | null; priceLocked: boolean; warnings: string[]; error: string | null;
}
interface TilePreview { provider: Provider; slug: string; categories: number; products: number; marketProducts: number; errors: string[] }
interface PreviewResult { rows: PreviewRow[]; summary: Record<Status, number>; tiles?: TilePreview[] }
interface ApplyResult extends PreviewResult { segments: { provider: string; slug: string; published: boolean; version?: number; categories: number }[] }
interface HistoryRow { id: string; fileName: string; createdAt: string; admin: { name: string; email: string } | null; summary: { counts: Record<Status, number>; rule: Rule; codeType?: CodeType } }

const FILE_ACCEPT = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/csv': ['.csv'],
  'text/tab-separated-values': ['.tsv'],
  'text/plain': ['.txt'],
};

const SKIP_LABEL: Record<SkipReason, string> = {
  INACTIVE: 'nonaktif di OtomaX',
  UNAVAILABLE: 'kosong/gangguan',
  EXCLUDED: 'tidak diimpor',
  UNSUPPORTED: 'belum didukung',
  DUPLICATE: 'duplikat',
  NO_PRICE: 'tanpa harga',
};

const STATUS: Record<Status, { label: string; color: 'default' | 'success' | 'warning' | 'info' | 'error' }> = {
  NEW: { label: 'Baru', color: 'success' },
  PRICE_CHANGED: { label: 'Harga berubah', color: 'warning' },
  DETAILS_CHANGED: { label: 'Detail berubah', color: 'info' },
  UNCHANGED: { label: 'Tetap', color: 'default' },
  REACTIVATED: { label: 'Diaktifkan lagi', color: 'success' },
  DEACTIVATED: { label: 'Dinonaktifkan', color: 'default' },
  ERROR: { label: 'Error', color: 'error' },
};
const FILTERS: (Status | 'ALL' | 'CHANGES')[] = ['CHANGES', 'ALL', 'NEW', 'PRICE_CHANGED', 'DETAILS_CHANGED', 'REACTIVATED', 'DEACTIVATED', 'UNCHANGED', 'ERROR'];

/** Sheet name → operator: INDOSAT/IM3/M3, 3ID/TRI/THREE, XL, AXIS, TSEL/TELKOMSEL, SMARTFREN. */
function detectProvider(sheet: string): Provider | 'SKIP' {
  const s = sheet.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/INDOSAT|IM3|^M3|OOREDOO/.test(s)) return 'INDOSAT';
  if (/^3|TRI|THREE/.test(s)) return 'TRI';
  if (/AXIS/.test(s)) return 'AXIS';
  if (/^XL/.test(s)) return 'XL';
  if (/TSEL|TELKOMSEL|SIMPATI/.test(s)) return 'TELKOMSEL';
  if (/SMART/.test(s)) return 'SMARTFREN';
  return 'SKIP';
}

/** Finds the header row by its labels (KODE PRODUK, NAMA, KATEGORI, KET, HARGA) and reads the rows under it. */
function parseSheet(name: string, rows: string[][]): ParsedSheet {
  const norm = (s: string) => s.trim().toUpperCase();
  const headerIdx = rows.findIndex((r) => r.some((c) => /^KODE/.test(norm(c))) && r.some((c) => /^HARGA/.test(norm(c))));
  if (headerIdx < 0) return { name, provider: 'SKIP', rows: [], problem: 'Header KODE PRODUK / HARGA tidak ditemukan', market: false };
  const header = rows[headerIdx].map(norm);
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const c = { sku: col(/^KODE/), name: col(/^NAMA/), category: col(/^KATEGORI/), description: col(/^(KET|DESKRIPSI)/), cost: col(/^HARGA/) };
  if (c.name < 0 || c.category < 0) return { name, provider: 'SKIP', rows: [], problem: 'Kolom NAMA / KATEGORI tidak ditemukan', market: false };
  const toInt = (s: string) => (/^\d+(\.\d+)?$/.test(s.trim()) ? Math.round(Number(s)) : Number(s.replace(/[^\d]/g, '')) || 0);
  const parsed = rows
    .slice(headerIdx + 1)
    .filter((r) => (r[c.sku] ?? '').trim())
    .map((r) => ({
      sku: r[c.sku].trim(),
      name: (r[c.name] ?? '').trim(),
      category: (r[c.category] ?? '').trim() || 'LAINNYA',
      description: c.description >= 0 ? (r[c.description] ?? '').trim() : '',
      cost: toInt(r[c.cost] ?? ''),
    }));
  // files from scripts/market-prices/collect.mjs carry a "SUMBER HARGA" column
  const market = header.some((h) => /^SUMBER HARGA/.test(h));
  return { name, provider: detectProvider(name), rows: parsed, problem: parsed.length ? null : 'Tidak ada baris produk', market };
}

export default function ProductUpdaterPage() {
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ['product-updater'],
    queryFn: async () => (await api.get<{ rule: Rule; history: HistoryRow[] }>('/admin/product-updater')).data,
  });
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null);
  // OtomaX "Produk" export: one file with every product group, cost = Hrg Beli
  const [exported, setExported] = useState<OtomaxExportRow[] | null>(null);
  const [groupInclude, setGroupInclude] = useState<Record<string, boolean>>({});
  const [retire, setRetire] = useState<Provider[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [ruleEdit, setRuleEdit] = useState<Rule | null>(null);
  const rule = ruleEdit ?? info.data?.rule ?? { fixed: 0, percent: 0, roundTo: 100 };
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [codeType, setCodeType] = useState<CodeType>('OTOMAX');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('CHANGES');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const exportPlan = useMemo(() => (exported ? planOtomaxImport(exported, groupInclude) : null), [exported, groupInclude]);

  const payload = useMemo(() => {
    const rows: (SheetRow & { agentPrice?: number })[] = [];
    const withOverride = (r: SheetRow) => ({ ...r, ...(overrides[r.sku] ? { agentPrice: overrides[r.sku] } : {}) });
    if (exportPlan) for (const r of exportPlan.rows) rows.push(withOverride(r));
    for (const s of sheets ?? []) {
      if (s.provider === 'SKIP') continue;
      for (const r of s.rows) rows.push(withOverride({ ...r, provider: s.provider as Provider }));
    }
    return { fileName: fileName || 'upload.xlsx', codeType, rule, rows, retireMarketFor: codeType === 'OTOMAX' ? retire : [] };
  }, [exportPlan, sheets, fileName, codeType, rule, overrides, retire]);

  const preview = useMutation({
    mutationFn: async () => (await api.post<PreviewResult>('/admin/product-updater/preview', payload)).data,
  });
  const apply = useMutation({
    mutationFn: async () => (await api.post<ApplyResult>('/admin/product-updater/apply', payload)).data,
    onSuccess: (data) => {
      setResult(data);
      setConfirm(false);
      preview.reset();
      setSheets(null);
      setExported(null);
      setRetire([]);
      setOverrides({});
      qc.invalidateQueries({ queryKey: ['product-updater'] });
      qc.invalidateQueries({ queryKey: ['admin-packages'] });
      qc.invalidateQueries({ queryKey: ['admin-segments'] });
    },
  });

  const onFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setReadError(null);
    setResult(null);
    preview.reset();
    setOverrides({});
    try {
      const raw = /\.(csv|tsv|txt)$/i.test(f.name) ? await readCsv(f) : await readXlsx(f);
      setFileName(f.name);
      setRetire([]);
      const exportSheet = raw.find((s) => s.rows.some(isOtomaxExport));
      if (exportSheet) {
        setExported(readOtomaxExport(exportSheet.rows));
        setGroupInclude({});
        setSheets(null);
        // the market collector writes the same layout plus a "Sumber Harga" column
        setCodeType(exportSheet.rows.some(isMarketExport) ? 'MARKET' : 'OTOMAX');
        return;
      }
      const parsed = raw.map((s) => parseSheet(s.name, s.rows));
      setExported(null);
      setSheets(parsed);
      setCodeType(parsed.some((s) => s.market) ? 'MARKET' : 'OTOMAX');
    } catch (e) {
      setReadError((e as Error).message || 'File tidak bisa dibaca');
    }
  };

  const rows = preview.data?.rows ?? [];
  const shown = rows.filter((r) => (filter === 'ALL' ? true : filter === 'CHANGES' ? r.status !== 'UNCHANGED' : r.status === filter));
  const s = preview.data?.summary;
  const changes = s ? s.NEW + s.PRICE_CHANGED + s.DETAILS_CHANGED + s.REACTIVATED + s.DEACTIVATED : 0;
  const tileErrors = (preview.data?.tiles ?? []).filter((t) => t.errors.length);
  // tiles that still mix in market products, plus the ones the admin chose to clean up
  const marketTiles = (preview.data?.tiles ?? []).filter((t) => t.marketProducts > 0 || retire.includes(t.provider));
  const ruleNum = (k: keyof Rule) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setRuleEdit({ ...rule, [k]: Number(e.target.value) || 0 });
    preview.reset();
  };

  return (
    <Box>
      <PageHeader
        title="Product Updater"
        subtitle="Unggah ekspor Produk dari OtomaX (.tsv: Kode, Nama, Provider, Hrg Beli = modal) atau daftar harga .xlsx (satu sheet per operator: KODE PRODUK, NAMA, KATEGORI, KET, harga = modal). Harga agen = modal + margin. Produk tampil di aplikasi sebagai tile Paket <Operator> dan diproses otomatis via OtomaX."
      />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>1. File harga</Typography>
        <FileDropZone accept={FILE_ACCEPT} onFiles={onFile} label={fileName ? `${fileName} — klik atau tarik file lain untuk mengganti` : 'Tarik & letakkan file .tsv / .xlsx / .csv, atau klik untuk pilih'} />
        <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Kode produk di file:</Typography>
          <ToggleButtonGroup size="small" exclusive value={codeType} disabled={!!exported} onChange={(_, v) => { if (v) { setCodeType(v); preview.reset(); } }}>
            <ToggleButton value="OTOMAX">Kode OtomaX (otomatis)</ToggleButton>
            <ToggleButton value="MARKET">Kode referensi pasar (manual)</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 260 }}>
            {codeType === 'OTOMAX'
              ? 'Kode = kode produk di OtomaX kita; order dikirim otomatis bila OtomaX terhubung.'
              : 'Kode dari daftar harga penjual lain (mis. hasil collect.mjs). Disimpan sebagai PSR-<kode>, diproses manual sampai Kode produk OtomaX diisi di halaman Paket. Tidak menyentuh produk OtomaX.'}
          </Typography>
        </Box>
        {readError && <Alert severity="error" sx={{ mt: 1 }}>{readError}</Alert>}
        {exportPlan && (
          <>
            <Alert severity="info" sx={{ mt: 2 }}>
              {codeType === 'MARKET' ? (
                <>Daftar harga pasar (format ekspor OtomaX): {exportPlan.rows.length} produk akan diimpor sebagai produk manual PSR-, modal = harga pasar termurah. </>
              ) : (
                <>Ekspor Produk OtomaX: {exportPlan.rows.length} produk operator akan diimpor. Modal = <b>Hrg Beli</b> (akun reseller aplikasi di OtomaX membayar harga beli). </>
              )}
              Produk yang sama persis (nama &amp; harga) hanya diambil sekali. E-wallet, game, token PLN dan tagihan belum didukung di sini.
            </Alert>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">Impor</TableCell><TableCell>Grup OtomaX</TableCell><TableCell>Operator · kategori</TableCell><TableCell>Contoh</TableCell>
                    <TableCell align="right">Produk</TableCell><TableCell align="right">Diimpor</TableCell><TableCell>Dilewati</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[...exportPlan.groups].sort((a, b) => Number(!!b.mapping) - Number(!!a.mapping) || b.imported - a.imported).map((g) => (
                    <TableRow key={g.group} sx={{ opacity: g.mapping ? 1 : 0.55 }}>
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={g.include} disabled={!g.mapping} onChange={(e) => { setGroupInclude({ ...groupInclude, [g.group]: e.target.checked }); preview.reset(); }} />
                      </TableCell>
                      <TableCell><code>{g.group}</code></TableCell>
                      <TableCell>
                        {g.mapping ? `${g.mapping.operator} · ${g.mapping.label}` : 'Belum didukung'}
                        {g.mapping?.note && <Typography variant="caption" color="text.secondary" component="div">{g.mapping.note}</Typography>}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 320 }}><Typography variant="caption">{g.examples.join(' · ')}</Typography></TableCell>
                      <TableCell align="right">{g.total}</TableCell>
                      <TableCell align="right">{g.imported}</TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {(Object.entries(g.skipped) as [SkipReason, number][]).map(([k, n]) => `${n} ${SKIP_LABEL[k]}`).join(', ')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
        {sheets && (
          <Table size="small" sx={{ mt: 2, maxWidth: 720 }}>
            <TableHead><TableRow><TableCell>Sheet</TableCell><TableCell align="right">Produk</TableCell><TableCell>Operator</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {sheets.map((sh, i) => (
                <TableRow key={sh.name}>
                  <TableCell><b>{sh.name}</b></TableCell>
                  <TableCell align="right">{sh.rows.length}</TableCell>
                  <TableCell>
                    <Select size="small" value={sh.provider} disabled={!!sh.problem} onChange={(e) => { setSheets(sheets.map((x, j) => (j === i ? { ...x, provider: e.target.value as Provider | 'SKIP' } : x))); preview.reset(); }}>
                      <MenuItem value="SKIP">Lewati</MenuItem>
                      {PROVIDERS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                    </Select>
                  </TableCell>
                  <TableCell><Typography variant="caption" color="error">{sh.problem}</Typography></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>2. Margin</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" label="Tambah tetap" type="number" value={rule.fixed} onChange={ruleNum('fixed')} InputProps={{ startAdornment: <InputAdornment position="start">Rp</InputAdornment> }} sx={{ width: 170 }} />
          <TextField size="small" label="Tambah persen" type="number" value={rule.percent} onChange={ruleNum('percent')} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} sx={{ width: 150 }} />
          <TextField size="small" label="Bulatkan ke atas ke" type="number" value={rule.roundTo} onChange={ruleNum('roundTo')} InputProps={{ startAdornment: <InputAdornment position="start">Rp</InputAdornment> }} sx={{ width: 190 }} />
          <Typography variant="body2" color="text.secondary">
            Contoh: modal {fmtRp(8000)} → harga agen <b>{fmtRp(Math.ceil((8000 + rule.fixed + (8000 * rule.percent) / 100) / Math.max(1, rule.roundTo)) * Math.max(1, rule.roundTo))}</b>
          </Typography>
        </Box>
        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
          <Button variant="contained" disabled={!payload.rows.length || preview.isPending} onClick={() => preview.mutate()}>
            {preview.isPending ? 'Menghitung…' : preview.data ? 'Pratinjau ulang' : 'Pratinjau perubahan'}
          </Button>
          {preview.data && (
            <Button variant="contained" color="success" disabled={changes === 0 || s!.ERROR === payload.rows.length || tileErrors.length > 0} onClick={() => { apply.reset(); setConfirm(true); }}>
              Terapkan {changes} perubahan
            </Button>
          )}
        </Box>
        {preview.isError && <Alert severity="error" sx={{ mt: 1 }}>{errMsg(preview.error)}</Alert>}
        {preview.data?.tiles && (
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {preview.data.tiles.map((t) => (
              <Chip
                key={t.slug}
                size="small"
                color={t.errors.length ? 'error' : 'default'}
                variant="outlined"
                label={`Tile ${t.slug}: ${t.products} produk · ${t.categories} kategori${t.categories > 50 ? ' (dibagi ke beberapa halaman)' : ''}`}
              />
            ))}
          </Box>
        )}
        {tileErrors.map((t) => <Alert key={t.slug} severity="error" sx={{ mt: 1 }}>Tile {t.slug} tidak valid: {t.errors.slice(0, 3).join('; ')}</Alert>)}
        {codeType === 'OTOMAX' && marketTiles.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Produk pasar (manual, kode PSR-) di tile yang sama</Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              Centang untuk menyembunyikan produk pasar operator itu, sehingga agen hanya melihat produk OtomaX (otomatis). Biarkan kosong bila produk pasar masih perlu dijual manual.
            </Typography>
            {marketTiles.map((t) => (
              <FormControlLabel
                key={t.provider}
                control={<Checkbox size="small" checked={retire.includes(t.provider)} onChange={(e) => { setRetire(e.target.checked ? [...retire, t.provider] : retire.filter((x) => x !== t.provider)); preview.reset(); }} />}
                label={retire.includes(t.provider) ? `${t.slug}: produk pasar disembunyikan` : `${t.slug}: sembunyikan ${t.marketProducts} produk pasar`}
              />
            ))}
          </Box>
        )}
      </Paper>

      {result && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Diterapkan: {result.summary.NEW} baru, {result.summary.PRICE_CHANGED} harga berubah, {result.summary.DETAILS_CHANGED} detail berubah, {result.summary.REACTIVATED} diaktifkan lagi, {result.summary.DEACTIVATED} dinonaktifkan.{' '}
          {result.segments.map((sg) => `${sg.slug}: ${sg.published ? `versi ${sg.version} dipublikasikan` : 'tidak berubah'} (${sg.categories} kategori)`).join(' · ')}
        </Alert>
      )}

      {preview.data && (
        <Paper sx={{ mb: 2 }}>
          <Tabs value={filter} onChange={(_, v) => setFilter(v)} variant="scrollable" sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
            {FILTERS.map((f) => {
              const n = f === 'ALL' ? rows.length : f === 'CHANGES' ? changes : s![f];
              const label = f === 'ALL' ? 'Semua' : f === 'CHANGES' ? 'Perubahan' : STATUS[f].label;
              return <Tab key={f} value={f} label={`${label} (${n})`} disabled={n === 0 && f !== 'CHANGES'} />;
            })}
          </Tabs>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Status</TableCell><TableCell>Operator</TableCell><TableCell>Kode</TableCell><TableCell>Nama</TableCell><TableCell>Kategori</TableCell>
                  <TableCell align="right">Modal</TableCell><TableCell align="right">Harga agen</TableCell><TableCell align="right">Margin</TableCell><TableCell>Catatan</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={`${r.status}-${r.sku}`} hover>
                    <TableCell><Chip size="small" label={STATUS[r.status].label} color={STATUS[r.status].color} variant={STATUS[r.status].color === 'default' ? 'outlined' : 'filled'} /></TableCell>
                    <TableCell>{r.provider}</TableCell>
                    <TableCell><code>{r.sku}</code></TableCell>
                    <TableCell sx={{ maxWidth: 260 }}>{r.name}</TableCell>
                    <TableCell>{r.categoryLabel}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {r.oldCost !== null && r.cost !== null && r.oldCost !== r.cost && <Typography variant="caption" color="text.secondary" sx={{ textDecoration: 'line-through', mr: 0.5 }}>{fmtRp(r.oldCost)}</Typography>}
                      {r.cost !== null ? fmtRp(r.cost) : fmtRp(r.oldCost)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {r.status === 'ERROR' || r.status === 'DEACTIVATED' ? (
                        fmtRp(r.oldAgentPrice)
                      ) : (
                        <>
                          {r.oldAgentPrice !== null && r.oldAgentPrice !== r.agentPrice && <Typography variant="caption" color="text.secondary" sx={{ textDecoration: 'line-through', mr: 0.5 }}>{fmtRp(r.oldAgentPrice)}</Typography>}
                          <TextField
                            size="small"
                            type="number"
                            value={overrides[r.sku] ?? r.agentPrice ?? ''}
                            onChange={(e) => setOverrides({ ...overrides, [r.sku]: Number(e.target.value) || 0 })}
                            sx={{ width: 120 }}
                            inputProps={{ style: { textAlign: 'right' } }}
                            InputProps={{ startAdornment: r.priceLocked || overrides[r.sku] ? <InputAdornment position="start" title="Harga dikunci (manual)">🔒</InputAdornment> : undefined }}
                          />
                        </>
                      )}
                    </TableCell>
                    <TableCell align="right">{r.cost !== null && r.agentPrice !== null ? fmtRp((overrides[r.sku] ?? r.agentPrice) - r.cost) : '-'}</TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      {r.error && <Typography variant="caption" color="error">{r.error}</Typography>}
                      {r.warnings.map((w) => <Typography key={w} variant="caption" color="warning.main" component="div">{w}</Typography>)}
                    </TableCell>
                  </TableRow>
                ))}
                {shown.length === 0 && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>Tidak ada baris</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
          {Object.keys(overrides).length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 1.5 }}>
              {Object.keys(overrides).length} harga diubah manual akan dikunci (tidak ikut margin di upload berikutnya). Klik Pratinjau ulang untuk menghitung ulang ringkasan.
            </Typography>
          )}
        </Paper>
      )}

      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Riwayat update</Typography>
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Waktu</TableCell><TableCell>File</TableCell><TableCell>Admin</TableCell><TableCell>Margin</TableCell><TableCell>Hasil</TableCell></TableRow></TableHead>
          <TableBody>
            {(info.data?.history ?? []).map((h) => {
              const c = h.summary.counts;
              return (
                <TableRow key={h.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(h.createdAt)}</TableCell>
                  <TableCell>{h.fileName}{h.summary.codeType === 'MARKET' && <Chip size="small" label="pasar" sx={{ ml: 1 }} />}</TableCell>
                  <TableCell>{h.admin?.name ?? '-'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>+{fmtRp(h.summary.rule.fixed)} +{h.summary.rule.percent}% ↑{fmtRp(h.summary.rule.roundTo)}</TableCell>
                  <TableCell>{c.NEW} baru · {c.PRICE_CHANGED} harga · {c.DETAILS_CHANGED} detail · {c.REACTIVATED} aktif lagi · {c.DEACTIVATED} nonaktif{c.ERROR ? ` · ${c.ERROR} error` : ''}</TableCell>
                </TableRow>
              );
            })}
            {info.isSuccess && info.data.history.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>Belum ada update</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>

      <ConfirmDialog
        open={confirm}
        title="Terapkan perubahan produk?"
        confirmLabel="Terapkan"
        confirmColor="success"
        busy={apply.isPending}
        error={apply.isError ? errMsg(apply.error) : null}
        onClose={() => setConfirm(false)}
        onConfirm={() => apply.mutate()}
      >
        {s && (
          <Typography variant="body2">
            {s.NEW} produk baru, {s.PRICE_CHANGED} harga berubah, {s.DETAILS_CHANGED} detail berubah, {s.REACTIVATED} diaktifkan lagi, {s.DEACTIVATED} dinonaktifkan
            {s.ERROR ? ` (${s.ERROR} baris error dilewati)` : ''}. Harga baru langsung berlaku di aplikasi, dan tile Paket per operator dipublikasikan ulang bila kategorinya berubah.
          </Typography>
        )}
      </ConfirmDialog>
    </Box>
  );
}
