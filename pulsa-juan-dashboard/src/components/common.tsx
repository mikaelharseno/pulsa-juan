import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>
    </Box>
  );
}

const STATUS: Record<string, { label: string; color: 'default' | 'warning' | 'success' | 'error' | 'info' }> = {
  PENDING: { label: 'Menunggu', color: 'warning' },
  CLAIMED: { label: 'Klaim bayar', color: 'info' },
  PAID: { label: 'Dibayar', color: 'success' },
  SUCCESS: { label: 'Sukses', color: 'success' },
  FAILED: { label: 'Gagal', color: 'error' },
  REJECTED: { label: 'Ditolak', color: 'error' },
  EXPIRED: { label: 'Kedaluwarsa', color: 'default' },
  ACTIVE: { label: 'Aktif', color: 'success' },
  DISABLED: { label: 'Nonaktif', color: 'default' },
  UNCLAIMED: { label: 'Belum diklaim', color: 'warning' },
  VOIDED: { label: 'Batal', color: 'default' },
};

export function StatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, color: 'default' as const };
  return <Chip size="small" label={s.label} color={s.color} variant={s.color === 'default' ? 'outlined' : 'filled'} />;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Ya',
  confirmColor = 'primary',
  busy,
  disabled,
  error,
  onClose,
  onConfirm,
  maxWidth = 'xs',
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  confirmColor?: 'primary' | 'error' | 'warning' | 'success';
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  maxWidth?: 'xs' | 'sm' | 'md';
}) {
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth={maxWidth}>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent dividers>
        {children}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button variant="contained" color={confirmColor} onClick={onConfirm} disabled={busy || disabled}>
          {busy ? 'Memproses...' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function EmptyRow({ colSpan, text = 'Tidak ada data' }: { colSpan: number; text?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ textAlign: 'center', padding: 24, color: '#6B7A80' }}>
        {text}
      </td>
    </tr>
  );
}
