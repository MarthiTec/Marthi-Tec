import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { UserChip } from '../../components/UserChip';
import { useAuth } from '../../contexts/AuthContext';
import { isMarthiStaffEmail } from '../../data/marthiStaff';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import '../admin/admin.css';
import './marthi.css';

export function MarthiLayout() {
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const { isDark } = usePanelTheme();
  const [navOpen, setNavOpen] = useState(true);
  const staff = isMarthiStaffEmail(user?.email);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login?next=/marthi', { replace: true });
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
    <div className={`admin marthi-ops ${navOpen ? '' : 'is-collapsed'} ${isDark ? 'admin--dark' : ''}`}>
      <aside className="admin__sidebar">
        <div className="admin__brand">
          <BrandLogo variant="mark" className="admin__brand-mark" />
          <div className="admin__brand-text">
            <strong>Painel Marthi</strong>
            <span>Operações internas</span>
          </div>
          <button
            type="button"
            className="admin__burger-btn"
            aria-label={navOpen ? 'Recolher menu' : 'Expandir menu'}
            onClick={() => setNavOpen((open) => !open)}
          >
            ☰
          </button>
        </div>
        <nav className="admin__nav" aria-label="Painel Marthi">
          <NavLink to="/marthi" end className="admin__nav-link">
            Dashboard
          </NavLink>
          <NavLink to="/marthi/clientes" className="admin__nav-link">
            Clientes ativos
          </NavLink>
        </nav>
        <div className="admin__side-foot">
          <UserChip />
          <button type="button" className="admin__logout" onClick={logout} title="Log-out">
            <AdminIcon name="logout" />
            <span className="admin__link-label">Sair</span>
          </button>
        </div>
      </aside>
      <main className="admin__main">
        <Outlet />
      </main>
    </div>
  );
}
