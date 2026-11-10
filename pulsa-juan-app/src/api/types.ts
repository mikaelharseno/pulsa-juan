import { ConfirmationRow, FlowStep, PackagePublic, PrefixEntry, SegmentTree, TopUpStatus, TransactionStatus, InquiryResult } from 'pulsa-juan-common';

export interface AgentProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  nik: string | null;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'DISABLED';
  saldo: number;
  hutang: number;
  poin: number;
  commisionUniqueId: string;
  saldoKomisi: number;
  referralMarkup: number;
  referrerMarkup: number;
  markupTotal: number;
  hasPin: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  phoneVerified: boolean;
  /** Daerah domisili; null for agents who signed up before it was asked */
  domicile?: { districtCode: string; label: string | null; source: 'GPS' | 'MANUAL' | null } | null;
  hasReferrer?: boolean;
  /** identity check for "Plus" services */
  kycStatus?: KycStatus;
  joinedAt: string;
  createdAt: string;
}

export type KycStatus = 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface KycState {
  status: KycStatus;
  rejectReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface LivenessChallenge {
  id: string;
  colors: ('red' | 'blue' | 'yellow')[];
  expiresAt: string;
  flashMs: number;
}

export interface Region {
  code: string;
  name: string;
  parentCode: string | null;
}

export interface DomicileInput {
  districtCode: string;
  lat?: number;
  lng?: number;
  source: 'GPS' | 'MANUAL';
}

export interface Session {
  token: string;
  agent: AgentProfile;
}

export type OtpPurpose = 'REGISTER' | 'RESET_PIN' | 'VERIFY_PHONE';

export interface OtpRequestResult {
  phone: string;
  purpose: OtpPurpose;
  expiresAt: string;
  resendAfter: number;
  /** only when the server runs with OTP_DEBUG=1 (dev) */
  debugCode?: string;
}

export interface OtpVerifyResult {
  otpTicket: string;
  phone: string;
  purpose: OtpPurpose;
}

export type GoogleLoginResult = ({ needsPhone: false } & Session) | { needsPhone: true; googleTicket: string; profile: { name: string; email: string } };

export interface LedgerEntry {
  id: string;
  type: 'TOPUP' | 'PURCHASE' | 'REFUND' | 'ADJUSTMENT' | 'COMMISSION';
  delta: number;
  balanceAfter: number;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
}

export interface LedgerList {
  total: number;
  page: number;
  pageSize: number;
  entries: LedgerEntry[];
}

export interface SegmentSummary {
  id: string;
  slug: string;
  label: string;
  iconUrl: string | null;
  groupLabel: string | null;
  badge: string | null;
  maintenanceMessage: string | null;
  /** "Plus": needs a verified identity */
  requiresVerification?: boolean;
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

export type PayMethod = 'BRI' | 'BCA' | 'QRIS';

export interface AgentConfig {
  prefixes: PrefixEntry[];
  bankAccounts: { bank: 'BRI' | 'BCA'; accountNumber: string; accountName: string }[];
  /** static QRIS top-ups; absent on older servers */
  qris?: { enabled: boolean; feePercent: number; feeAbove: number };
  cs: { whatsapp: string; telegram: string };
  topUpMin: number;
  topUpMax: number;
}

export interface TreeResponse {
  segment: { id: string; slug: string; label: string; iconUrl: string | null; maintenanceMessage: string | null; requiresVerification?: boolean };
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
  bank: PayMethod | null;
  /** QRIS admin fee inside totalTransfer (not credited to saldo) */
  adminFee?: number;
  status: TopUpStatus;
  claimedAt: string | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
  rejectReason: string | null;
  isCredit: boolean;
  account?: { bank: 'BRI' | 'BCA'; accountNumber: string; accountName: string } | null;
  qris?: { id: string; label: string; imageUrl: string } | null;
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
  /** what the agent charges its customer (saved product price, else total + its margin); null on older orders */
  sellPrice?: number | null;
  packageId?: string | null;
  status: TransactionStatus;
  serialNumber: string | null;
  failReason: string | null;
  /** set on bill payments (the BillCheck that priced it) */
  billCheckId?: string | null;
  refundReason?: string | null;
  refundedAt?: string | null;
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
  /** successful orders only */
  income: { count: number; omzet: number; modal: number; profit: number; commission: number; commissionCount: number; total: number };
  byDay: { date: string; totalSpent: number; count: number; profit: number }[];
  bySegment: { segmentLabel: string; totalSpent: number; count: number; profit: number }[];
}

/** the agent's profit per sale: a default plus overrides by segment id */
export interface SellMargins {
  default: number;
  bySegment: Record<string, number>;
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

/** POST /agent/inquiries and GET /agent/inquiries/:id */
export interface BillCheckResponse {
  /** null = dev stub answer (no OtomaX check behind it) */
  checkId: string | null;
  status: 'PENDING' | 'READY' | 'NOT_PAYABLE' | 'FAILED' | 'USED' | 'EXPIRED';
  result?: InquiryResult;
  /** agent-facing reason when not READY */
  message?: string;
}

/** A sell price the agent saved for one product (beats the margin on new orders of it). */
export interface SavedSellPrice {
  id: string;
  packageId: string;
  name: string;
  category: string;
  isActive: boolean;
  hargaAgen: number;
  sellPrice: number;
  updatedAt: string;
}
