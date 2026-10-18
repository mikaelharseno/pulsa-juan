import { ArrowBack, Delete, History, Publish, Redo, Save, Undo } from '@mui/icons-material';
import { Alert, Badge, Box, Button, Chip, Divider, IconButton, List, ListItemButton, ListItemText, Menu, MenuItem, Paper, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NODE_TYPE_LABELS, NODE_TYPES, NodeId, NodeType, PackagePublic, reachableIds, SegmentTree, TreeError, TreeNode, validateTreeStructure } from 'pulsa-juan-common';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api, errMsg, fmtDate } from '../../api';
import { ConfirmDialog } from '../../components/common';
import { SegmentRow, hasUnpublishedDraft } from '../SegmentsPage';
import { changeType, defaultNode, edges, emptyTree, exclusiveSubtree, randomNodeId, relink } from './model';
import { CommonFields, FormCtx, NODE_FORMS } from './NodeForms';
import { Preview } from './Preview';
import { useTreeHistory } from './useTreeHistory';

interface SegmentDetail extends SegmentRow {
  draftTree: SegmentTree | null;
  publishedVersion: (SegmentRow['publishedVersion'] & { tree: SegmentTree }) | null;
  packages: Record<string, PackagePublic>;
}

export default function TreeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const seg = useQuery({ queryKey: ['admin-segment', id], queryFn: async () => (await api.get<SegmentDetail>(`/admin/segments/${id}`)).data });
  const allPackages = useQuery({ queryKey: ['admin-packages', '', ''], queryFn: async () => (await api.get<{ packages: PackagePublic[] }>('/admin/packages')).data.packages });
  const packages = useMemo(() => Object.fromEntries((allPackages.data ?? []).map((p) => [p.id, p])), [allPackages.data]);
  const categories = useMemo(() => Array.from(new Set((allPackages.data ?? []).map((p) => p.category))).sort(), [allPackages.data]);

  const history = useTreeHistory(null);
  const { tree, set, reset, undo, redo, canUndo, canRedo } = history;
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (seg.data && tree === null) {
      const initial = seg.data.draftTree ?? seg.data.publishedVersion?.tree ?? null;
      reset(initial);
      setSelected(initial?.rootId ?? null);
    }
  }, [seg.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: SegmentTree) => { set(next); setDirty(true); };
  const errors: TreeError[] = useMemo(() => (tree ? validateTreeStructure(tree, { packages }) : []), [tree, packages]);
  const [serverErrors, setServerErrors] = useState<TreeError[]>([]);
  const allErrors = [...errors, ...serverErrors];
  const errorsFor = (nodeId: NodeId, field?: string) => allErrors.filter((e) => e.nodeId === nodeId && (field ? e.field === field : true)).map((e) => e.message);
  const errorCount = (nodeId: NodeId) => allErrors.filter((e) => e.nodeId === nodeId && e.severity === 'error').length;

  const setNode = (node: TreeNode) => tree && update({ ...tree, nodes: { ...tree.nodes, [node.id]: node } });
  const addChild = (type: NodeType, link: (childId: NodeId) => void) => {
    if (!tree) return;
    const nid = randomNodeId();
    // link() mutates through the parent form's onChange, which reads `tree`; do the insert first
    pendingInsert = defaultNode(type, nid);
    link(nid);
    pendingInsert = null;
    setSelected(nid);
  };
  // The child insert and the parent link must land in one history entry: setNode is intercepted below.
  let pendingInsert: TreeNode | null = null;
  const setNodeWithInsert = (node: TreeNode) => {
    if (!tree) return;
    const nodes = { ...tree.nodes, [node.id]: node };
    if (pendingInsert) nodes[pendingInsert.id] = pendingInsert;
    update({ ...tree, nodes });
  };

  const ctx: FormCtx = { tree: tree ?? emptyTree('ListNode'), packages, categories, errorsFor, select: setSelected, addChild };

  const [deleting, setDeleting] = useState(false);
  const deleteSubtree = () => {
    if (!tree || !selected || selected === tree.rootId) return;
    const doomed = new Set(exclusiveSubtree(tree, selected));
    const nodes: Record<string, TreeNode> = {};
    for (const [k, n] of Object.entries(tree.nodes)) if (!doomed.has(k)) nodes[k] = relink(n, selected, null);
    update({ ...tree, nodes });
    setSelected(tree.rootId);
    setDeleting(false);
  };

  const [startAnchor, setStartAnchor] = useState<null | HTMLElement>(null);
  const [typeChange, setTypeChange] = useState<NodeType | null>(null);

  const saveDraft = useMutation({
    mutationFn: async () => (await api.put(`/admin/segments/${id}/draft`, { tree })).data,
    onSuccess: () => { setDirty(false); setServerErrors([]); qc.invalidateQueries({ queryKey: ['admin-segment', id] }); qc.invalidateQueries({ queryKey: ['admin-segments'] }); },
    onError: (e) => setServerErrors(((e as { response?: { data?: { errors?: TreeError[] } } }).response?.data?.errors) ?? []),
  });
  const publish = useMutation({
    mutationFn: async () => { if (dirty) await api.put(`/admin/segments/${id}/draft`, { tree }); return (await api.post(`/admin/segments/${id}/publish`)).data; },
    onSuccess: () => { setDirty(false); setServerErrors([]); qc.invalidateQueries({ queryKey: ['admin-segment', id] }); qc.invalidateQueries({ queryKey: ['admin-segments'] }); },
    onError: (e) => setServerErrors(((e as { response?: { data?: { errors?: TreeError[] } } }).response?.data?.errors) ?? []),
  });
  const discard = useMutation({ mutationFn: async () => (await api.post<SegmentDetail>(`/admin/segments/${id}/discard-draft`)).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-segment', id] }); reset(null); setDirty(false); } });
  const versions = useQuery({ queryKey: ['admin-segment-versions', id], queryFn: async () => (await api.get<{ versions: { id: string; version: number; publishedAt: string; publishedBy: string }[] }>(`/admin/segments/${id}/versions`)).data.versions, enabled: false });
  const [versionsOpen, setVersionsOpen] = useState(false);
  const restore = useMutation({ mutationFn: async (versionId: string) => (await api.post(`/admin/segments/${id}/restore`, { versionId })).data, onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-segment', id] }); reset(null); setDirty(false); setVersionsOpen(false); } });

  if (seg.isLoading || !seg.data) return <Typography>Memuat...</Typography>;
  const s = seg.data;
  const blocking = allErrors.some((e) => e.severity === 'error');

  // ---- outline ----
  const reachable = tree ? reachableIds(tree) : new Set<string>();
  const renderOutline = (nid: NodeId, edge: string | null, depth: number, path: Set<string>): React.ReactNode => {
    const node = tree?.nodes[nid];
    if (!node) return <ListItemButton key={nid + edge} sx={{ pl: 2 + depth * 2 }}><ListItemText primary={<Typography variant="body2" color="error">{edge ? edge + ' → ' : ''}"{nid}" tidak ada</Typography>} /></ListItemButton>;
    const cyclic = path.has(nid);
    const item = (
      <ListItemButton key={nid + '|' + edge + '|' + depth} selected={selected === nid} onClick={() => setSelected(nid)} sx={{ pl: 2 + depth * 2, py: 0.5, borderRadius: 1 }}>
        <ListItemText
          primary={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {edge && <Typography variant="caption" color="text.secondary">{edge} →</Typography>}
            <Badge badgeContent={errorCount(nid)} color="error"><Chip size="small" label={NODE_TYPE_LABELS[node.type]} sx={{ height: 20, fontSize: 11 }} /></Badge>
            <Typography variant="body2" noWrap sx={{ fontWeight: selected === nid ? 700 : 500 }}>{node.title || node.id}</Typography>
          </Box>}
        />
      </ListItemButton>
    );
    if (cyclic) return item;
    const next = new Set(path); next.add(nid);
    return [item, ...edges(node).map((e) => renderOutline(e.childId, e.label, depth + 1, next))];
  };
  const orphans = tree ? Object.keys(tree.nodes).filter((k) => !reachable.has(k)) : [];
  const node = tree && selected ? tree.nodes[selected] ?? null : null;
  const Form = node ? (NODE_FORMS[node.type] as React.ComponentType<{ node: TreeNode; ctx: FormCtx; onChange: (n: TreeNode) => void }>) : null;

  return (
    <Box sx={{ mx: { xs: -2, md: -3 }, mt: { xs: -2, md: -3 }, height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: '1px solid #E3E9EA', bgcolor: '#fff', flexWrap: 'wrap' }}>
        <IconButton onClick={() => nav('/segments')}><ArrowBack /></IconButton>
        <Box sx={{ mr: 1 }}>
          <Typography sx={{ fontWeight: 800 }}>{s.label} <Typography component="span" variant="caption" color="text.secondary">/{s.slug}</Typography></Typography>
          <Typography variant="caption" color="text.secondary">
            {s.publishedVersion ? `Published v${s.publishedVersion.version} · ${fmtDate(s.publishedVersion.publishedAt)}` : 'Belum dipublikasi'} {(dirty || hasUnpublishedDraft(s)) && <Chip size="small" color="warning" label={`Draf${dirty ? ' (belum disimpan)' : ' belum dipublikasi'}`} sx={{ ml: 1, height: 18 }} />}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Undo"><span><IconButton onClick={undo} disabled={!canUndo}><Undo /></IconButton></span></Tooltip>
        <Tooltip title="Redo"><span><IconButton onClick={redo} disabled={!canRedo}><Redo /></IconButton></span></Tooltip>
        <Button startIcon={<History />} onClick={() => { versions.refetch(); setVersionsOpen(true); }}>Riwayat</Button>
        <Button color="error" onClick={() => window.confirm('Buang draf dan kembali ke versi terpublikasi?') && discard.mutate()} disabled={!s.draftTree || discard.isPending}>Buang draf</Button>
        <Button variant="outlined" startIcon={<Save />} onClick={() => saveDraft.mutate()} disabled={!tree || saveDraft.isPending}>Simpan draf</Button>
        <Button variant="contained" startIcon={<Publish />} onClick={() => publish.mutate()} disabled={!tree || blocking || publish.isPending}>Publikasikan</Button>
      </Box>
      {(saveDraft.isError || publish.isError) && <Alert severity="error" sx={{ borderRadius: 0 }}>{errMsg(saveDraft.error ?? publish.error)}</Alert>}
      {saveDraft.isSuccess && !dirty && <Alert severity="success" sx={{ borderRadius: 0 }}>Draf tersimpan.</Alert>}
      {publish.isSuccess && !dirty && <Alert severity="success" sx={{ borderRadius: 0 }}>Alur dipublikasikan — agen langsung melihat versi baru.</Alert>}

      {!tree ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ mb: 2 }}>Segmen ini belum punya alur. Pilih layar pertama yang dilihat agen:</Typography>
          <Button variant="contained" onClick={(e) => setStartAnchor(e.currentTarget)}>Mulai alur</Button>
          <Menu open={!!startAnchor} anchorEl={startAnchor} onClose={() => setStartAnchor(null)}>
            {NODE_TYPES.map((t) => <MenuItem key={t} onClick={() => { const t0 = emptyTree(t); update(t0); setSelected(t0.rootId); setStartAnchor(null); }}>{NODE_TYPE_LABELS[t]}</MenuItem>)}
          </Menu>
        </Box>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <Paper square sx={{ width: 300, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid #E3E9EA' }}>
            <Typography variant="overline" sx={{ px: 2, pt: 1, display: 'block', color: 'text.secondary' }}>Alur</Typography>
            <List dense disablePadding sx={{ px: 1 }}>{renderOutline(tree.rootId, null, 0, new Set())}</List>
            {orphans.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="overline" sx={{ px: 2, display: 'block', color: 'warning.main' }}>Tidak terhubung</Typography>
                <List dense disablePadding sx={{ px: 1 }}>{orphans.map((o) => <ListItemButton key={o} selected={selected === o} onClick={() => setSelected(o)} sx={{ borderRadius: 1, py: 0.5 }}><ListItemText primary={<Typography variant="body2">{tree.nodes[o].title || o} <Typography component="span" variant="caption" color="text.secondary">({NODE_TYPE_LABELS[tree.nodes[o].type]})</Typography></Typography>} /></ListItemButton>)}</List>
              </>
            )}
            {allErrors.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="overline" sx={{ px: 2, display: 'block', color: 'error.main' }}>Masalah ({allErrors.length})</Typography>
                <List dense disablePadding sx={{ px: 1 }}>{allErrors.map((e, i) => <ListItemButton key={i} onClick={() => e.nodeId && setSelected(e.nodeId)} sx={{ borderRadius: 1, py: 0.25 }}><ListItemText primary={<Typography variant="caption" color={e.severity === 'error' ? 'error' : 'warning.main'}>{e.message}</Typography>} /></ListItemButton>)}</List>
              </>
            )}
          </Paper>
          <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5, minWidth: 0 }}>
            {node && Form ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>{NODE_TYPE_LABELS[node.type]}{node.id === tree.rootId && <Chip size="small" label="Layar pertama" sx={{ ml: 1 }} />}</Typography>
                  {node.id !== tree.rootId && <Button size="small" color="error" startIcon={<Delete />} onClick={() => setDeleting(true)}>Hapus node</Button>}
                </Box>
                <CommonFields node={node} ctx={ctx} onChange={setNode} onChangeType={(t) => t !== node.type && setTypeChange(t)} />
                <Form node={node} ctx={ctx} onChange={setNodeWithInsert} />
              </>
            ) : (
              <Typography color="text.secondary">Pilih node di panel kiri.</Typography>
            )}
          </Box>
          <Box sx={{ p: 2, overflowY: 'auto', bgcolor: '#E9EFEF', display: { xs: 'none', lg: 'block' } }}>
            <Typography variant="overline" color="text.secondary">Pratinjau</Typography>
            <Preview tree={tree} node={node} packages={packages} segmentLabel={s.label} onNavigate={setSelected} onBack={() => setSelected(tree.rootId)} />
          </Box>
        </Box>
      )}

      <ConfirmDialog open={deleting} title="Hapus node" confirmLabel="Hapus" confirmColor="error" onClose={() => setDeleting(false)} onConfirm={deleteSubtree}>
        {tree && selected && <Typography variant="body2">{exclusiveSubtree(tree, selected).length} node akan dihapus (node ini dan semua node yang hanya bisa dicapai lewatnya). Tautan dari node lain diputus.</Typography>}
      </ConfirmDialog>
      <ConfirmDialog open={!!typeChange} title="Ganti tipe node" confirmLabel="Ganti" confirmColor="warning" onClose={() => setTypeChange(null)} onConfirm={() => { if (node && typeChange) { setNode(changeType(node, typeChange)); setTypeChange(null); } }}>
        <Typography variant="body2">Pengaturan node akan direset dan tautan keluar dihapus; judul dipertahankan.</Typography>
      </ConfirmDialog>
      <ConfirmDialog open={versionsOpen} title="Riwayat versi" confirmLabel="Tutup" onClose={() => setVersionsOpen(false)} onConfirm={() => setVersionsOpen(false)}>
        {(versions.data ?? []).map((v) => (
          <Box key={v.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid #E3E9EA' }}>
            <Typography variant="body2">v{v.version} · {fmtDate(v.publishedAt)} {s.publishedVersionId === v.id && <Chip size="small" color="success" label="aktif" sx={{ ml: 1, height: 18 }} />}</Typography>
            <Button size="small" onClick={() => restore.mutate(v.id)} disabled={restore.isPending}>Pulihkan ke draf</Button>
          </Box>
        ))}
        {versions.data?.length === 0 && <Typography variant="body2" color="text.secondary">Belum ada versi.</Typography>}
      </ConfirmDialog>
    </Box>
  );
}
