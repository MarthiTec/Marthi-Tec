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
import { WorkOrderReportPage } from './pages/admin/WorkOrderReportPage';
import { AgendaPage } from './pages/admin/AgendaPage';
import { PlanPage } from './pages/admin/PlanPage';
import { SellersPage } from './pages/admin/SellersPage';
import { SuppliersPage } from './pages/admin/SuppliersPage';
import { EmployeesPage } from './pages/admin/EmployeesPage';
import { AuditPage } from './pages/admin/AuditPage';
import { InvoicesPage } from './pages/admin/InvoicesPage';

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
          <Route path="vendedores" element={<SellersPage />} />
          <Route path="fornecedores" element={<SuppliersPage />} />
          <Route path="funcionarios" element={<EmployeesPage />} />
          <Route path="auditoria" element={<AuditPage />} />
          <Route path="notas" element={<InvoicesPage />} />
          <Route path="os" element={<WorkOrdersPage />} />
          <Route path="os/nova" element={<WorkOrderNewPage />} />
          <Route path="os/agenda" element={<AgendaPage />} />
          <Route path="os/:id/relatorio" element={<WorkOrderReportPage />} />
          <Route path="os/:id" element={<WorkOrderDetailPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="plano" element={<PlanPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
