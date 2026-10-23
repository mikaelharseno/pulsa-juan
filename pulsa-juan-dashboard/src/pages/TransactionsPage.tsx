import { Box, Chip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { api } from '../api';
import { PageHeader } from '../components/common';
import { TransactionsTable } from '../components/TransactionsTable';

export default function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const agentId = params.get('agentId') ?? undefined;
  const agent = useQuery({
    queryKey: ['admin-agent', agentId],
    queryFn: async () => (await api.get<{ name: string; phone: string }>(`/admin/agents/${agentId}`)).data,
    enabled: !!agentId,
  });

  return (
    <Box>
      <PageHeader
        title="Order Isi Pulsa"
        subtitle="Semua order agen, terbaru di atas. Tandai Sukses (isi SN/token bila ada) atau Gagal (saldo otomatis dikembalikan); order sukses bisa direfund."
        actions={
          agentId && (
            <Chip
              color="primary"
              label={`Agen: ${agent.data ? `${agent.data.name} (${agent.data.phone})` : '…'}`}
              onDelete={() => {
                params.delete('agentId');
                setParams(params);
              }}
            />
          )
        }
      />
      <TransactionsTable agentId={agentId} />
    </Box>
  );
}
