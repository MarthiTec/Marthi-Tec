import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { ExitOrLogoutDialog } from '../../components/ExitOrLogoutDialog';
import { UserChip } from '../../components/UserChip';
import { useAuth } from '../../contexts/AuthContext';
import { isMarthiStaffEmail } from '../../data/marthiStaff';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import '../admin/admin.css';
import './marthi.css';

export function MarthiLayout() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isDark } = usePanelTheme();
  const [navOpen, setNavOpen] = useState(true);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const staff = isMarthiStaffEmail(user?.email);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login?next=/admin', { replace: true });
    }
  }, [loading, navigate, user]);

  if (loading) {
    return (
      <div className={`admin admin--loading ${isDark ? 'admin--dark' : ''}`}>
        <p className="empty">Carregando Painel Marthi…</p>
      </div>
    );
  }

  if (!user) return null;

  if (!staff) {
    return <Navigate to="/painel" replace />;
  }

  return (
    <div
      className={`admin marthi-ops ${navOpen ? '' : 'is-collapsed'} ${isDark ? 'admin--dark is-theme-dark' : ''}`}
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
            className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
          >
            <AdminIcon name="home" />
            <span className="admin__link-label">Dashboard</span>
          </NavLink>
          <NavLink
            to="/admin/clientes"
            title="Clientes ativos"
            className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
          >
            <AdminIcon name="people" />
            <span className="admin__link-label">Clientes ativos</span>
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
        <main className="admin__main">
          <Outlet />
        </main>
      </div>

      <ExitOrLogoutDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        appName="Painel Marthi"
        logoutOnly
      />
    </div>
  );
}
