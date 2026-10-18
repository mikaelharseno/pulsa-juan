import { ArrowBack, ChevronRight } from '@mui/icons-material';
import { Box, Button, Chip, TextField, Typography } from '@mui/material';
import { detectProvider, formatRp, NodeId, PackagePublic, PROVIDER_LABELS, resolvePackageIds, SegmentTree, TreeNode } from 'pulsa-juan-common';
import { useState } from 'react';

// Phone-frame mock of the agent app. Same visual rules as the RN renderers
// (teal 56dp header, 64dp rows, 40dp images). Tapping a row "navigates" by
// selecting the child node in the editor.

const TEAL = '#1E9C8F';

function Row({ label, sub, image, onClick }: { label: string; sub?: string; image?: string | null; onClick?: () => void }) {
  return (
    <Box onClick={onClick} sx={{ display: 'flex', alignItems: 'center', minHeight: 64, px: 1.5, bgcolor: '#fff', borderBottom: '1px solid #E3E9EA', cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { bgcolor: '#EEF5F4' } : undefined }}>
      {image ? <img src={image} alt="" style={{ width: 40, height: 40, borderRadius: 8, marginRight: 12, objectFit: 'cover' }} /> : <Box sx={{ width: 40, height: 40, borderRadius: 1, mr: 1.5, bgcolor: 'rgba(30,156,143,0.18)', display: 'grid', placeItems: 'center', color: TEAL, fontWeight: 700 }}>{label.charAt(0).toUpperCase()}</Box>}
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 500, color: '#1F2A2E' }}>{label}</Typography>
        {sub && <Typography sx={{ fontSize: 13, color: '#6B7A80' }}>{sub}</Typography>}
      </Box>
      {onClick && <ChevronRight sx={{ color: '#6B7A80' }} />}
    </Box>
  );
}

const Btn = ({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick?: () => void }) => (
  <Button fullWidth variant="contained" disabled={disabled} onClick={onClick} sx={{ height: 48, borderRadius: 1, bgcolor: TEAL, fontWeight: 700, letterSpacing: 0.5, mt: 1 }}>{label.toUpperCase()}</Button>
);

export function Preview({ tree, node, packages, segmentLabel, onNavigate, onBack, markupTotal = 0 }: {
  tree: SegmentTree;
  node: TreeNode | null;
  packages: Record<string, PackagePublic>;
  segmentLabel: string;
  onNavigate: (id: NodeId) => void;
  onBack: () => void;
  markupTotal?: number;
}) {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const provider = detectProvider(phone.replace(/\D/g, ''));

  let body: React.ReactNode = <Typography sx={{ p: 2, color: '#6B7A80' }}>Pilih node di kiri</Typography>;
  if (node) {
    switch (node.type) {
      case 'ListNode':
        body = node.rows.filter((r) => r.isActive).map((r) => <Row key={r.id} label={r.label} sub={r.sublabel} image={r.imageUrl} onClick={r.childId ? () => onNavigate(r.childId) : undefined} />);
        break;
      case 'PackagesList': {
        const ids = resolvePackageIds(node, packages);
        body = ids.length ? ids.map((id) => <Row key={id} label={packages[id].name} sub={formatRp(packages[id].hargaAgen + markupTotal)} image={packages[id].imageUrl} onClick={node.nextId ? () => onNavigate(node.nextId!) : undefined} />) : <Typography sx={{ p: 2, color: '#6B7A80' }}>Belum ada paket tersedia</Typography>;
        break;
      }
      case 'PhoneNumberInput': {
        const next = provider && node.branches[provider] ? node.branches[provider]! : node.defaultChildId;
        const valid = /^08\d{8,11}$/.test(phone.replace(/\D/g, '')) && (!node.allowedProviders || (provider && node.allowedProviders.includes(provider)));
        body = (
          <Box sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>{node.label}</Typography>
            <TextField size="small" fullWidth placeholder="08xxxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} InputProps={{ endAdornment: provider ? <Chip size="small" label={PROVIDER_LABELS[provider]} sx={{ bgcolor: 'rgba(30,156,143,0.18)', color: '#177A70', fontWeight: 700 }} /> : null }} />
            {node.allowedProviders && <Typography sx={{ fontSize: 12, color: '#6B7A80', mt: 0.5 }}>Khusus nomor {node.allowedProviders.map((p) => PROVIDER_LABELS[p]).join('/')}</Typography>}
            <Btn label="Lanjut" disabled={!valid || !next} onClick={() => next && onNavigate(next)} />
          </Box>
        );
        break;
      }
      case 'EnterAmount': {
        const a = Number(amount.replace(/\D/g, '')) || 0;
        const valid = a >= node.min && a <= node.max && (a - node.min) % node.step === 0;
        body = (
          <Box sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>{node.label}</Typography>
            <TextField size="small" fullWidth placeholder={formatRp(node.min)} value={a ? formatRp(a) : ''} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
            <Typography sx={{ fontSize: 12, color: '#6B7A80', mt: 0.5 }}>Minimal {formatRp(node.min)}, maksimal {formatRp(node.max)}, kelipatan {formatRp(node.step)}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>{node.quickAmounts.map((q) => <Chip key={q} label={'+ ' + formatRp(q).replace('Rp ', '')} variant={a === q ? 'filled' : 'outlined'} onClick={() => setAmount(String(q))} sx={{ borderColor: TEAL, color: a === q ? '#fff' : TEAL, bgcolor: a === q ? TEAL : undefined }} />)}</Box>
            <Btn label="Lanjut" disabled={!valid} onClick={node.nextId ? () => onNavigate(node.nextId!) : undefined} />
          </Box>
        );
        break;
      }
      case 'CustomerIdInput':
        body = (
          <Box sx={{ p: 2 }}>
            {node.fields.map((f) => (
              <Box key={f.key} sx={{ mb: 1.5 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>{f.label}{f.required ? '' : ' (opsional)'}</Typography>
                <TextField size="small" fullWidth placeholder={f.placeholder} helperText={f.helpText} />
              </Box>
            ))}
            <Btn label="Lanjut" onClick={node.nextId ? () => onNavigate(node.nextId!) : undefined} />
          </Box>
        );
        break;
      case 'BillInquiry':
        body = (
          <Box sx={{ p: 2 }}>
            <Box sx={{ bgcolor: '#fff', borderRadius: 1, p: 2, boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>{node.title}</Typography>
              {[['ID Pelanggan', '1234567890'], ['Nama Pelanggan', 'CONTOH PELANGGAN'], ['Periode', '2026-09'], ['Tagihan', formatRp(150000)], ['Biaya Admin', formatRp(node.adminFee + markupTotal)], ['Total', formatRp(150000 + node.adminFee + markupTotal)]].map(([k, v]) => (
                <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid #E3E9EA' }}><Typography sx={{ fontSize: 14, color: '#6B7A80' }}>{k}</Typography><Typography sx={{ fontSize: 14, fontWeight: k === 'Total' ? 700 : 500 }}>{v}</Typography></Box>
              ))}
            </Box>
            <Btn label="Lanjut" />
          </Box>
        );
        break;
    }
  }

  return (
    <Box sx={{ width: 360, height: 720, borderRadius: 4, border: '10px solid #1F2A2E', overflow: 'hidden', bgcolor: '#F3F6F6', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <Box sx={{ height: 56, bgcolor: TEAL, color: '#fff', display: 'flex', alignItems: 'center', px: 1 }}>
        <Box onClick={onBack} sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowBack /></Box>
        <Typography sx={{ flex: 1, textAlign: 'center', fontSize: 22, fontWeight: 700 }} noWrap>{node?.title || segmentLabel}</Typography>
        <Box sx={{ width: 40 }} />
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {node?.subtitle && <Typography sx={{ px: 2, pt: 2, color: '#6B7A80', fontSize: 14 }}>{node.subtitle}</Typography>}
        {body}
        {node && !tree.nodes[node.id] && null}
      </Box>
    </Box>
  );
}
