import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_PREFIXES } from 'pulsa-juan-common';

import { useAuth } from '../auth/useAuth';
import { get, post, put } from './client';
import {
  AgentConfig,
  AgentProfile,
  CommissionSummary,
  HomeData,
  LedgerList,
  MitraOverview,
  Rekap,
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
    mutationFn: (bank: 'BRI' | 'BCA') => put<TopUpOrder>(`/agent/topups/${id}/bank`, { bank }),
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
    mutationFn: (input: { name?: string; nik?: string; phoneOtpTicket?: string; referralMarkup?: number }) => put<AgentProfile>('/agent/me', input),
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
