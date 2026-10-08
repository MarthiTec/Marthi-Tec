import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { ExitOrLogoutDialog } from '../../components/ExitOrLogoutDialog';
import { UserChip } from '../../components/UserChip';
import { useAuth } from '../../contexts/AuthContext';
import { isMarthiStaffEmail } from '../../data/marthiStaff';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import '../admin/admin.css';
import './marthi.css';

function resolveMarthiTitle(pathname: string): { kicker: string; title: string } {
  if (pathname === '/admin') return { kicker: 'Painel Marthi', title: 'Dashboard Operacional' };
  if (pathname.startsWith('/admin/clientes')) return { kicker: 'Contratos & Licenças', title: 'Clientes Ativos' };
  if (pathname.startsWith('/admin/planos')) return { kicker: 'Comercial & Precificação', title: 'Planos Comerciais' };
  if (pathname.startsWith('/admin/descontos')) return { kicker: 'Licenciamento Multi-Loja', title: 'Desconto Progressivo' };
  if (pathname.startsWith('/admin/recebimentos')) return { kicker: 'Financeiro & Pix', title: 'Recebimentos & Pix' };
  return { kicker: 'Administração', title: 'Painel Marthi' };
}

export function MarthiLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const { isDark } = usePanelTheme();
  const [navOpen, setNavOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const staff = isMarthiStaffEmail(user?.email);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login?next=/admin', { replace: true });
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const pageInfo = useMemo(() => resolveMarthiTitle(location.pathname), [location.pathname]);

  if (loading) {
    return (
      <div className={`admin admin--loading ${isDark ? 'admin--dark' : ''}`}>
        <p className="empty">Carregando Painel Marthi…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!staff) {
    return <Navigate to="/painel" replace />;
  }

  return (
    <div
      className={`admin marthi-ops ${menuOpen ? 'is-menu-open' : ''} ${navOpen ? '' : 'is-collapsed'} ${
        isDark ? 'admin--dark is-theme-dark' : ''
      }`}
    >
      <aside className="admin__sidebar">
        <div className="admin__brand">
          <BrandLogo variant="mark" className="admin__mark" />
          <div className="admin__brand-text">
            <strong>Painel Marthi</strong>
            <span>Operações internas</span>
          </div>
          <button
            type="button"
            className="admin__burger-btn admin__burger-btn--brand"
            aria-label={navOpen ? 'Recolher menu' : 'Expandir menu'}
            title={navOpen ? 'Recolher menu' : 'Expandir menu'}
            onClick={() => setNavOpen((open) => !open)}
          >
            <AdminIcon name={navOpen ? 'collapse' : 'expand'} />
          </button>
        </div>

        <UserChip variant="sidebar" showPresence={false} title="Conta Marthi" />

        <nav className="admin__nav" aria-label="Painel Marthi">
          <NavLink
            to="/admin"
            end
            title="Dashboard"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
          >
            <AdminIcon name="home" />
            <span className="admin__link-label">Dashboard</span>
          </NavLink>
          <NavLink
            to="/admin/clientes"
            title="Clientes ativos"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
          >
            <AdminIcon name="people" />
            <span className="admin__link-label">Clientes ativos</span>
          </NavLink>
          <NavLink
            to="/admin/planos"
            title="Planos comerciais"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
          >
            <AdminIcon name="receipt" />
            <span className="admin__link-label">Planos comerciais</span>
          </NavLink>
          <NavLink
            to="/admin/descontos"
            title="Desconto progressivo"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
          >
            <AdminIcon name="ops" />
            <span className="admin__link-label">Desconto progressivo</span>
          </NavLink>
          <NavLink
            to="/admin/recebimentos"
            title="Recebimentos & Pix"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
          >
            <AdminIcon name="payments" />
            <span className="admin__link-label">Recebimentos & Pix</span>
          </NavLink>
          <NavLink
            to="/admin/crm"
            title="CRM comercial"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
          >
            <AdminIcon name="badge" />
            <span className="admin__link-label">CRM comercial</span>
          </NavLink>
        </nav>

        <div className="admin__sidebar-foot">
          <button
            type="button"
            className="admin__logout"
            onClick={() => setLogoutOpen(true)}
            title="Encerrar sessão Marthi"
          >
            <AdminIcon name="logout" />
            <span className="admin__link-label">Log-out</span>
          </button>
        </div>
      </aside>

      <div className="admin__workspace">
        <header className="admin__top">
          <button
            type="button"
            className="admin__burger-btn admin__burger-btn--top"
            aria-label="Abrir menu"
            title="Abrir menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="admin__burger" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
          <div className="admin__title">
            <p className="admin__kicker">{pageInfo.kicker}</p>
            <h1>{pageInfo.title}</h1>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="marthi-pill marthi-pill--ok">Marthi Staff</span>
          </div>
        </header>

        <main className="admin__main">
          <Outlet />
        </main>
      </div>

      {menuOpen ? (
        <button
          type="button"
          className="admin__backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <ExitOrLogoutDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        appName="Painel Marthi"
        logoutOnly
      />
    </div>
  );
}
