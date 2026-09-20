import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { useAuth } from '../../contexts/AuthContext';
import { logAccess } from '../../data/auditLog';
import {
  canAccessPath,
  navPathToAccessArea,
  userCanAccessArea,
  userIsStoreAdmin,
} from '../../data/erpRegistry';
import { getOperatorProfile } from '../../data/operatorProfile';
import { getStoreEntitlement, hasModule, moduleForPath, planLabel } from '../../data/storePlan';
import { ADMIN_NAV, childIsActive, navGroupForPath } from './adminNav';
import { AccessDeniedPage } from './AccessDeniedPage';
import { ModuleLockedPage } from './ModuleLockedPage';
import './admin.css';

const SIDEBAR_KEY = 'marthi_sidebar_collapsed';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/painel': { kicker: 'ERP', title: 'Painel da operação' },
  '/painel/pdv': { kicker: 'Vendas', title: 'Fila do totem' },
  '/painel/totem': { kicker: 'Totem', title: 'Dados do totem' },
  '/painel/totem/config': { kicker: 'Totem', title: 'Configurações do totem' },
  '/painel/pedidos': { kicker: 'Vendas', title: 'Consultar vendas' },
  '/painel/clientes': { kicker: 'Pessoas', title: 'Clientes' },
  '/painel/vendedores': { kicker: 'Pessoas', title: 'Vendedores' },
  '/painel/fornecedores': { kicker: 'Pessoas', title: 'Fornecedores' },
  '/painel/funcionarios': { kicker: 'Pessoas', title: 'Funcionários' },
  '/painel/estoque': { kicker: 'Produtos', title: 'Produtos' },
  '/painel/produtos': { kicker: 'Produtos', title: 'Cadastro de produtos' },
  '/painel/notas': { kicker: 'Operações', title: 'Notas de entrada e saída' },
  '/painel/atributos': { kicker: 'Produtos', title: 'Atributos' },
  '/painel/kits': { kicker: 'Produtos', title: 'Kits' },
  '/painel/lotes': { kicker: 'Produtos', title: 'Lotes / Rastro' },
  '/painel/almoxarifado': { kicker: 'Produtos', title: 'Almoxarifado' },
  '/painel/classificacao-fiscal': { kicker: 'Produtos', title: 'Classificação fiscal' },
  '/painel/cfop': { kicker: 'Produtos', title: 'CFOP e FECP' },
  '/painel/tabelas': { kicker: 'Produtos', title: 'Tabelas de preço' },
  '/painel/pagamentos': { kicker: 'Vendas', title: 'Formas de pagamento' },
  '/painel/financeiro': { kicker: 'Operações', title: 'Financeiro' },
  '/painel/auditoria': { kicker: 'Operações', title: 'Auditoria e acessos' },
  '/painel/os': { kicker: 'Oficina', title: 'Ordens de serviço' },
  '/painel/os/nova': { kicker: 'Oficina', title: 'Nova ordem de serviço' },
  '/painel/os/agenda': { kicker: 'Oficina', title: 'Agenda da oficina' },
  '/painel/os/relatorio': { kicker: 'Oficina', title: 'Relatório da OS' },
  '/painel/permissoes': { kicker: 'Pessoas', title: 'Permissões de acesso' },
  '/painel/perfil': { kicker: 'Conta', title: 'Meu perfil' },
  '/painel/plano': { kicker: 'Contrato', title: 'Plano da loja' },
  '/painel/ajuda': { kicker: 'Suporte', title: 'Central de ajuda' },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function resolveTitle(pathname: string, search: string) {
  if (pathname === '/painel/os' && search.includes('quote=sent')) {
    return { kicker: 'Oficina', title: 'Orçamentos aguardando' };
  }
  if (pathname === '/painel/os' && search.includes('status=ready')) {
    return { kicker: 'Oficina', title: 'OS prontas' };
  }
  if (pathname === '/painel/os' && search.includes('status=progress')) {
    return { kicker: 'Oficina', title: 'OS em serviço' };
  }
  if (pathname === '/painel/os/agenda') {
    return { kicker: 'Oficina', title: 'Agenda da oficina' };
  }
  if (pathname.endsWith('/relatorio')) {
    return { kicker: 'Oficina', title: 'Relatório da OS' };
  }
  return (
    TITLES[pathname] ??
    (pathname.startsWith('/painel/os/')
      ? { kicker: 'Oficina', title: 'Ordem de serviço' }
      : { kicker: 'ERP', title: 'Operação' })
  );
}

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

export function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
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
    setOpenGroups(current ? [current] : []);
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const requiredModule = moduleForPath(location.pathname);
  const moduleAllowed = !requiredModule || hasModule(requiredModule);
  const aclAllowed = canAccessPath(location.pathname, user?.email);

  const page = useMemo(
    () => resolveTitle(location.pathname, location.search),
    [location.pathname, location.search],
  );

  useEffect(() => {
    if (!user || loading) return;
    if (moduleAllowed && !aclAllowed) {
      logAccess({
        actorName: user.name,
        actorEmail: user.email,
        action: 'denied',
        detail: location.pathname,
      });
    }
  }, [user, loading, moduleAllowed, aclAllowed, location.pathname]);

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
  const userEmail = user.email;
  const isAdmin = userIsStoreAdmin(userEmail);

  function toggleGroup(id: string) {
    if (collapsed) {
      setCollapsed(false);
      setOpenGroups([id]);
      return;
    }
    setOpenGroups((groups) => (groups.includes(id) ? [] : [id]));
  }

  function childVisible(to: string) {
    const area = navPathToAccessArea(to);
    if (!area) return true;
    return userCanAccessArea(userEmail, area);
  }

  function setSidebarCollapsed(next: boolean) {
    setCollapsed(next);
  }

  function onBurgerClick() {
    if (window.matchMedia('(max-width: 720px)').matches) {
      setMenuOpen((open) => !open);
      return;
    }
    setSidebarCollapsed(!collapsed);
  }

  return (
    <div
      className={`admin ${menuOpen ? 'is-menu-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}
    >
      <aside className="admin__sidebar">
        <div className="admin__brand">
          <BrandLogo variant="mark" className="admin__mark" />
          <div className="admin__brand-text">
            <strong>Sua Loja</strong>
            <span>
              <em className="admin__plan-chip">{planLabel(entitlement.planId)}</em>
            </span>
          </div>
          <button
            type="button"
            className="admin__burger-btn admin__burger-btn--brand"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            onClick={onBurgerClick}
          >
            <AdminIcon name={collapsed ? 'expand' : 'collapse'} />
          </button>
        </div>

        <NavLink
          to="/painel/perfil"
          className={({ isActive }) => `admin__who ${isActive ? 'is-active' : ''}`}
          title={profile.displayName}
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
            const groupActive = navGroupForPath(location.pathname, location.search) === group.id;

            if (!group.children) {
              return (
                <NavLink
                  key={group.id}
                  to={group.to ?? '/painel'}
                  end={group.end}
                  title={group.label}
                  className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
                >
                  <AdminIcon name={group.icon} />
                  <span className="admin__link-label">{group.label}</span>
                </NavLink>
              );
            }

            return (
              <div
                key={group.id}
                className={`admin__group ${opened ? 'is-open' : ''} ${
                  unlocked ? '' : 'is-locked'
                } ${groupActive ? 'is-current' : ''}`}
              >
                <button
                  type="button"
                  className={`admin__group-toggle ${groupActive ? 'is-active' : ''}`}
                  aria-expanded={opened}
                  title={collapsed ? `${group.label} · expandir menu` : group.label}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="admin__group-main">
                    <AdminIcon name={group.icon} />
                    <span className="admin__link-label">{group.label}</span>
                  </span>
                  <span className="admin__group-meta">
                    {unlocked ? null : <em>plano</em>}
                    <i aria-hidden="true">{opened ? '▾' : '▸'}</i>
                  </span>
                </button>
                {!collapsed && opened ? (
                  <div className="admin__sub">
                    {group.children
                      .filter((child) => childVisible(child.to))
                      .map((child) => (
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
          {isAdmin ? (
            <NavLink
              to="/painel/ajuda"
              title="Central de ajuda"
              className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
            >
              <AdminIcon name="help" />
              <span className="admin__link-label">Central de ajuda</span>
            </NavLink>
          ) : null}
          {isAdmin ? (
            <NavLink
              to="/painel/plano"
              title="Plano da loja"
              className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
            >
              <AdminIcon name="plan" />
              <span className="admin__link-label">Plano da loja</span>
            </NavLink>
          ) : null}
          <button type="button" className="admin__logout" onClick={logout} title="Sair">
            <AdminIcon name="logout" />
            <span className="admin__link-label">Sair</span>
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
            onClick={onBurgerClick}
          >
            <span className="admin__burger" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
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
          {!moduleAllowed && requiredModule && location.pathname !== '/painel/plano' ? (
            <ModuleLockedPage moduleId={requiredModule} />
          ) : !aclAllowed ? (
            <AccessDeniedPage pathname={location.pathname} />
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
