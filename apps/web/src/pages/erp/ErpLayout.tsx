import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon, type AdminIconName } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { ExitOrLogoutDialog } from '../../components/ExitOrLogoutDialog';
import { ModuleMenuButton } from '../../components/ModuleMenuButton';
import { ModuleSideFoot } from '../../components/ModuleSideFoot';
import { ScreenBackButton } from '../../components/ScreenBackButton';
import { StoreSwitcher } from '../../components/StoreSwitcher';
import { UserChip } from '../../components/UserChip';
import { OsEcosystemMenu } from '../os/OsEcosystemMenu';
import { useAuth } from '../../contexts/AuthContext';
import { userIsStoreAdmin } from '../../data/erpRegistry';
import { usePresenceSession } from '../../hooks/usePresence';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import { useStoreCustomization } from '../../data/storeSegment';
import '../admin/admin.css';
import './erp.css';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/erp': { kicker: 'Retaguarda', title: 'Retaguarda da loja' },
  '/erp/lojas': { kicker: 'Retaguarda', title: 'Lojas & Licenciamento por CNPJ' },
  '/erp/perfil': { kicker: 'Retaguarda', title: 'Meu perfil' },
  '/erp/conta': { kicker: 'Retaguarda', title: 'Meu perfil' },
  '/erp/produtos': { kicker: 'Produtos', title: 'Cadastro de produtos' },
  '/erp/balanco': { kicker: 'Estoque', title: 'Balanço de estoque' },
  '/erp/movimentos': { kicker: 'Estoque', title: 'Movimentação de estoque' },
  '/erp/atributos': { kicker: 'Produtos', title: 'Atributos' },
  '/erp/api-aparelhos': { kicker: 'Produtos', title: 'Consulta de aparelhos por API' },
  '/erp/tipos-retirada': { kicker: 'Produtos', title: 'Retirada e entrega' },
  '/erp/notas': { kicker: 'Estoque', title: 'Notas de entrada e saída' },
  '/erp/marcas': { kicker: 'Produtos', title: 'Marcas' },
  '/erp/kits': { kicker: 'Produtos', title: 'Kits' },
  '/erp/lotes': { kicker: 'Produtos', title: 'Lotes / Rastro' },
  '/erp/almoxarifado': { kicker: 'Produtos', title: 'Almoxarifado' },
  '/erp/tabelas': { kicker: 'Produtos', title: 'Tabelas de preço' },
  '/erp/campanhas': { kicker: 'Produtos', title: 'Campanhas de desconto' },
  '/erp/orcamentos': { kicker: 'Comercial', title: 'Orçamentos e Propostas Comerciais' },
  '/erp/comercial': { kicker: 'Comercial', title: 'Encomendas e fornecedores' },
  '/erp/clientes': { kicker: 'Pessoas', title: 'Clientes' },
  '/erp/funcionarios': { kicker: 'Pessoas', title: 'Funcionários' },
  '/erp/permissoes': { kicker: 'Pessoas', title: 'Permissões de acesso' },
  '/erp/vendedores': { kicker: 'Pessoas', title: 'Vendedores' },
  '/erp/fornecedores': { kicker: 'Pessoas', title: 'Fornecedores' },
  '/erp/financeiro': { kicker: 'Financeiro', title: 'Financeiro da loja' },
  '/erp/boletos': { kicker: 'Financeiro', title: 'Boletos' },
  '/erp/relatorios': { kicker: 'Retaguarda', title: 'Relatórios' },
  '/erp/auditoria': { kicker: 'Retaguarda', title: 'Auditoria' },
  '/erp/cardapio': { kicker: 'Restaurante', title: 'Cardápio Digital do Dia' },
  '/erp/cardapio/imprimir': { kicker: 'Restaurante', title: 'Display de Mesa' },
};

type NavItem = { to: string; label: string; icon: AdminIconName; end?: boolean };

const NAV_FOOD: NavItem[] = [
  { to: '/erp/cardapio', label: 'Cardápio Digital', icon: 'store' },
  { to: '/mesa', label: 'Mesas / Salão', icon: 'ops' },
  { to: '/cozinha', label: 'Cozinha', icon: 'totem' },
];

const NAV_PRODUCTS: NavItem[] = [
  { to: '/erp/produtos', label: 'Cadastro', icon: 'box', end: true },
  { to: '/erp/balanco', label: 'Balanço', icon: 'box' },
  { to: '/erp/movimentos', label: 'Movimentos', icon: 'ops' },
  { to: '/erp/atributos', label: 'Atributos', icon: 'ops' },
  { to: '/erp/api-aparelhos', label: 'API de aparelhos', icon: 'ops' },
  { to: '/erp/notas', label: 'Notas de estoque', icon: 'fiscal' },
  { to: '/erp/marcas', label: 'Marcas', icon: 'ops' },
  { to: '/erp/kits', label: 'Kits', icon: 'box' },
  { to: '/erp/lotes', label: 'Lotes / Rastro', icon: 'box' },
  { to: '/erp/almoxarifado', label: 'Almoxarifado', icon: 'box' },
  { to: '/erp/tabelas', label: 'Tabelas de preço', icon: 'ops' },
  { to: '/erp/campanhas', label: 'Campanhas', icon: 'ops' },
  { to: '/erp/orcamentos', label: 'Orçamentos', icon: 'ops' },
  { to: '/erp/comercial', label: 'Encomendas & Ofertas', icon: 'ops' },
];

const NAV_PEOPLE: NavItem[] = [
  { to: '/erp/clientes', label: 'Clientes', icon: 'people' },
  { to: '/erp/funcionarios', label: 'Funcionários', icon: 'people' },
  { to: '/erp/permissoes', label: 'Permissões', icon: 'ops' },
  { to: '/erp/vendedores', label: 'Vendedores', icon: 'people' },
  { to: '/erp/fornecedores', label: 'Fornecedores', icon: 'people' },
];

const NAV_FINANCE: NavItem[] = [
  { to: '/erp/financeiro', label: 'Financeiro', icon: 'ops' },
  { to: '/erp/taxas-cartao', label: 'Taxas & Maquininhas', icon: 'ops' },
  { to: '/erp/boletos', label: 'Boletos', icon: 'fiscal' },
];

const NAV_BACK: NavItem[] = [
  { to: '/erp/relatorios', label: 'Relatórios', icon: 'ops' },
  { to: '/erp/auditoria', label: 'Auditoria', icon: 'ops' },
];

function isMobileNav() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
}

export function ErpLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  usePresenceSession('erp');
  const { isDark } = usePanelTheme();
  const storeCustom = useStoreCustomization();
  const [navOpen, setNavOpen] = useState(() => !isMobileNav());
  const [exitOpen, setExitOpen] = useState(false);

  const title = TITLES[location.pathname] ?? {
    kicker: 'Retaguarda',
    title: location.pathname.startsWith('/erp/financeiro')
      ? 'Financeiro da loja'
      : 'Retaguarda',
  };

  useEffect(() => {
    if (isMobileNav()) setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && navOpen && isMobileNav()) {
        setNavOpen(false);
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (key === 'm') {
          event.preventDefault();
          setNavOpen((open) => !open);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  function renderNav(items: NavItem[]) {
    return items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => (isActive ? 'is-active' : undefined)}
      >
        <AdminIcon name={item.icon} />
        {item.label}
      </NavLink>
    ));
  }
  if (loading) {
    return (
      <div className={`erp-app erp-app--loading ${isDark ? 'is-theme-dark' : ''}`}>
        <p className="empty" style={{ padding: 32 }}>Carregando Retaguarda…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={`erp-app ${navOpen ? 'is-nav-open' : 'is-nav-closed'} ${isDark ? 'is-theme-dark' : ''}`}>
      <header className="erp-app__top">
        <OsEcosystemMenu />
        <ModuleMenuButton open={navOpen} onClick={() => setNavOpen((open) => !open)} />
        <StoreSwitcher compact />
        <BrandLogo variant="mark" className="erp-app__mark" />
        <div className="erp-app__brand">
          <strong>Marthi Retaguarda</strong>
        </div>
        {userIsStoreAdmin(user?.email) ? (
          <Link to="/painel" className="app-to-panel-btn" title="Voltar ao Painel Administrativo">
            <AdminIcon name="home" />
            <span>Painel</span>
          </Link>
        ) : null}
        <button type="button" className="erp-app__exit" onClick={() => setExitOpen(true)}>
          Sair
        </button>
      </header>

      {navOpen ? (
        <button
          type="button"
          className="erp-app__backdrop"
          aria-label="Fechar menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <div className="erp-app__shell">
        <aside className="erp-app__side" aria-label="Menu da Retaguarda" aria-hidden={!navOpen}>
          <div className="erp-app__side-head">
            <strong>Navegação</strong>
            <button
              type="button"
              className="erp-app__side-close"
              title="Central da Retaguarda"
              aria-label="Ir para a central da Retaguarda"
              onClick={() => {
                setNavOpen(false);
                navigate('/erp');
              }}
            >
              <AdminIcon name="home" />
            </button>
          </div>

          <UserChip
            to="/erp/perfil"
            onOpen={() => {
              if (isMobileNav()) setNavOpen(false);
            }}
          />

          <NavLink to="/erp" end className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            <AdminIcon name="home" />
            Central
          </NavLink>

          {storeCustom.showCardapioDigital || storeCustom.showTablesAndKitchen ? (
            <>
              <p className="erp-app__side-label">Atendimento & Salão</p>
              {renderNav(
                NAV_FOOD.filter((item) => {
                  if (item.to.includes('cardapio') && !storeCustom.showCardapioDigital) return false;
                  if (
                    (item.to === '/mesa' || item.to === '/cozinha') &&
                    !storeCustom.showTablesAndKitchen
                  ) {
                    return false;
                  }
                  return true;
                }),
              )}
            </>
          ) : null}

          <p className="erp-app__side-label">Produtos</p>
          {renderNav(NAV_PRODUCTS)}

          <p className="erp-app__side-label">Pessoas</p>
          {renderNav(NAV_PEOPLE)}

          <p className="erp-app__side-label">Financeiro</p>
          {renderNav(NAV_FINANCE)}

          <p className="erp-app__side-label">Retaguarda</p>
          {renderNav(NAV_BACK)}

          <p className="erp-app__side-note">
            Outros módulos ficam nos apps próprios.{' '}
            {storeCustom.showTechnicalBench ? (
              <>
                <NavLink to="/os">Oficina (OS)</NavLink> ·{' '}
              </>
            ) : null}
            <NavLink to="/caixa">Caixa</NavLink> · <NavLink to="/fiscal">Fiscal</NavLink>
          </p>
          <ModuleSideFoot />
        </aside>

        <div className="erp-app__main">
          <header className="erp-app__heading">
            <div>
              <ScreenBackButton home="/erp" />
              <p className="admin__kicker">{title.kicker}</p>
              <h1>{title.title}</h1>
            </div>
            <div id="panel-page-actions" className="erp-app__heading-actions" />
          </header>
          <div className="erp-app__content">
            <ErrorBoundary fallbackTitle="Erro ao carregar módulo da retaguarda">
              <Outlet />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      <ExitOrLogoutDialog
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        appName="Retaguarda"
        exitActionLabel="Sair da Retaguarda"
        afterExitTo="/painel"
      />
    </div>
  );
}
