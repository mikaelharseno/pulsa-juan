import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { statusMeta, StatusTone } from 'pulsa-juan-common';
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

const TONE_COLOR: Record<StatusTone, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
  warning: 'warning',
  info: 'info',
  success: 'success',
  error: 'error',
  neutral: 'default',
};

export function StatusChip({ status }: { status: string }) {
  const meta = statusMeta(status);
  const color = TONE_COLOR[meta.tone];
  return <Chip size="small" label={meta.label} color={color} variant={color === 'default' ? 'outlined' : 'filled'} />;
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
