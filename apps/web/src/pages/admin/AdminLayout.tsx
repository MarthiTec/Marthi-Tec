import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { UserChip } from '../../components/UserChip';
import { useAuth } from '../../contexts/AuthContext';
import { logAccess } from '../../data/auditLog';
import {
  canAccessPath,
  navPathToAccessArea,
  userCanAccessArea,
  userIsStoreAdmin,
} from '../../data/erpRegistry';
import { getStoreEntitlement, hasModule, moduleForPath, planLabel } from '../../data/storePlan';
import { usePresenceSession } from '../../hooks/usePresence';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import { ADMIN_NAV, childIsActive, navGroupForPath } from './adminNav';
import { AccessDeniedPage } from './AccessDeniedPage';
import { ModuleLockedPage } from './ModuleLockedPage';
import './admin.css';

const SIDEBAR_KEY = 'marthi_sidebar_collapsed';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/painel': { kicker: 'ERP', title: 'Painel da operação' },
  '/painel/operacoes': { kicker: 'Operações', title: 'Equipe na loja' },
  '/painel/pdv': { kicker: 'Vendas', title: 'Fila do totem' },
  '/painel/totem': { kicker: 'Totem', title: 'Dados do totem' },
  '/painel/totem/produtos': { kicker: 'Totem', title: 'Catálogo do totem' },
  '/painel/totem/atributos': { kicker: 'Totem', title: 'Atributos do totem' },
  '/painel/totem/config': { kicker: 'Totem', title: 'Configurações do totem' },
  '/painel/pedidos': { kicker: 'Vendas', title: 'Consultar vendas' },
  '/painel/clientes': { kicker: 'Pessoas', title: 'Clientes' },
  '/painel/vendedores': { kicker: 'Pessoas', title: 'Vendedores' },
  '/painel/fornecedores': { kicker: 'Pessoas', title: 'Fornecedores' },
  '/painel/funcionarios': { kicker: 'Pessoas', title: 'Funcionários' },
  '/painel/estoque': { kicker: 'Produtos', title: 'Produtos' },
  '/painel/produtos': { kicker: 'Produtos', title: 'Cadastro de produtos' },
  '/painel/ecommerce': { kicker: 'E-commerce', title: 'Visão da loja online' },
  '/painel/fiscal': { kicker: 'Emissor Fiscal', title: 'Visão fiscal' },
  '/painel/erp': { kicker: 'ERP', title: 'Visão e ajustes do ERP' },
  '/painel/notas': { kicker: 'Emissor Fiscal', title: 'Notas de entrada e saída' },
  '/painel/fiscal/config': { kicker: 'Emissor Fiscal', title: 'Configuração fiscal' },
  '/painel/fiscal/cst': { kicker: 'Emissor Fiscal', title: 'CST e cClassTrib' },
  '/painel/atributos': { kicker: 'Produtos', title: 'Atributos' },
  '/painel/kits': { kicker: 'Produtos', title: 'Kits' },
  '/painel/lotes': { kicker: 'Produtos', title: 'Lotes / Rastro' },
  '/painel/almoxarifado': { kicker: 'Produtos', title: 'Almoxarifado' },
  '/painel/classificacao-fiscal': { kicker: 'Produtos', title: 'Classificação fiscal' },
  '/painel/cfop': { kicker: 'Produtos', title: 'CFOP e FECP' },
  '/painel/tabelas': { kicker: 'Produtos', title: 'Tabelas de preço' },
  '/painel/pagamentos': { kicker: 'Vendas', title: 'Formas de pagamento' },
  '/painel/financeiro': { kicker: 'ERP', title: 'Financeiro' },
  '/painel/auditoria': { kicker: 'ERP', title: 'Auditoria e acessos' },
  '/painel/os': { kicker: 'Oficina', title: 'Ordens de serviço' },
  '/painel/os/agenda': { kicker: 'Oficina', title: 'Agenda da oficina' },
  '/painel/os/relatorio': { kicker: 'Oficina', title: 'Relatório da OS' },
  '/painel/permissoes': { kicker: 'Pessoas', title: 'Permissões de acesso' },
  '/painel/perfil': { kicker: 'Conta', title: 'Meu perfil' },
  '/painel/crm': { kicker: 'CRM', title: 'Visão do CRM' },
  '/painel/plano': { kicker: 'Contrato', title: 'Plano da loja' },
  '/painel/ajuda': { kicker: 'Suporte', title: 'Central de ajuda' },
};

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
  usePresenceSession('painel');
  const { isDark } = usePanelTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [entitlement, setEntitlement] = useState(() => getStoreEntitlement());
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    const current = navGroupForPath(window.location.pathname, window.location.search);
    return current ? [current] : ['os'];
  });

  useEffect(() => {
    function refreshPlan() {
      setEntitlement(getStoreEntitlement());
    }
    window.addEventListener('marthi-plan-updated', refreshPlan);
    return () => window.removeEventListener('marthi-plan-updated', refreshPlan);
  }, []);

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
      className={`admin ${menuOpen ? 'is-menu-open' : ''} ${collapsed ? 'is-collapsed' : ''} ${
        isDark ? 'admin--dark is-theme-dark' : ''
      }`}
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

        <UserChip variant="sidebar" to="/painel/perfil" />

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
                            `admin__sub-link ${child.openApp ? 'admin__sub-link--open-app' : ''} ${
                              childIsActive(child, location.pathname, location.search.slice(1))
                                ? 'is-active'
                                : ''
                            }`
                          }
                          style={
                            child.openApp && child.accent
                              ? ({ '--open-app-accent': child.accent } as CSSProperties)
                              : undefined
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
            to="/painel/operacoes"
            title="Operações"
            className={({ isActive }) =>
              `admin__link admin__link--foot-accent ${isActive ? 'is-active' : ''}`
            }
          >
            <AdminIcon name="ops" />
            <span className="admin__link-label">Operações</span>
          </NavLink>
          {isAdmin ? (
            <NavLink
              to="/painel/ajuda"
              title="Central de ajuda"
              className={({ isActive }) =>
                `admin__link admin__link--foot-accent ${isActive ? 'is-active' : ''}`
              }
            >
              <AdminIcon name="help" />
              <span className="admin__link-label">Central de ajuda</span>
            </NavLink>
          ) : null}
          {isAdmin ? (
            <NavLink
              to="/painel/plano"
              title="Plano da loja"
              className={({ isActive }) =>
                `admin__link admin__link--foot-accent ${isActive ? 'is-active' : ''}`
              }
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
