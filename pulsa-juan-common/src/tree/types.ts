// segmentDisplayTree — the per-icon screen flow an agent walks through in the
// app. Flat map of nodes keyed by id (not nested JSON): O(1) lookups in the
// editor, node reuse (DAG), stable ids for error mapping and for the
// /segment/[segmentId]/[nodeId] route, and graph checks stay trivial.

export const PROVIDERS = ['TELKOMSEL', 'XL', 'AXIS', 'INDOSAT', 'TRI', 'SMARTFREN'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<Provider, string> = {
  TELKOMSEL: 'Telkomsel',
  XL: 'XL',
  AXIS: 'Axis',
  INDOSAT: 'Indosat',
  TRI: 'Tri',
  SMARTFREN: 'Smartfren',
};

export type NodeId = string;

export interface NodeBase {
  id: NodeId;
  title: string;
  subtitle?: string;
}

export interface ListRow {
  id: string;
  label: string;
  sublabel?: string;
  imageUrl?: string;
  childId: NodeId;
  isActive: boolean;
}

/** Vertical list; tapping a row navigates to that row's child node. */
export interface ListNode extends NodeBase {
  type: 'ListNode';
  rows: ListRow[];
}

export type PackagesSource =
  | { kind: 'IDS'; packageIds: string[] }
  | { kind: 'CATEGORY'; category: string };

/** List of priced packages; tapping one selects it (priceable). */
export interface PackagesList extends NodeBase {
  type: 'PackagesList';
  source: PackagesSource;
  nextId: NodeId | null;
}

/** Phone input with provider auto-detect; may branch on the provider. */
export interface PhoneNumberInput extends NodeBase {
  type: 'PhoneNumberInput';
  label: string;
  /** null = any valid Indonesian mobile number */
  allowedProviders: Provider[] | null;
  branches: Partial<Record<Provider, NodeId>>;
  defaultChildId: NodeId | null;
}

/** Free amount input (priceable). */
export interface EnterAmount extends NodeBase {
  type: 'EnterAmount';
  label: string;
  min: number;
  max: number;
  step: number;
  quickAmounts: number[];
  adminFee: number;
  nextId: NodeId | null;
}

export interface CustomerIdField {
  key: 'customerId' | 'secondaryId';
  label: string;
  placeholder?: string;
  helpText?: string;
  regex?: string;
  minLength?: number;
  maxLength?: number;
  keyboard: 'numeric' | 'default';
  required: boolean;
}

/** Generic labelled id input (nomor meter, ID pelanggan, game user id + zone). */
export interface CustomerIdInput extends NodeBase {
  type: 'CustomerIdInput';
  fields: CustomerIdField[];
  nextId: NodeId | null;
}

/** Postpaid bill check; amount due becomes the priced item. */
export interface BillInquiry extends NodeBase {
  type: 'BillInquiry';
  product: string;
  adminFee: number;
  nextId: NodeId | null;
}

export type TreeNode =
  | ListNode
  | PackagesList
  | PhoneNumberInput
  | EnterAmount
  | CustomerIdInput
  | BillInquiry;

export type NodeType = TreeNode['type'];

export const NODE_TYPES: readonly NodeType[] = [
  'ListNode',
  'PackagesList',
  'PhoneNumberInput',
  'EnterAmount',
  'CustomerIdInput',
  'BillInquiry',
];

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  ListNode: 'Daftar pilihan',
  PackagesList: 'Daftar paket',
  PhoneNumberInput: 'Input nomor HP',
  EnterAmount: 'Input nominal',
  CustomerIdInput: 'Input ID pelanggan',
  BillInquiry: 'Cek tagihan',
};

export const PRICEABLE_TYPES: readonly NodeType[] = ['PackagesList', 'EnterAmount', 'BillInquiry'];

export interface SegmentTree {
  schemaVersion: 1;
  rootId: NodeId;
  nodes: Record<NodeId, TreeNode>;
}

/** Package as served to the app (never includes hargaBeli). */
export interface PackagePublic {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  category: string;
  provider?: Provider | null;
  /** Debited from saldo. Already includes the agent's referral markup when served by /agent/segments/:id/tree. */
  hargaAgen: number;
  imageUrl?: string | null;
  isActive: boolean;
  sortOrder: number;
}

export type FlowStep =
  | { nodeId: NodeId; type: 'ListNode'; rowId: string }
  | { nodeId: NodeId; type: 'PackagesList'; packageId: string }
  | { nodeId: NodeId; type: 'PhoneNumberInput'; phoneNumber: string }
  | { nodeId: NodeId; type: 'EnterAmount'; amount: number }
  | { nodeId: NodeId; type: 'CustomerIdInput'; values: { customerId: string; secondaryId?: string } }
  | {
      nodeId: NodeId;
      type: 'BillInquiry';
      customerId: string;
      amountDue: number;
      customerName?: string;
      periode?: string;
    };

export interface FlowSession {
  segmentId: string;
  treeVersion: number;
  steps: FlowStep[];
}

export interface InquiryResult {
  customerId: string;
  customerName?: string;
  periode?: string;
  amountDue: number;
  adminFee: number;
}

export interface PriceBreakdown {
  amountBase: number;
  adminFee: number;
  markupTotal: number;
  total: number;
  priceSource: 'package' | 'amount' | 'inquiry';
  packageId?: string;
}

export interface ConfirmationRow {
  label: string;
  value: string;
}

export interface TreeError {
  nodeId: NodeId | null;
  field?: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface StepError {
  nodeId: NodeId;
  code: 'ILLEGAL_PATH' | 'INVALID_INPUT' | 'INCOMPLETE_PATH';
  message: string;
}

export interface PrefixEntry {
  prefix: string;
  provider: Provider;
}

/** Context every walker function needs. */
export interface WalkContext {
  prefixes: PrefixEntry[];
  /** All packages referenced by the tree, keyed by id. */
  packages: Record<string, PackagePublic>;
}
