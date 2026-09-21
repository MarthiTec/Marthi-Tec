import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon, type AdminIconName } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { ModuleSideFoot } from '../../components/ModuleSideFoot';
import { ScreenBackButton } from '../../components/ScreenBackButton';
import { UserChip } from '../../components/UserChip';
import { useAuth } from '../../contexts/AuthContext';
import { hasDemoAccess } from '../../data/demoLeadStore';
import { hasModule } from '../../data/storePlan';
import { getTotemExitPassword } from '../../data/totemSettings';
import { usePresenceSession } from '../../hooks/usePresence';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import '../admin/admin.css';
import './erp.css';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/erp': { kicker: 'ERP', title: 'Retaguarda da loja' },
  '/erp/perfil': { kicker: 'ERP', title: 'Meu perfil' },
  '/erp/conta': { kicker: 'ERP', title: 'Meu perfil' },
  '/erp/produtos': { kicker: 'Produtos', title: 'Cadastro de produtos' },
  '/erp/balanco': { kicker: 'Estoque', title: 'Balanço de estoque' },
  '/erp/movimentos': { kicker: 'Estoque', title: 'Movimentação de estoque' },
  '/erp/atributos': { kicker: 'Produtos', title: 'Atributos' },
  '/erp/kits': { kicker: 'Produtos', title: 'Kits' },
  '/erp/lotes': { kicker: 'Produtos', title: 'Lotes / Rastro' },
  '/erp/almoxarifado': { kicker: 'Produtos', title: 'Almoxarifado' },
  '/erp/tabelas': { kicker: 'Produtos', title: 'Tabelas de preço' },
  '/erp/clientes': { kicker: 'Pessoas', title: 'Clientes' },
  '/erp/funcionarios': { kicker: 'Pessoas', title: 'Funcionários' },
  '/erp/permissoes': { kicker: 'Pessoas', title: 'Permissões de acesso' },
  '/erp/vendedores': { kicker: 'Pessoas', title: 'Vendedores' },
  '/erp/fornecedores': { kicker: 'Pessoas', title: 'Fornecedores' },
  '/erp/financeiro': { kicker: 'Financeiro', title: 'Financeiro da loja' },
  '/erp/boletos': { kicker: 'Financeiro', title: 'Boletos Pix e híbridos' },
  '/erp/relatorios': { kicker: 'Retaguarda', title: 'Relatórios' },
  '/erp/auditoria': { kicker: 'Retaguarda', title: 'Auditoria' },
};

type NavItem = { to: string; label: string; icon: AdminIconName; end?: boolean };

const NAV_PRODUCTS: NavItem[] = [
  { to: '/erp/produtos', label: 'Cadastro', icon: 'box', end: true },
  { to: '/erp/balanco', label: 'Balanço', icon: 'box' },
  { to: '/erp/movimentos', label: 'Movimentos', icon: 'ops' },
  { to: '/erp/atributos', label: 'Atributos', icon: 'ops' },
  { to: '/erp/kits', label: 'Kits', icon: 'box' },
  { to: '/erp/lotes', label: 'Lotes / Rastro', icon: 'box' },
  { to: '/erp/almoxarifado', label: 'Almoxarifado', icon: 'box' },
  { to: '/erp/tabelas', label: 'Tabelas de preço', icon: 'ops' },
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
  const { user } = useAuth();
  usePresenceSession('erp');
  const { isDark } = usePanelTheme();
  const [navOpen, setNavOpen] = useState(() => !isMobileNav());
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);

  const title = TITLES[location.pathname] ?? {
    kicker: 'ERP',
    title: location.pathname.startsWith('/erp/financeiro')
      ? 'Financeiro da loja'
      : 'Retaguarda',
  };

  useEffect(() => {
    const allowed = hasModule('erp') || hasDemoAccess('erp') || Boolean(user);
    if (!allowed && !user) {
      navigate('/', { replace: true });
    }
  }, [navigate, user]);

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

  function requestExit() {
    setExitOpen(true);
    setExitPassword('');
    setExitError(null);
  }

  function confirmExit(event: FormEvent) {
    event.preventDefault();
    if (exitPassword.trim() !== getTotemExitPassword()) {
      setExitError('Senha incorreta.');
      return;
    }
    navigate('/');
  }

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

  return (
    <div className={`erp-app ${navOpen ? 'is-nav-open' : 'is-nav-closed'} ${isDark ? 'is-theme-dark' : ''}`}>
      <header className="erp-app__top">
        <button
          type="button"
          className="erp-app__menu-btn"
          aria-label={navOpen ? 'Fechar menu do ERP' : 'Abrir menu do ERP'}
          aria-expanded={navOpen}
          title="Menu · Alt+M"
          onClick={() => setNavOpen((open) => !open)}
        >
          <AdminIcon name="ops" />
          <span>{navOpen ? 'Fechar' : 'Menu'}</span>
          <kbd>Alt+M</kbd>
        </button>
        <BrandLogo variant="mark" className="erp-app__mark" />
        <div className="erp-app__brand">
          <strong>Marthi ERP</strong>
        </div>
        <button type="button" className="erp-app__exit" onClick={requestExit}>
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
        <aside className="erp-app__side" aria-label="Menu do ERP" aria-hidden={!navOpen}>
          <div className="erp-app__side-head">
            <strong>Navegação</strong>
            <button
              type="button"
              className="erp-app__side-close"
              title="Central do ERP"
              aria-label="Ir para a central do ERP"
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

          <p className="erp-app__side-label">Produtos</p>
          {renderNav(NAV_PRODUCTS)}

          <p className="erp-app__side-label">Pessoas</p>
          {renderNav(NAV_PEOPLE)}

          <p className="erp-app__side-label">Financeiro</p>
          {renderNav(NAV_FINANCE)}

          <p className="erp-app__side-label">Retaguarda</p>
          {renderNav(NAV_BACK)}

          <p className="erp-app__side-note">
            PDV, totem e emissão fiscal ficam nos apps próprios.{' '}
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
          </header>
          <div className="erp-app__content">
            <Outlet />
          </div>
        </div>
      </div>

      {exitOpen ? (
        <div className="erp-lock" role="dialog" aria-modal="true" aria-labelledby="erp-exit-title">
          <form className="erp-lock__card" onSubmit={confirmExit}>
            <h2 id="erp-exit-title">Saída protegida</h2>
            <p>Digite a senha da loja para sair do ERP. O operador não acessa o painel por aqui.</p>
            {exitError ? (
              <p className="pdv__alert" role="alert">
                {exitError}
              </p>
            ) : null}
            <label>
              Senha
              <input
                type="password"
                value={exitPassword}
                onChange={(e) => setExitPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
            </label>
            <div className="erp-lock__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setExitOpen(false);
                  setExitPassword('');
                  setExitError(null);
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary">
                Sair do ERP
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
