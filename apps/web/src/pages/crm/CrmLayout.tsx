import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { ExitOrLogoutDialog } from '../../components/ExitOrLogoutDialog';
import { ModuleSideFoot } from '../../components/ModuleSideFoot';
import { ScreenBackButton } from '../../components/ScreenBackButton';
import { UserChip } from '../../components/UserChip';
import { useAuth } from '../../contexts/AuthContext';
import { ensureCrmSellerProfile, resolveCrmSeller, crmInboxUnansweredCount } from '../../data/crmStore';
import { CrmSellerAlerts } from '../../components/CrmSellerAlerts';
import { usePresenceSession } from '../../hooks/usePresence';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import '../admin/admin.css';
import './crm.css';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/crm': { kicker: 'Marthi CRM', title: 'Central · Negócios' },
  '/crm/conversas': { kicker: 'Marthi CRM', title: 'Conversas' },
  '/crm/perfil': { kicker: 'Marthi CRM', title: 'Meu perfil' },
  '/crm/conta': { kicker: 'Marthi CRM', title: 'Meu perfil' },
  '/crm/rede': { kicker: 'Marthi CRM', title: 'Rede Marthi' },
};

function resolveTitle(pathname: string) {
  if (pathname.startsWith('/crm/negocio/')) {
    return { kicker: 'Marthi CRM', title: 'Detalhe do negócio' };
  }
  return TITLES[pathname] ?? { kicker: 'Marthi CRM', title: 'CRM' };
}

function isMobileNav() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
}

export function CrmLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  usePresenceSession('crm');
  const { isDark } = usePanelTheme();
  const seller = useMemo(
    () => resolveCrmSeller(user?.name, user?.email),
    [user?.name, user?.email],
  );

  useEffect(() => {
    void ensureCrmSellerProfile(seller.sellerId, seller.sellerName);
  }, [seller.sellerId, seller.sellerName]);
  const [navOpen, setNavOpen] = useState(() => !isMobileNav());
  const [exitOpen, setExitOpen] = useState(false);

  const [inboxTick, setInboxTick] = useState(0);
  const unanswered = useMemo(
    () => crmInboxUnansweredCount(seller.sellerId),
    [seller.sellerId, inboxTick, location.pathname],
  );

  useEffect(() => {
    function refresh() {
      setInboxTick((value) => value + 1);
    }
    window.addEventListener('marthi-crm-updated', refresh);
    return () => window.removeEventListener('marthi-crm-updated', refresh);
  }, []);

  const title = resolveTitle(location.pathname);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/login?next=/crm', { replace: true });
  }, [loading, navigate, user]);

  useEffect(() => {
    if (isMobileNav()) setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
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
  }, []);

  if (loading) {
    return (
      <div className={`crm-app ${isDark ? 'is-theme-dark' : ''}`}>
        <p className="empty" style={{ padding: 24 }}>
          Carregando CRM…
        </p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={`crm-app ${navOpen ? 'is-nav-open' : 'is-nav-closed'} ${isDark ? 'is-theme-dark' : ''}`}>
      <header className="crm-app__top">
        <button
          type="button"
          className="crm-app__menu-btn"
          aria-expanded={navOpen}
          title="Menu · Alt+M"
          onClick={() => setNavOpen((open) => !open)}
        >
          <AdminIcon name="ops" />
          <span>{navOpen ? 'Fechar' : 'Menu'}</span>
          <kbd>Alt+M</kbd>
        </button>
        <BrandLogo variant="mark" className="crm-app__mark" />
        <div className="crm-app__brand">
          <strong>Marthi CRM</strong>
        </div>
        <button type="button" className="crm-app__exit" onClick={() => setExitOpen(true)}>
          Sair
        </button>
      </header>

      {navOpen ? (
        <button
          type="button"
          className="crm-app__backdrop"
          aria-label="Fechar menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <div className="crm-app__shell">
        <aside className="crm-app__side" aria-hidden={!navOpen}>
          <div className="crm-app__side-head">
            <strong>Navegação</strong>
            <button
              type="button"
              className="crm-app__side-close"
              title="Central do CRM"
              aria-label="Ir para a central do CRM"
              onClick={() => {
                setNavOpen(false);
                navigate('/crm');
              }}
            >
              <AdminIcon name="home" />
            </button>
          </div>

          <UserChip
            to="/crm/perfil"
            onOpen={() => {
              if (isMobileNav()) setNavOpen(false);
            }}
          />

          <NavLink to="/crm" end className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            <AdminIcon name="home" />
            Central
          </NavLink>
          <p className="crm-app__side-label">CRM</p>
          <NavLink
            to="/crm/conversas"
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
          >
            <AdminIcon name="people" />
            Conversas
            {unanswered > 0 ? <em className="crm-nav-badge">{unanswered}</em> : null}
          </NavLink>
          <NavLink
            to="/crm/rede"
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
          >
            <AdminIcon name="people" />
            Rede Marthi
          </NavLink>
          <ModuleSideFoot />
        </aside>

        <div className="crm-app__main">
          <header className="crm-app__heading">
            <div>
              <ScreenBackButton home="/crm" />
              <p className="admin__kicker">{title.kicker}</p>
              <h1>{title.title}</h1>
            </div>
          </header>
          <div className="crm-app__content">
            <Outlet context={seller} />
          </div>
        </div>
      </div>

      <ExitOrLogoutDialog
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        appName="CRM"
        exitActionLabel="Sair do CRM"
      />

      <CrmSellerAlerts />
    </div>
  );
}
