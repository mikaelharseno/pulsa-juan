import { ConfirmationRow, FlowStep, PackagePublic, PrefixEntry, SegmentTree } from 'pulsa-juan-common';

export interface AgentProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'DISABLED';
  saldo: number;
  hutang: number;
  poin: number;
  commisionUniqueId: string;
  saldoKomisi: number;
  referralMarkup: number;
  markupTotal: number;
  createdAt: string;
}

export interface Session {
  token: string;
  agent: AgentProfile;
  created?: boolean;
}

export interface SegmentSummary {
  id: string;
  slug: string;
  label: string;
  iconUrl: string | null;
  groupLabel: string | null;
  badge: string | null;
  maintenanceMessage: string | null;
}

export interface HomeData {
  agent: AgentProfile;
  todayTransactions: number;
  commissionUnclaimed: number;
  saldo: number;
  hutang: number;
  poin: number;
  markupTotal: number;
  banners: { imageUrl: string; linkUrl?: string }[];
  groups: { groupLabel: string; segments: SegmentSummary[] }[];
  segments: SegmentSummary[];
  cs: { whatsapp: string; telegram: string };
  config: { topUpMin: number; topUpMax: number; appName: string; maxReferralMarkup: number };
}

export interface AgentConfig {
  prefixes: PrefixEntry[];
  bankAccounts: { bank: 'BRI' | 'BCA'; accountNumber: string; accountName: string }[];
  cs: { whatsapp: string; telegram: string };
  topUpMin: number;
  topUpMax: number;
}

export interface TreeResponse {
  segment: { id: string; slug: string; label: string; iconUrl: string | null; maintenanceMessage: string | null };
  treeVersion: number;
  treeVersionId: string;
  tree: SegmentTree;
  packages: Record<string, PackagePublic>;
  markupTotal: number;
}

export interface TopUpOrder {
  id: string;
  orderNumber: number;
  amount: number;
  kodeUnik: number;
  totalTransfer: number;
  bank: 'BRI' | 'BCA' | null;
  status: 'PENDING' | 'CLAIMED' | 'PAID' | 'REJECTED' | 'EXPIRED';
  claimedAt: string | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
  rejectReason: string | null;
  isCredit: boolean;
  account?: { bank: 'BRI' | 'BCA'; accountNumber: string; accountName: string } | null;
  waUrl?: string | null;
  waText?: string;
}

export interface Transaction {
  id: string;
  trxNumber: number;
  segmentLabel: string;
  segment?: { slug: string; iconUrl: string | null } | null;
  steps: FlowStep[];
  summary: ConfirmationRow[];
  phoneNumber: string | null;
  customerId: string | null;
  amountBase: number;
  adminFee: number;
  markupTotal: number;
  total: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  serialNumber: string | null;
  failReason: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface TransactionList {
  total: number;
  page: number;
  pageSize: number;
  transactions: Transaction[];
}

export interface Rekap {
  totalSpent: number;
  count: number;
  byDay: { date: string; totalSpent: number; count: number }[];
  bySegment: { segmentLabel: string; totalSpent: number; count: number }[];
}

export interface CommissionSummary {
  unclaimedTotal: number;
  pendingTotal: number;
  saldoKomisi: number;
  entries: {
    id: string;
    amount: number;
    level: number;
    status: 'UNCLAIMED' | 'CLAIMED' | 'VOIDED';
    claimedAt: string | null;
    createdAt: string;
    sourceAgentName: string;
    transaction: { trxNumber: number; status: string; segmentLabel: string; createdAt: string };
  }[];
}

export interface MitraOverview {
  commisionUniqueId: string;
  referralMarkup: number;
  parent: { name: string; commisionAmount: number } | null;
  children: { id: string; name: string; commisionUniqueId: string; commisionAmount: number; joinedAt: string }[];
}
