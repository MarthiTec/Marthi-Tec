import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
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
import './ecommerce.css';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/ecommerce': { kicker: 'E-commerce', title: 'Central de canais' },
  '/ecommerce/perfil': { kicker: 'E-commerce', title: 'Meu perfil' },
  '/ecommerce/conta': { kicker: 'E-commerce', title: 'Meu perfil' },
  '/ecommerce/pedidos': { kicker: 'E-commerce', title: 'Pedidos dos canais' },
  '/ecommerce/anuncios': { kicker: 'E-commerce', title: 'Anúncios e catálogo' },
  '/ecommerce/conexoes': { kicker: 'E-commerce', title: 'Conexões' },
  '/ecommerce/mercadolivre': { kicker: 'Marketplace', title: 'Mercado Livre' },
  '/ecommerce/shopee': { kicker: 'Marketplace', title: 'Shopee' },
  '/ecommerce/ifood': { kicker: 'Marketplace', title: 'iFood' },
  '/ecommerce/amazon': { kicker: 'Marketplace', title: 'Amazon' },
  '/ecommerce/tray': { kicker: 'Hub', title: 'Tray Commerce' },
};

const NAV_OPS = [
  { to: '/ecommerce/pedidos', label: 'Pedidos' },
  { to: '/ecommerce/anuncios', label: 'Anúncios' },
  { to: '/ecommerce/conexoes', label: 'Conexões' },
] as const;

const NAV_MARKET = [
  { to: '/ecommerce/mercadolivre', label: 'Mercado Livre' },
  { to: '/ecommerce/shopee', label: 'Shopee' },
  { to: '/ecommerce/ifood', label: 'iFood' },
  { to: '/ecommerce/amazon', label: 'Amazon' },
] as const;

const NAV_HUBS = [{ to: '/ecommerce/tray', label: 'Tray' }] as const;

function isMobileNav() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
}

export function EcommerceLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  usePresenceSession('ecommerce');
  const { isDark } = usePanelTheme();
  const [navOpen, setNavOpen] = useState(() => !isMobileNav());
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);

  const title = TITLES[location.pathname] ?? {
    kicker: 'E-commerce',
    title: 'Canais de venda',
  };

  useEffect(() => {
    const allowed = hasModule('ecommerce') || hasDemoAccess('erp') || Boolean(user);
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

  return (
    <div className={`ecommerce-app ${navOpen ? 'is-nav-open' : 'is-nav-closed'} ${isDark ? 'is-theme-dark' : ''}`}>
      <header className="ecommerce-app__top">
        <button
          type="button"
          className="ecommerce-app__menu-btn"
          aria-label={navOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={navOpen}
          title="Menu · Alt+M"
          onClick={() => setNavOpen((open) => !open)}
        >
          <AdminIcon name="ops" />
          <span>{navOpen ? 'Fechar' : 'Menu'}</span>
          <kbd>Alt+M</kbd>
        </button>
        <BrandLogo variant="mark" className="ecommerce-app__mark" />
        <div className="ecommerce-app__brand">
          <strong>Marthi E-commerce</strong>
        </div>
        <button type="button" className="ecommerce-app__exit" onClick={requestExit}>
          Sair
        </button>
      </header>

      {navOpen ? (
        <button
          type="button"
          className="ecommerce-app__backdrop"
          aria-label="Fechar menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <div className="ecommerce-app__shell">
        <aside className="ecommerce-app__side" aria-label="Menu e-commerce" aria-hidden={!navOpen}>
          <div className="ecommerce-app__side-head">
            <strong>Navegação</strong>
            <button
              type="button"
              className="ecommerce-app__side-close"
              title="Central do e-commerce"
              aria-label="Ir para a central do e-commerce"
              onClick={() => {
                setNavOpen(false);
                navigate('/ecommerce');
              }}
            >
              <AdminIcon name="home" />
            </button>
          </div>

          <UserChip
            to="/ecommerce/perfil"
            onOpen={() => {
              if (isMobileNav()) setNavOpen(false);
            }}
          />

          <NavLink to="/ecommerce" end className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            <AdminIcon name="home" />
            Central
          </NavLink>

          <p className="ecommerce-app__side-label">Operação</p>
          {NAV_OPS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              <AdminIcon name="cart" />
              {item.label}
            </NavLink>
          ))}

          <p className="ecommerce-app__side-label">Marketplaces</p>
          {NAV_MARKET.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              <AdminIcon name="store" />
              {item.label}
            </NavLink>
          ))}

          <p className="ecommerce-app__side-label">Hubs</p>
          {NAV_HUBS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              <AdminIcon name="box" />
              {item.label}
            </NavLink>
          ))}
          <ModuleSideFoot />
        </aside>

        <div className="ecommerce-app__main">
          <header className="ecommerce-app__heading">
            <div>
              <ScreenBackButton home="/ecommerce" />
              <p className="admin__kicker">{title.kicker}</p>
              <h1>{title.title}</h1>
            </div>
          </header>
          <div className="ecommerce-app__content">
            <Outlet />
          </div>
        </div>
      </div>

      {exitOpen ? (
        <div
          className="ecommerce-lock"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ecommerce-exit-title"
        >
          <form className="ecommerce-lock__card" onSubmit={confirmExit}>
            <h2 id="ecommerce-exit-title">Saída protegida</h2>
            <p>Digite a senha da loja para sair do e-commerce.</p>
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
            <div className="ecommerce-lock__actions">
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
                Sair
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
