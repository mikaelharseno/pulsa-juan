import { Box } from '@mui/material';

import { PageHeader } from '../components/common';
import { TopUpsTable } from '../components/TopUpsTable';

export default function TopUpsPage() {
  return (
    <Box>
      <PageHeader
        title="Top Up Saldo"
        subtitle="Cocokkan total transfer (nominal + kode unik) dengan mutasi bank, lalu konfirmasi dengan bukti screenshot. Saldo agen bertambah sebesar total transfer."
      />
      <TopUpsTable />
    </Box>
  );
}
