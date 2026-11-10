import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_PREFIXES } from 'pulsa-juan-common';

import { useAuth } from '../auth/useAuth';
import { API_BASE, del, get, post, put, upload } from './client';
import {
  AgentConfig,
  AgentProfile,
  CommissionSummary,
  DomicileInput,
  HomeData,
  KycState,
  LivenessChallenge,
  PayMethod,
  Region,
  LedgerList,
  MitraOverview,
  Rekap,
  SavedSellPrice,
  SellMargins,
  TopUpOrder,
  Transaction,
  TransactionList,
  TreeResponse,
} from './types';

export const keys = {
  home: ['home'] as const,
  me: ['me'] as const,
  config: ['config'] as const,
  tree: (id: string) => ['tree', id] as const,
  transactions: (q: Record<string, unknown>) => ['transactions', q] as const,
  transaction: (id: string) => ['transaction', id] as const,
  rekap: (from?: string, to?: string) => ['rekap', from ?? '', to ?? ''] as const,
  topups: ['topups'] as const,
  topup: (id: string) => ['topup', id] as const,
  commissions: ['commissions'] as const,
  mitra: ['mitra'] as const,
  ledger: ['ledger'] as const,
  sellMargins: ['sell-margins'] as const,
};

export function useHome() {
  const setAgent = useAuth((s) => s.setAgent);
  return useQuery({
    queryKey: keys.home,
    queryFn: async () => {
      const data = await get<HomeData>('/agent/home');
      setAgent(data.agent);
      return data;
    },
  });
}

export function useMe() {
  const setAgent = useAuth((s) => s.setAgent);
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      const me = await get<AgentProfile>('/agent/me');
      setAgent(me);
      return me;
    },
  });
}

export function useAgentConfig() {
  return useQuery({
    queryKey: keys.config,
    queryFn: () => get<AgentConfig>('/agent/config'),
    staleTime: 10 * 60 * 1000,
    placeholderData: { prefixes: DEFAULT_PREFIXES, bankAccounts: [], cs: { whatsapp: '', telegram: '' }, topUpMin: 10000, topUpMax: 5000000 },
  });
}

export function useTree(segmentId: string) {
  return useQuery({ queryKey: keys.tree(segmentId), queryFn: () => get<TreeResponse>(`/agent/segments/${segmentId}/tree`), staleTime: 60 * 1000 });
}

export function useTransactions(q: Record<string, unknown>) {
  return useQuery({ queryKey: keys.transactions(q), queryFn: () => get<TransactionList>('/agent/transactions', q) });
}

export function useTransaction(id: string, poll: boolean) {
  return useQuery({
    queryKey: keys.transaction(id),
    queryFn: () => get<Transaction>(`/agent/transactions/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (poll && query.state.data?.status === 'PENDING' ? 3000 : false),
    // keep polling while the app/tab is in the background so the result page updates on return
    refetchIntervalInBackground: true,
  });
}

export function useRekap(from?: string, to?: string) {
  return useQuery({ queryKey: keys.rekap(from, to), queryFn: () => get<Rekap>('/agent/rekap', { from, to }) });
}

export function useTopUps() {
  return useQuery({ queryKey: keys.topups, queryFn: async () => (await get<{ topUps: TopUpOrder[] }>('/agent/topups')).topUps });
}

export function useTopUp(id: string) {
  return useQuery({ queryKey: keys.topup(id), queryFn: () => get<TopUpOrder>(`/agent/topups/${id}`) });
}

/** Riwayat saldo: every saldo mutation, newest first, 30 per page. */
export function useLedger() {
  return useInfiniteQuery({
    queryKey: keys.ledger,
    queryFn: ({ pageParam }) => get<LedgerList>('/agent/ledger', { page: pageParam, pageSize: 30 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
}

export function useCommissions() {
  return useQuery({ queryKey: keys.commissions, queryFn: () => get<CommissionSummary>('/agent/commissions') });
}

export function useMitra() {
  return useQuery({ queryKey: keys.mitra, queryFn: () => get<MitraOverview>('/agent/mitra') });
}

/** Invalidate everything that shows saldo after money moved. */
export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: keys.home });
    qc.invalidateQueries({ queryKey: keys.me });
    qc.invalidateQueries({ queryKey: ['transactions'] });
    qc.invalidateQueries({ queryKey: ['rekap'] });
    qc.invalidateQueries({ queryKey: keys.commissions });
    qc.invalidateQueries({ queryKey: keys.topups });
    qc.invalidateQueries({ queryKey: keys.ledger });
  };
}

export function useCreateTopUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => post<TopUpOrder>('/agent/topups', { amount }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.topups }),
  });
}

export function useSelectBank(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bank: PayMethod) => put<TopUpOrder>(`/agent/topups/${id}/bank`, { bank }),
    onSuccess: (data) => qc.setQueryData(keys.topup(id), data),
  });
}

export function useClaimTopUp(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<TopUpOrder>(`/agent/topups/${id}/claim`),
    onSuccess: (data) => {
      qc.setQueryData(keys.topup(id), data);
      qc.invalidateQueries({ queryKey: keys.topups });
    },
  });
}

export function useUpdateProfile() {
  const setAgent = useAuth((s) => s.setAgent);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; nik?: string; phoneOtpTicket?: string; referralMarkup?: number; domicile?: DomicileInput }) => put<AgentProfile>('/agent/me', input),
    onSuccess: (agent) => {
      setAgent(agent);
      qc.setQueryData(keys.me, agent);
      qc.invalidateQueries({ queryKey: keys.mitra });
    },
  });
}

export function useClaimCommissions() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: () => post<{ claimed: number; count: number; saldo: number; saldoKomisi: number }>('/agent/commissions/claim'),
    onSuccess: invalidate,
  });
}

export function useChangePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { oldPin?: string; newPin: string }) => put<{ ok: true }>('/agent/me/pin', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useSellMargins() {
  return useQuery({ queryKey: keys.sellMargins, queryFn: () => get<SellMargins>('/agent/sell-margins') });
}

export function useSaveSellMargins() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SellMargins) => put<SellMargins>('/agent/sell-margins', input),
    onSuccess: (data) => qc.setQueryData(keys.sellMargins, data),
  });
}

export function useSavedSellPrices() {
  return useQuery({ queryKey: ['sellPrices'], queryFn: () => get<SavedSellPrice[]>('/agent/sell-prices') });
}

export function useDeleteSellPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del<{ ok: true }>(`/agent/sell-prices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sellPrices'] }),
  });
}

/** The order's public bon link (made on first use). */
export function useBonLink() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { token } = await post<{ token: string }>(`/agent/transactions/${id}/bon`);
      return { token, url: `${API_BASE}/bon/${token}` };
    },
  });
}

/** null resets the order to the agent's margin rule (and forgets the saved product price). */
export function useSetSellPrice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sellPrice: number | null) => put<Transaction>(`/agent/transactions/${id}/sell-price`, { sellPrice }),
    onSuccess: (data) => {
      qc.setQueryData(keys.transaction(id), data);
      qc.invalidateQueries({ queryKey: ['rekap'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['sellPrices'] });
    },
  });
}

/** Provinces (code '') or the children of a province / regency; cached for the session. */
export function useRegions(parentCode: string | null) {
  return useQuery({
    queryKey: ['regions', parentCode ?? ''],
    queryFn: () => get<Region[]>(parentCode ? `/agent/regions/${parentCode}/children` : '/agent/regions/provinces'),
    enabled: parentCode !== undefined,
    staleTime: Infinity,
  });
}

export function useSetReferrer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => post<MitraOverview>('/agent/mitra/referrer', { code }),
    onSuccess: (data) => {
      qc.setQueryData(keys.mitra, data);
      qc.invalidateQueries({ queryKey: keys.me });
      qc.invalidateQueries({ queryKey: keys.home });
    },
  });
}

export function useKyc() {
  return useQuery({ queryKey: ['kyc'], queryFn: () => get<KycState>('/agent/kyc') });
}

export function useStartLiveness() {
  return useMutation({ mutationFn: () => post<LivenessChallenge>('/agent/kyc/liveness') });
}

export type UploadFile = { uri: string; name: string; type: string } | Blob;

function appendFile(form: FormData, field: string, file: UploadFile, name: string) {
  // native FormData takes {uri, name, type}; web needs a Blob
  if (typeof Blob !== 'undefined' && file instanceof Blob) form.append(field, file, name);
  else form.append(field, file as unknown as Blob);
}

/** frames[0] = white baseline, then one per challenge colour */
export function useCheckLiveness() {
  return useMutation({
    mutationFn: ({ id, frames }: { id: string; frames: UploadFile[] }) => {
      const form = new FormData();
      frames.forEach((f, i) => appendFile(form, `frame${i}`, f, `frame${i}.jpg`));
      return upload<{ id: string; passed: boolean; reason: string | null }>(`/agent/kyc/liveness/${id}`, form);
    },
  });
}

export function useSubmitKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { livenessId: string; nik: string; name: string; ocrNik?: string; ocrName?: string; ocrText?: string; ktp: UploadFile; selfie: UploadFile }) => {
      const form = new FormData();
      form.append('livenessId', input.livenessId);
      form.append('nik', input.nik);
      form.append('name', input.name);
      if (input.ocrNik) form.append('ocrNik', input.ocrNik);
      if (input.ocrName) form.append('ocrName', input.ocrName);
      if (input.ocrText) form.append('ocrText', input.ocrText.slice(0, 4000));
      appendFile(form, 'ktp', input.ktp, 'ktp.jpg');
      appendFile(form, 'selfie', input.selfie, 'selfie.jpg');
      return upload<KycState & { id: string }>('/agent/kyc', form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc'] });
      qc.invalidateQueries({ queryKey: keys.me });
      qc.invalidateQueries({ queryKey: keys.home });
    },
  });
}
