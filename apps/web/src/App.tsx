import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ProductsPage } from './pages/ProductsPage';
import { PartnerSignupPage } from './pages/PartnerSignupPage';
import { TotemPage } from './pages/totem/TotemPage';
import { CaixaPage } from './pages/caixa/CaixaPage';
import { OsLayout } from './pages/os/OsLayout';
import { FiscalLayout } from './pages/fiscal/FiscalLayout';
import { FiscalHomePage } from './pages/fiscal/FiscalHomePage';
import { FiscalNfsePage } from './pages/fiscal/FiscalNfsePage';
import { FiscalCtePage } from './pages/fiscal/FiscalCtePage';
import { FiscalMdfePage } from './pages/fiscal/FiscalMdfePage';
import { EcommerceLayout } from './pages/ecommerce/EcommerceLayout';
import { EcommerceHomePage } from './pages/ecommerce/EcommerceHomePage';
import { EcommerceOrdersPage } from './pages/ecommerce/EcommerceOrdersPage';
import { EcommerceListingsPage } from './pages/ecommerce/EcommerceListingsPage';
import { EcommerceConnectionsPage } from './pages/ecommerce/EcommerceConnectionsPage';
import { EcommerceChannelPage } from './pages/ecommerce/EcommerceChannelPage';
import { CrmLayout } from './pages/crm/CrmLayout';
import { CrmBoardPage } from './pages/crm/CrmBoardPage';
import { CrmDealPage } from './pages/crm/CrmDealPage';
import { CrmProfilePage } from './pages/crm/CrmProfilePage';
import { CrmNetworkPage } from './pages/crm/CrmNetworkPage';
import { TotemSettingsPage } from './pages/admin/TotemSettingsPage';
import { TotemInsightsPage } from './pages/admin/TotemInsightsPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminHomePage } from './pages/admin/AdminHomePage';
import { CrmPanelPage } from './pages/admin/CrmPanelPage';
import { CustomersPage } from './pages/admin/CustomersPage';
import { StockPage } from './pages/admin/StockPage';
import { AttributesPage } from './pages/admin/AttributesPage';
import { OrdersPage } from './pages/admin/OrdersPage';
import { FinancePage } from './pages/admin/FinancePage';
import { PosPage } from './pages/admin/PosPage';
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
import { FiscalClassPage } from './pages/admin/FiscalClassPage';
import { CfopPage } from './pages/admin/CfopPage';
import { FiscalIssuerPage } from './pages/admin/FiscalIssuerPage';
import { FiscalCstPage } from './pages/admin/FiscalCstPage';
import { KitsPage } from './pages/admin/KitsPage';
import { LotsPage } from './pages/admin/LotsPage';
import { WarehousePage } from './pages/admin/WarehousePage';
import { PermissionsPage } from './pages/admin/PermissionsPage';
import { HelpPage } from './pages/admin/HelpPage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/produtos" element={<ProductsPage />} />
        <Route path="/parceiro" element={<PartnerSignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/totem" element={<TotemPage />} />
        <Route path="/caixa" element={<CaixaPage />} />
        <Route path="/os" element={<OsLayout />}>
          <Route index element={<WorkOrdersPage />} />
          <Route path="nova" element={<WorkOrderNewPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path=":id/relatorio" element={<WorkOrderReportPage />} />
          <Route path=":id" element={<WorkOrderDetailPage />} />
        </Route>
        <Route path="/fiscal" element={<FiscalLayout />}>
          <Route index element={<FiscalHomePage />} />
          <Route path="nfe" element={<InvoicesPage />} />
          <Route path="nfse" element={<FiscalNfsePage />} />
          <Route path="cte" element={<FiscalCtePage />} />
          <Route path="mdfe" element={<FiscalMdfePage />} />
          <Route path="config" element={<FiscalIssuerPage />} />
          <Route path="cst" element={<FiscalCstPage />} />
        </Route>
        <Route path="/ecommerce" element={<EcommerceLayout />}>
          <Route index element={<EcommerceHomePage />} />
          <Route path="pedidos" element={<EcommerceOrdersPage />} />
          <Route path="anuncios" element={<EcommerceListingsPage />} />
          <Route path="conexoes" element={<EcommerceConnectionsPage />} />
          <Route path=":channelId" element={<EcommerceChannelPage />} />
        </Route>
        <Route path="/crm" element={<CrmLayout />}>
          <Route index element={<CrmBoardPage />} />
          <Route path="negocio/:id" element={<CrmDealPage />} />
          <Route path="perfil" element={<CrmProfilePage />} />
          <Route path="rede" element={<CrmNetworkPage />} />
        </Route>
        <Route path="/painel" element={<AdminLayout />}>
          <Route index element={<AdminHomePage />} />
          <Route path="pdv" element={<PosPage />} />
          <Route path="pdv/venda" element={<Navigate to="/caixa" replace />} />
          <Route path="totem" element={<TotemInsightsPage />} />
          <Route path="totem/config" element={<TotemSettingsPage />} />
          <Route path="pedidos" element={<OrdersPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="crm" element={<CrmPanelPage />} />
          <Route path="produtos" element={<StockPage />} />
          <Route path="estoque" element={<Navigate to="/painel/produtos" replace />} />
          <Route path="atributos" element={<AttributesPage />} />
          <Route path="kits" element={<KitsPage />} />
          <Route path="lotes" element={<LotsPage />} />
          <Route path="almoxarifado" element={<WarehousePage />} />
          <Route path="classificacao-fiscal" element={<FiscalClassPage />} />
          <Route path="cfop" element={<CfopPage />} />
          <Route path="tabelas" element={<PriceTablesPage />} />
          <Route path="pagamentos" element={<PaymentsPage />} />
          <Route path="financeiro" element={<FinancePage />} />
          <Route path="vendedores" element={<SellersPage />} />
          <Route path="fornecedores" element={<SuppliersPage />} />
          <Route path="funcionarios" element={<EmployeesPage />} />
          <Route path="permissoes" element={<PermissionsPage />} />
          <Route path="auditoria" element={<AuditPage />} />
          <Route path="notas" element={<Navigate to="/fiscal/nfe" replace />} />
          <Route path="fiscal/config" element={<Navigate to="/fiscal/config" replace />} />
          <Route path="fiscal/cst" element={<Navigate to="/fiscal/cst" replace />} />
          <Route path="os" element={<WorkOrdersPage />} />
          <Route path="os/nova" element={<WorkOrderNewPage />} />
          <Route path="os/agenda" element={<AgendaPage />} />
          <Route path="os/:id/relatorio" element={<WorkOrderReportPage />} />
          <Route path="os/:id" element={<WorkOrderDetailPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="plano" element={<PlanPage />} />
          <Route path="ajuda" element={<HelpPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
