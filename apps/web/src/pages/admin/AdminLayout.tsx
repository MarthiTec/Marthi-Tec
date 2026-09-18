import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import { useAuth } from '../../contexts/AuthContext';
import { getOperatorProfile } from '../../data/operatorProfile';
import { getStoreEntitlement, hasModule, moduleForPath, planLabel } from '../../data/storePlan';
import { ADMIN_NAV, childIsActive, navGroupForPath } from './adminNav';
import { ModuleLockedPage } from './ModuleLockedPage';
import './admin.css';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/painel': { kicker: 'ERP', title: 'Painel da operação' },
  '/painel/pdv': { kicker: 'Vendas', title: 'Fila do totem' },
  '/painel/pdv/venda': { kicker: 'Vendas', title: 'Lançar venda' },
  '/painel/totem': { kicker: 'Totem', title: 'Modo do totem' },
  '/painel/pedidos': { kicker: 'Vendas', title: 'Pedidos' },
  '/painel/clientes': { kicker: 'Cadastros', title: 'Clientes' },
  '/painel/estoque': { kicker: 'Cadastros', title: 'Estoque' },
  '/painel/atributos': { kicker: 'Cadastros', title: 'Atributos' },
  '/painel/tabelas': { kicker: 'Cadastros', title: 'Tabelas de preço' },
  '/painel/pagamentos': { kicker: 'Cadastros', title: 'Formas de pagamento' },
  '/painel/financeiro': { kicker: 'Gestão', title: 'Financeiro' },
  '/painel/os': { kicker: 'Oficina', title: 'Ordens de serviço' },
  '/painel/os/nova': { kicker: 'Oficina', title: 'Nova ordem de serviço' },
  '/painel/perfil': { kicker: 'Conta', title: 'Meu perfil' },
  '/painel/plano': { kicker: 'Contrato', title: 'Plano da loja' },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function resolveTitle(pathname: string, search: string) {
  if (pathname === '/painel/os' && search.includes('status=ready')) {
    return { kicker: 'Oficina', title: 'OS prontas' };
  }
  if (pathname === '/painel/os' && search.includes('status=progress')) {
    return { kicker: 'Oficina', title: 'OS em serviço' };
  }
  return (
    TITLES[pathname] ??
    (pathname.startsWith('/painel/os/')
      ? { kicker: 'Oficina', title: 'Ordem de serviço' }
      : { kicker: 'ERP', title: 'Operação' })
  );
}

export function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState(() => getOperatorProfile(user?.name ?? 'Operador'));
  const [entitlement, setEntitlement] = useState(() => getStoreEntitlement());
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    const current = navGroupForPath(window.location.pathname, window.location.search);
    return current ? [current] : ['os'];
  });

  useEffect(() => {
    if (!user) return;
    setProfile(getOperatorProfile(user.name));
  }, [user]);

  useEffect(() => {
    function refreshProfile() {
      setProfile(getOperatorProfile(user?.name ?? 'Operador'));
    }
    function refreshPlan() {
      setEntitlement(getStoreEntitlement());
    }
    window.addEventListener('marthi-profile-updated', refreshProfile);
    window.addEventListener('marthi-plan-updated', refreshPlan);
    return () => {
      window.removeEventListener('marthi-profile-updated', refreshProfile);
      window.removeEventListener('marthi-plan-updated', refreshPlan);
    };
  }, [user]);

  useEffect(() => {
    const current = navGroupForPath(location.pathname, location.search);
    if (current) {
      setOpenGroups((groups) => (groups.includes(current) ? groups : [...groups, current]));
    }
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  const requiredModule = moduleForPath(location.pathname);
  const moduleAllowed = !requiredModule || hasModule(requiredModule);

  const page = useMemo(
    () => resolveTitle(location.pathname, location.search),
    [location.pathname, location.search],
  );

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

  const photo = profile.photo || user.picture;
  const mark = initials(profile.displayName);

  function toggleGroup(id: string) {
    setOpenGroups((groups) =>
      groups.includes(id) ? groups.filter((item) => item !== id) : [...groups, id],
    );
  }

  return (
    <div className={`admin ${menuOpen ? 'is-menu-open' : ''}`}>
      <aside className="admin__sidebar">
        <div className="admin__brand">
          <BrandLogo variant="mark" className="admin__mark" />
          <div>
            <strong>Sua Loja</strong>
            <span>Plano {planLabel(entitlement.planId)}</span>
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
          {ADMIN_NAV.map((group) => {
            const unlocked = !group.module || hasModule(group.module);
            const opened = openGroups.includes(group.id);

            if (!group.children) {
              return (
                <NavLink
                  key={group.id}
                  to={group.to ?? '/painel'}
                  end={group.end}
                  className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
                >
                  {group.label}
                </NavLink>
              );
            }

            return (
              <div
                key={group.id}
                className={`admin__group ${opened ? 'is-open' : ''} ${unlocked ? '' : 'is-locked'}`}
              >
                <button
                  type="button"
                  className="admin__group-toggle"
                  aria-expanded={opened}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span>{group.label}</span>
                  <span className="admin__group-meta">
                    {unlocked ? null : <em>plano</em>}
                    <i aria-hidden="true">{opened ? '▾' : '▸'}</i>
                  </span>
                </button>
                {opened ? (
                  <div className="admin__sub">
                    {group.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        end={child.end}
                        className={() =>
                          `admin__sub-link ${
                            childIsActive(child, location.pathname, location.search.slice(1))
                              ? 'is-active'
                              : ''
                          }`
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="admin__sidebar-foot">
          <NavLink
            to="/painel/plano"
            className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
          >
            Plano da loja
          </NavLink>
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
          {moduleAllowed || location.pathname === '/painel/plano' ? (
            <Outlet />
          ) : requiredModule ? (
            <ModuleLockedPage moduleId={requiredModule} />
          ) : (
            <Outlet />
          )}
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
