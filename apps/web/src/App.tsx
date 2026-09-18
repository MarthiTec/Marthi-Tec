import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PartnerSignupPage } from './pages/PartnerSignupPage';
import { TotemPage } from './pages/totem/TotemPage';
import { TotemSettingsPage } from './pages/admin/TotemSettingsPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminHomePage } from './pages/admin/AdminHomePage';
import { CustomersPage } from './pages/admin/CustomersPage';
import { StockPage } from './pages/admin/StockPage';
import { AttributesPage } from './pages/admin/AttributesPage';
import { OrdersPage } from './pages/admin/OrdersPage';
import { FinancePage } from './pages/admin/FinancePage';
import { PosPage } from './pages/admin/PosPage';
import { PosSalePage } from './pages/admin/PosSalePage';
import { PriceTablesPage } from './pages/admin/PriceTablesPage';
import { PaymentsPage } from './pages/admin/PaymentsPage';
import { ProfilePage } from './pages/admin/ProfilePage';
import { WorkOrdersPage } from './pages/admin/WorkOrdersPage';
import { WorkOrderNewPage } from './pages/admin/WorkOrderNewPage';
import { WorkOrderDetailPage } from './pages/admin/WorkOrderDetailPage';
import { PlanPage } from './pages/admin/PlanPage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/parceiro" element={<PartnerSignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/totem" element={<TotemPage />} />
        <Route path="/painel" element={<AdminLayout />}>
          <Route index element={<AdminHomePage />} />
          <Route path="pdv" element={<PosPage />} />
          <Route path="pdv/venda" element={<PosSalePage />} />
          <Route path="totem" element={<TotemSettingsPage />} />
          <Route path="pedidos" element={<OrdersPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="estoque" element={<StockPage />} />
          <Route path="atributos" element={<AttributesPage />} />
          <Route path="tabelas" element={<PriceTablesPage />} />
          <Route path="pagamentos" element={<PaymentsPage />} />
          <Route path="financeiro" element={<FinancePage />} />
          <Route path="os" element={<WorkOrdersPage />} />
          <Route path="os/nova" element={<WorkOrderNewPage />} />
          <Route path="os/:id" element={<WorkOrderDetailPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="plano" element={<PlanPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
