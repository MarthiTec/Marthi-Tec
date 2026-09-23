import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import './styles/operatorThemeDark.css';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ProductsPage } from './pages/ProductsPage';
import { PartnerSignupPage } from './pages/PartnerSignupPage';
import { TotemPage } from './pages/totem/TotemPage';
import { CaixaPage } from './pages/caixa/CaixaPage';
import { MesaPage } from './pages/mesa/MesaPage';
import { CozinhaPage } from './pages/cozinha/CozinhaPage';
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
import { ErpLayout } from './pages/erp/ErpLayout';
import { ErpHomePage } from './pages/erp/ErpHomePage';
import { ErpBoletosPage } from './pages/erp/ErpBoletosPage';
import { ErpReportsPage } from './pages/erp/ErpReportsPage';
import { StockBalancePage } from './pages/erp/StockBalancePage';
import { StockMovementsPage } from './pages/erp/StockMovementsPage';
import { PromoCampaignsPage } from './pages/erp/PromoCampaignsPage';
import { CrmLayout } from './pages/crm/CrmLayout';
import { CrmBoardPage } from './pages/crm/CrmBoardPage';
import { CrmDealPage } from './pages/crm/CrmDealPage';
import { CrmProfilePage } from './pages/crm/CrmProfilePage';
import { CrmNetworkPage } from './pages/crm/CrmNetworkPage';
import { CrmInboxPage } from './pages/crm/CrmInboxPage';
import { TotemSettingsPage } from './pages/admin/TotemSettingsPage';
import { TotemInsightsPage } from './pages/admin/TotemInsightsPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminHomePage } from './pages/admin/AdminHomePage';
import { OperationsPage } from './pages/admin/OperationsPage';
import { CrmPanelPage } from './pages/admin/CrmPanelPage';
import { EcommercePanelPage } from './pages/admin/EcommercePanelPage';
import { FiscalPanelPage } from './pages/admin/FiscalPanelPage';
import { ErpPanelPage } from './pages/admin/ErpPanelPage';
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
import { OperatorAccountPage } from './pages/shared/OperatorAccountPage';
import { MarthiLayout } from './pages/marthi/MarthiLayout';
import { MarthiDashboardPage } from './pages/marthi/MarthiDashboardPage';
import { MarthiClientsPage } from './pages/marthi/MarthiClientsPage';

function LegacyMarthiRedirect() {
  const location = useLocation();
  const suffix = location.pathname.replace(/^\/marthi/, '') || '';
  return <Navigate to={`/admin${suffix}${location.search}`} replace />;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/produtos" element={<ProductsPage />} />
        <Route path="/parceiro" element={<PartnerSignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/perfil" element={<Navigate to="/painel/perfil" replace />} />
        <Route path="/totem" element={<TotemPage />} />
        <Route path="/caixa" element={<CaixaPage />} />
        <Route path="/mesa" element={<MesaPage />} />
        <Route path="/cozinha" element={<CozinhaPage />} />
        <Route path="/admin" element={<MarthiLayout />}>
          <Route index element={<MarthiDashboardPage />} />
          <Route path="clientes" element={<MarthiClientsPage />} />
        </Route>
        <Route path="/marthi/*" element={<LegacyMarthiRedirect />} />
        <Route path="/painel-marthi" element={<Navigate to="/admin" replace />} />
        <Route path="/os" element={<OsLayout />}>
          <Route index element={<WorkOrdersPage />} />
          <Route path="perfil" element={<OperatorAccountPage />} />
          <Route path="conta" element={<OperatorAccountPage />} />
          <Route path="nova" element={<WorkOrderNewPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path=":id/relatorio" element={<WorkOrderReportPage />} />
          <Route path=":id" element={<WorkOrderDetailPage />} />
        </Route>
        <Route path="/fiscal" element={<FiscalLayout />}>
          <Route index element={<FiscalHomePage />} />
          <Route path="perfil" element={<OperatorAccountPage />} />
          <Route path="conta" element={<OperatorAccountPage />} />
          <Route path="nfe" element={<InvoicesPage />} />
          <Route path="nfse" element={<FiscalNfsePage />} />
          <Route path="cte" element={<FiscalCtePage />} />
          <Route path="mdfe" element={<FiscalMdfePage />} />
          <Route path="config" element={<FiscalIssuerPage />} />
          <Route path="cst" element={<FiscalCstPage />} />
        </Route>
        <Route path="/ecommerce" element={<EcommerceLayout />}>
          <Route index element={<EcommerceHomePage />} />
          <Route path="perfil" element={<OperatorAccountPage />} />
          <Route path="conta" element={<OperatorAccountPage />} />
          <Route path="pedidos" element={<EcommerceOrdersPage />} />
          <Route path="anuncios" element={<EcommerceListingsPage />} />
          <Route path="conexoes" element={<EcommerceConnectionsPage />} />
          <Route path=":channelId" element={<EcommerceChannelPage />} />
        </Route>
        <Route path="/crm" element={<CrmLayout />}>
          <Route index element={<CrmBoardPage />} />
          <Route path="conversas" element={<CrmInboxPage />} />
          <Route path="negocio/:id" element={<CrmDealPage />} />
          <Route path="conta" element={<Navigate to="/crm/perfil" replace />} />
          <Route path="perfil" element={<CrmProfilePage />} />
          <Route path="rede" element={<CrmNetworkPage />} />
        </Route>
        <Route path="/erp" element={<ErpLayout />}>
          <Route index element={<ErpHomePage />} />
          <Route path="perfil" element={<OperatorAccountPage />} />
          <Route path="conta" element={<OperatorAccountPage />} />
          <Route path="produtos" element={<StockPage />} />
          <Route path="balanco" element={<StockBalancePage />} />
          <Route path="movimentos" element={<StockMovementsPage />} />
          <Route path="atributos" element={<AttributesPage />} />
          <Route path="kits" element={<KitsPage />} />
          <Route path="lotes" element={<LotsPage />} />
          <Route path="almoxarifado" element={<WarehousePage />} />
          <Route path="tabelas" element={<PriceTablesPage />} />
          <Route path="campanhas" element={<PromoCampaignsPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="funcionarios" element={<EmployeesPage />} />
          <Route path="permissoes" element={<PermissionsPage />} />
          <Route path="vendedores" element={<SellersPage />} />
          <Route path="fornecedores" element={<SuppliersPage />} />
          <Route path="financeiro" element={<FinancePage />} />
          <Route path="boletos" element={<ErpBoletosPage />} />
          <Route path="relatorios" element={<ErpReportsPage />} />
          <Route path="auditoria" element={<AuditPage />} />
        </Route>
        <Route path="/painel" element={<AdminLayout />}>
          <Route index element={<AdminHomePage />} />
          <Route path="operacoes" element={<OperationsPage />} />
          <Route path="operacoes/usuarios" element={<OperationsPage />} />
          <Route path="pdv" element={<PosPage />} />
          <Route path="pdv/venda" element={<Navigate to="/caixa" replace />} />
          <Route path="totem" element={<TotemInsightsPage />} />
          <Route path="totem/produtos" element={<StockPage />} />
          <Route path="totem/atributos" element={<AttributesPage />} />
          <Route path="totem/config" element={<TotemSettingsPage />} />
          <Route path="pedidos" element={<OrdersPage />} />
          <Route path="crm" element={<CrmPanelPage />} />
          <Route path="ecommerce" element={<EcommercePanelPage />} />
          <Route path="fiscal" element={<FiscalPanelPage />} />
          <Route path="erp" element={<ErpPanelPage />} />
          <Route path="clientes" element={<Navigate to="/erp/clientes" replace />} />
          <Route path="produtos" element={<Navigate to="/erp/produtos" replace />} />
          <Route path="estoque" element={<Navigate to="/erp/balanco" replace />} />
          <Route path="balanco" element={<Navigate to="/erp/balanco" replace />} />
          <Route path="movimentos" element={<Navigate to="/erp/movimentos" replace />} />
          <Route path="atributos" element={<Navigate to="/erp/atributos" replace />} />
          <Route path="kits" element={<Navigate to="/erp/kits" replace />} />
          <Route path="lotes" element={<Navigate to="/erp/lotes" replace />} />
          <Route path="almoxarifado" element={<Navigate to="/erp/almoxarifado" replace />} />
          <Route path="tabelas" element={<Navigate to="/erp/tabelas" replace />} />
          <Route path="pagamentos" element={<PaymentsPage />} />
          <Route path="financeiro" element={<Navigate to="/erp/financeiro" replace />} />
          <Route path="vendedores" element={<Navigate to="/erp/vendedores" replace />} />
          <Route path="fornecedores" element={<Navigate to="/erp/fornecedores" replace />} />
          <Route path="funcionarios" element={<Navigate to="/painel/operacoes/usuarios" replace />} />
          <Route path="permissoes" element={<Navigate to="/erp/permissoes" replace />} />
          <Route path="auditoria" element={<Navigate to="/erp/auditoria" replace />} />
          <Route path="classificacao-fiscal" element={<FiscalClassPage />} />
          <Route path="cfop" element={<CfopPage />} />
          <Route path="notas" element={<InvoicesPage />} />
          <Route path="fiscal/config" element={<FiscalIssuerPage />} />
          <Route path="fiscal/cst" element={<FiscalCstPage />} />
          <Route path="os" element={<WorkOrdersPage />} />
          <Route path="os/nova" element={<Navigate to="/os/nova" replace />} />
          <Route path="os/agenda" element={<AgendaPage />} />
          <Route path="os/:id/relatorio" element={<WorkOrderReportPage />} />
          <Route path="os/:id" element={<WorkOrderDetailPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="conta" element={<Navigate to="/painel/perfil" replace />} />
          <Route path="plano" element={<PlanPage />} />
          <Route path="ajuda" element={<HelpPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
