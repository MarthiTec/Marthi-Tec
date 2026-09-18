import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import { useAuth } from '../../contexts/AuthContext';
import { getOperatorProfile } from '../../data/operatorProfile';
import './admin.css';

const NAV = [
  { to: '/painel', label: 'Painel', end: true },
  { to: '/painel/pdv', label: 'PDV' },
  { to: '/painel/pedidos', label: 'Pedidos' },
  { to: '/painel/clientes', label: 'Clientes' },
  { to: '/painel/estoque', label: 'Estoque' },
  { to: '/painel/financeiro', label: 'Financeiro' },
];

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/painel': { kicker: 'ERP', title: 'Painel da operação' },
  '/painel/pdv': { kicker: 'Vendas', title: 'PDV' },
  '/painel/pedidos': { kicker: 'Vendas', title: 'Pedidos' },
  '/painel/clientes': { kicker: 'Cadastros', title: 'Clientes' },
  '/painel/estoque': { kicker: 'Cadastros', title: 'Estoque' },
  '/painel/financeiro': { kicker: 'Gestão', title: 'Financeiro' },
  '/painel/perfil': { kicker: 'Conta', title: 'Meu perfil' },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

export function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(() => getOperatorProfile(user?.name ?? 'Operador'));

  useEffect(() => {
    if (!user) return;
    setProfile(getOperatorProfile(user.name));
  }, [user]);

  useEffect(() => {
    function refresh() {
      setProfile(getOperatorProfile(user?.name ?? 'Operador'));
    }
    window.addEventListener('marthi-profile-updated', refresh);
    return () => window.removeEventListener('marthi-profile-updated', refresh);
  }, [user]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="admin admin--loading">
        <p>Carregando painel…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const page = TITLES[location.pathname] ?? { kicker: 'ERP', title: 'Operação' };
  const photo = profile.photo || user.picture;
  const mark = initials(profile.displayName);

  return (
    <div className={`admin ${menuOpen ? 'is-menu-open' : ''}`}>
      <aside className="admin__sidebar">
        <div className="admin__brand">
          <BrandLogo variant="mark" className="admin__mark" />
          <div>
            <strong>Sua Loja</strong>
            <span>ERP Marthi</span>
          </div>
        </div>

        <NavLink
          to="/painel/perfil"
          className={({ isActive }) => `admin__who ${isActive ? 'is-active' : ''}`}
        >
          <span className="admin__photo">
            {photo ? <img src={photo} alt="" /> : <span>{mark}</span>}
          </span>
          <span className="admin__who-text">
            <em>Olá</em>
            <strong>{profile.displayName}</strong>
            <small>{profile.role}</small>
          </span>
        </NavLink>

        <nav className="admin__nav" aria-label="Módulos do ERP">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin__sidebar-foot">
          <button type="button" className="admin__logout" onClick={logout}>
            Sair
          </button>
        </div>
      </aside>

      <div className="admin__workspace">
        <header className="admin__top">
          <button
            type="button"
            className="admin__menu"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
          <div className="admin__title">
            <p className="admin__kicker">{page.kicker}</p>
            <h1>{page.title}</h1>
          </div>
          <NavLink to="/painel/perfil" className="admin__user" aria-label="Abrir meu perfil">
            {photo ? <img src={photo} alt="" /> : <span>{mark}</span>}
          </NavLink>
        </header>

        <div className="admin__main">
          <Outlet />
        </div>
      </div>

      {menuOpen ? (
        <button
          type="button"
          className="admin__backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
    </div>
  );
}
