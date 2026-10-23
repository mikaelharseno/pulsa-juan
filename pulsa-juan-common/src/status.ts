// Status values shared by backend, app and dashboard. Each UI maps `tone` to
// its own colours; `agentLabel` is the wording shown in the agent app when it
// differs from the admin wording.

export const TRANSACTION_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const TOPUP_STATUSES = ['PENDING', 'CLAIMED', 'PAID', 'REJECTED', 'EXPIRED'] as const;
export type TopUpStatus = (typeof TOPUP_STATUSES)[number];

export type StatusTone = 'warning' | 'info' | 'success' | 'error' | 'neutral';

export interface StatusMeta {
  label: string;
  agentLabel?: string;
  tone: StatusTone;
}

export const STATUS_META: Record<string, StatusMeta> = {
  PENDING: { label: 'Menunggu', agentLabel: 'Diproses', tone: 'warning' },
  CLAIMED: { label: 'Klaim bayar', agentLabel: 'Menunggu konfirmasi', tone: 'info' },
  PAID: { label: 'Dibayar', agentLabel: 'Berhasil', tone: 'success' },
  SUCCESS: { label: 'Sukses', tone: 'success' },
  FAILED: { label: 'Gagal', tone: 'error' },
  REFUNDED: { label: 'Direfund', tone: 'neutral' },
  REJECTED: { label: 'Ditolak', tone: 'error' },
  EXPIRED: { label: 'Kedaluwarsa', tone: 'neutral' },
  ACTIVE: { label: 'Aktif', tone: 'success' },
  DISABLED: { label: 'Nonaktif', tone: 'neutral' },
  UNCLAIMED: { label: 'Belum diklaim', tone: 'warning' },
  VOIDED: { label: 'Batal', tone: 'neutral' },
};

export function statusMeta(status: string, audience: 'admin' | 'agent' = 'admin'): StatusMeta {
  const meta = STATUS_META[status];
  if (!meta) return { label: status, tone: 'neutral' };
  return audience === 'agent' && meta.agentLabel ? { ...meta, label: meta.agentLabel } : meta;
}
