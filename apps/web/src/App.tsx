import {DeviceCatalogSettingsPage} from './pages/admin/DeviceCatalogSettingsPage';
import {PickupTrackingPage} from './pages/PickupTrackingPage';
import { ReceiptPublicPage } from './pages/ReceiptPublicPage';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isAllowedWhileTotemLocked, lockedTotemUrl } from './data/totemKioskLock';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AreaGuard } from './components/AreaGuard';
import './styles/operatorThemeDark.css';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SetupPasswordPage } from './pages/SetupPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ProductsPage } from './pages/ProductsPage';
import { PlansPublicPage } from './pages/PlansPublicPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { PartnerSignupPage } from './pages/PartnerSignupPage';
import { TotemPage } from './pages/totem/TotemPage';
import { TotemPreviewPage } from './pages/admin/TotemPreviewPage';
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
import { QuotesManagementPage } from './pages/admin/QuotesManagementPage';
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
import { SpecificationsPage } from './pages/admin/SpecificationsPage';
import { PeoplePage } from './pages/admin/PeoplePage';
import { EcommercePanelPage } from './pages/admin/EcommercePanelPage';
import { FiscalPanelPage } from './pages/admin/FiscalPanelPage';
import { ErpPanelPage } from './pages/admin/ErpPanelPage';
import { StockPage } from './pages/admin/StockPage';
import { CommercialPage } from './pages/admin/CommercialPage';
import { OrdersPage } from './pages/admin/OrdersPage';
import { FinancePage } from './pages/admin/FinancePage';
import { PosPage } from './pages/admin/PosPage';
import { PriceTablesPage } from './pages/admin/PriceTablesPage';
import { PaymentsPage } from './pages/admin/PaymentsPage';
import { CardRatesPage } from './pages/admin/CardRatesPage';
import { ProfilePage } from './pages/admin/ProfilePage';
import { WorkOrdersPage } from './pages/admin/WorkOrdersPage';
import { WorkOrderNewPage } from './pages/admin/WorkOrderNewPage';
import { WorkOrderDetailPage } from './pages/admin/WorkOrderDetailPage';
import { WorkOrderReportPage } from './pages/admin/WorkOrderReportPage';
import { AgendaPage } from './pages/admin/AgendaPage';
import { PlanPage } from './pages/admin/PlanPage';
import { StoreSegmentPage } from './pages/admin/StoreSegmentPage';
import { AuditPage } from './pages/admin/AuditPage';
import { InvoicesPage } from './pages/admin/InvoicesPage';
import { FiscalClassPage } from './pages/admin/FiscalClassPage';
import { CfopPage } from './pages/admin/CfopPage';
import { FiscalIssuerPage } from './pages/admin/FiscalIssuerPage';
import { FiscalCstPage } from './pages/admin/FiscalCstPage';
import { KitsPage } from './pages/admin/KitsPage';
import { LotsPage } from './pages/admin/LotsPage';
import { WarehousePage } from './pages/admin/WarehousePage';
import { HelpPage } from './pages/admin/HelpPage';
import { OperatorAccountPage } from './pages/shared/OperatorAccountPage';
import { MarthiLayout } from './pages/marthi/MarthiLayout';
import { MarthiDashboardPage } from './pages/marthi/MarthiDashboardPage';
import { MarthiClientsPage } from './pages/marthi/MarthiClientsPage';
import { MarthiPlansPage } from './pages/marthi/MarthiPlansPage';
import { MarthiDiscountsPage } from './pages/marthi/MarthiDiscountsPage';
import { MarthiPayoutSettingsPage } from './pages/marthi/MarthiPayoutSettingsPage';
import { CardapioPublicPage } from './pages/cardapio/CardapioPublicPage';
import { CardapioAdminPage } from './pages/cardapio/CardapioAdminPage';
import { CardapioPrintDisplay } from './pages/cardapio/CardapioPrintDisplay';
import { MultiStoreManagementPage } from './pages/erp/MultiStoreManagementPage';
import { PainelUsersPage } from './pages/admin/PainelUsersPage';
import { ExternalSalePage } from './pages/admin/ExternalSalePage';
import { GoalsManagementPage } from './pages/admin/GoalsManagementPage';
import { SalesGoalsReportPage } from './pages/admin/SalesGoalsReportPage';

function LegacyMarthiRedirect() {
  const location = useLocation();
  const suffix = location.pathname.replace(/^\/marthi/, '') || '';
  return <Navigate to={`/admin${suffix}${location.search}`} replace />;
}

/** O CRM é ferramenta interna da Marthi: os endereços antigos (/crm…) vão para o painel /admin. */
function LegacyCrmRedirect() {
  const location = useLocation();
  const suffix = location.pathname.replace(/^\/crm/i, '');
  return <Navigate to={`/admin/crm${suffix}${location.search}`} replace />;
}

/** Com o aparelho travado no totem, nenhuma outra tela (painel, login, site) chega a renderizar. */
function TotemKioskGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const totemUrl = lockedTotemUrl();
  if (totemUrl && !isAllowedWhileTotemLocked(location.pathname)) {
    return <Navigate to={totemUrl} replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <ErrorBoundary fallbackTitle="Ocorreu um erro no sistema">
        <TotemKioskGate>
        <Routes>
        <Route path="acompanhar-retirada/:token" element={<PickupTrackingPage />} />
        <Route path="/comprovante/:id" element={<ReceiptPublicPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/produtos" element={<ProductsPage />} />
        <Route path="/planos" element={<PlansPublicPage />} />
        <Route path="/precos" element={<Navigate to="/planos" replace />} />
        <Route path="/sobre" element={<AboutPage />} />
        <Route path="/sobre-nos" element={<Navigate to="/sobre" replace />} />
        <Route path="/contato" element={<ContactPage />} />
        <Route path="/fale-conosco" element={<Navigate to="/contato" replace />} />
        <Route path="/parceiro" element={<PartnerSignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/criar-senha" element={<SetupPasswordPage />} />
        <Route path="/definir-senha" element={<Navigate to="/criar-senha" replace />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/recuperar-senha" element={<Navigate to="/login?view=forgot" replace />} />
        <Route path="/perfil" element={<Navigate to="/painel/perfil" replace />} />
        <Route path="/totem" element={<TotemPage />} />
        <Route path="/caixa" element={<AreaGuard><CaixaPage /></AreaGuard>} />
        <Route path="/venda-externa" element={<Navigate to="/painel/venda-externa" replace />} />
        <Route path="/metas" element={<Navigate to="/painel/metas" replace />} />
        <Route path="/relatorio-vendas" element={<Navigate to="/painel/relatorio-vendas" replace />} />
        <Route path="/mesa" element={<MesaPage />} />
        <Route path="/cozinha" element={<CozinhaPage />} />
        <Route path="/cardapio" element={<CardapioPublicPage />} />
        <Route path="/cardapio/:slug" element={<CardapioPublicPage />} />
        <Route path="/admin" element={<MarthiLayout />}>
          <Route index element={<MarthiDashboardPage />} />
          <Route path="clientes" element={<MarthiClientsPage />} />
          <Route path="planos" element={<MarthiPlansPage />} />
          <Route path="descontos" element={<MarthiDiscountsPage />} />
          <Route path="licenciamento" element={<Navigate to="/admin/descontos" replace />} />
          <Route path="recebimentos" element={<MarthiPayoutSettingsPage />} />
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
        <Route path="/ecomerce/*" element={<Navigate to="/ecommerce" replace />} />
        <Route path="/ecomerce" element={<Navigate to="/ecommerce" replace />} />
        <Route path="/admin/crm" element={<CrmLayout />}>
          <Route index element={<CrmBoardPage />} />
          <Route path="conversas" element={<CrmInboxPage />} />
          <Route path="negocio/:id" element={<CrmDealPage />} />
          <Route path="conta" element={<Navigate to="/admin/crm/perfil" replace />} />
          <Route path="perfil" element={<CrmProfilePage />} />
          <Route path="rede" element={<CrmNetworkPage />} />
        </Route>
        <Route path="/crm/*" element={<LegacyCrmRedirect />} />
        <Route path="/CRM/*" element={<LegacyCrmRedirect />} />
        <Route path="/erp" element={<ErpLayout />}>
          <Route index element={<ErpHomePage />} />
          <Route path="perfil" element={<OperatorAccountPage />} />
          <Route path="conta" element={<OperatorAccountPage />} />
          <Route path="produtos" element={<StockPage />} />
          <Route path="balanco" element={<StockBalancePage />} />
          <Route path="movimentos" element={<StockMovementsPage />} />
          <Route path="notas" element={<InvoicesPage />} />
          <Route path="api-aparelhos" element={<DeviceCatalogSettingsPage />} />
          <Route path="especificacoes" element={<SpecificationsPage />} />
          <Route path="tipos-retirada" element={<Navigate to="/erp/especificacoes?aba=retirada" replace />} />
          <Route path="atributos" element={<Navigate to="/erp/especificacoes?aba=atributos" replace />} />
          <Route path="marcas" element={<Navigate to="/erp/especificacoes?aba=marcas" replace />} />
          <Route path="kits" element={<KitsPage />} />
          <Route path="lotes" element={<LotsPage />} />
          <Route path="almoxarifado" element={<WarehousePage />} />
          <Route path="tabelas" element={<PriceTablesPage />} />
          <Route path="campanhas" element={<PromoCampaignsPage />} />
          <Route path="orcamentos" element={<QuotesManagementPage />} />
          <Route path="comercial" element={<CommercialPage />} />
          <Route path="pessoas" element={<PeoplePage />} />
          <Route path="clientes" element={<Navigate to="/erp/pessoas?aba=clientes" replace />} />
          <Route path="funcionarios" element={<Navigate to="/erp/pessoas?aba=funcionarios" replace />} />
          <Route path="permissoes" element={<Navigate to="/erp/pessoas?aba=permissoes" replace />} />
          <Route path="vendedores" element={<Navigate to="/erp/pessoas?aba=vendedores" replace />} />
          <Route path="fornecedores" element={<Navigate to="/erp/pessoas?aba=fornecedores" replace />} />
          <Route path="financeiro" element={<FinancePage />} />
          <Route path="taxas-cartao" element={<CardRatesPage />} />
          <Route path="boletos" element={<ErpBoletosPage />} />
          <Route path="relatorios" element={<ErpReportsPage />} />
          <Route path="auditoria" element={<AuditPage />} />
          <Route path="cardapio" element={<CardapioAdminPage />} />
          <Route path="cardapio/imprimir" element={<CardapioPrintDisplay />} />
          <Route path="lojas" element={<Navigate to="/painel/lojas" replace />} />
        </Route>
        <Route path="/painel" element={<AdminLayout />}>
          <Route index element={<AdminHomePage />} />
          <Route path="lojas" element={<MultiStoreManagementPage />} />
          <Route path="usuarios" element={<PainelUsersPage />} />
          <Route path="operacoes" element={<OperationsPage />} />
          <Route path="operacoes/usuarios" element={<OperationsPage />} />
          <Route path="operacoes/comunicacao" element={<OperationsPage />} />
          <Route path="operacoes/whatsapp" element={<OperationsPage />} />
          <Route path="pdv" element={<PosPage />} />
          <Route path="pdv/venda" element={<Navigate to="/caixa" replace />} />
          <Route path="venda-externa" element={<ExternalSalePage />} />
          <Route path="metas" element={<GoalsManagementPage />} />
          <Route path="relatorio-vendas" element={<SalesGoalsReportPage />} />
          <Route path="totem" element={<TotemInsightsPage />} />
          <Route path="totem/produtos" element={<StockPage />} />
          <Route path="totem/especificacoes" element={<SpecificationsPage />} />
          <Route path="totem/atributos" element={<Navigate to="/painel/totem/especificacoes?aba=atributos" replace />} />
          <Route path="totem/marcas" element={<Navigate to="/painel/totem/especificacoes?aba=marcas" replace />} />
          <Route path="especificacoes" element={<SpecificationsPage />} />
          <Route path="pessoas" element={<PeoplePage />} />
          <Route path="totem/config" element={<TotemSettingsPage />} />
          <Route path="totem/previa" element={<TotemPreviewPage />} />
          <Route path="pedidos" element={<OrdersPage />} />
          <Route path="crm" element={<Navigate to="/painel" replace />} />
          <Route path="ecommerce" element={<EcommercePanelPage />} />
          <Route path="fiscal" element={<FiscalPanelPage />} />
          <Route path="erp" element={<ErpPanelPage />} />
          <Route path="clientes" element={<Navigate to="/painel/pessoas?aba=clientes" replace />} />
          <Route path="produtos" element={<Navigate to="/erp/produtos" replace />} />
          <Route path="estoque" element={<Navigate to="/erp/balanco" replace />} />
          <Route path="balanco" element={<Navigate to="/erp/balanco" replace />} />
          <Route path="movimentos" element={<Navigate to="/erp/movimentos" replace />} />
          <Route path="atributos" element={<Navigate to="/painel/especificacoes?aba=atributos" replace />} />
          <Route path="marcas" element={<Navigate to="/painel/especificacoes?aba=marcas" replace />} />
          <Route path="kits" element={<Navigate to="/erp/kits" replace />} />
          <Route path="lotes" element={<Navigate to="/erp/lotes" replace />} />
          <Route path="almoxarifado" element={<Navigate to="/erp/almoxarifado" replace />} />
          <Route path="tabelas" element={<Navigate to="/erp/tabelas" replace />} />
          <Route path="campanhas" element={<Navigate to="/erp/campanhas" replace />} />
          <Route path="orcamentos" element={<Navigate to="/erp/orcamentos" replace />} />
          <Route path="pagamentos" element={<PaymentsPage />} />
          <Route path="taxas-cartao" element={<CardRatesPage />} />
          <Route path="financeiro" element={<Navigate to="/erp/financeiro" replace />} />
          <Route path="vendedores" element={<Navigate to="/painel/pessoas?aba=vendedores" replace />} />
          <Route path="fornecedores" element={<Navigate to="/painel/pessoas?aba=fornecedores" replace />} />
          <Route path="funcionarios" element={<Navigate to="/painel/pessoas?aba=funcionarios" replace />} />
          <Route path="permissoes" element={<Navigate to="/painel/pessoas?aba=permissoes" replace />} />
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
          <Route path="ramo" element={<StoreSegmentPage />} />
          <Route path="personalizacao" element={<StoreSegmentPage />} />
          <Route path="cardapio" element={<CardapioAdminPage />} />
          <Route path="cardapio/imprimir" element={<CardapioPrintDisplay />} />
          <Route path="ajuda" element={<HelpPage />} />
        </Route>
      </Routes>
        </TotemKioskGate>
      </ErrorBoundary>
    </AuthProvider>
  );
}
