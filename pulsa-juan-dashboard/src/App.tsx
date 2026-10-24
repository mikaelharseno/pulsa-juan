import { Navigate, Route, Routes } from 'react-router-dom';

import { useSession } from './auth/useSession';
import LoginPage from './pages/LoginPage';
import AgentDetailPage from './pages/AgentDetailPage';
import AgentsPage from './pages/AgentsPage';
import MitraPage from './pages/MitraPage';
import PackagesPage from './pages/PackagesPage';
import ProductUpdaterPage from './pages/ProductUpdaterPage';
import SegmentsPage from './pages/SegmentsPage';
import SettingsPage from './pages/SettingsPage';
import TopUpsPage from './pages/TopUpsPage';
import TransactionsPage from './pages/TransactionsPage';
import TreeEditorPage from './pages/tree/TreeEditorPage';
import Shell from './Shell';

export default function App() {
  const session = useSession((s) => s.session);
  if (!session) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/topups" replace />} />
        <Route path="/topups" element={<TopUpsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/:id" element={<AgentDetailPage />} />
        <Route path="/mitra" element={<MitraPage />} />
        <Route path="/segments" element={<SegmentsPage />} />
        <Route path="/segments/:id/tree" element={<TreeEditorPage />} />
        <Route path="/packages" element={<PackagesPage />} />
        <Route path="/product-updater" element={<ProductUpdaterPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/topups" replace />} />
      </Route>
    </Routes>
  );
}
