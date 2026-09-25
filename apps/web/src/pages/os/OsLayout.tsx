import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { ExitOrLogoutDialog } from '../../components/ExitOrLogoutDialog';
import { ModuleMenuButton } from '../../components/ModuleMenuButton';
import { ModuleSideFoot } from '../../components/ModuleSideFoot';
import { ScreenBackButton } from '../../components/ScreenBackButton';
import { UserChip } from '../../components/UserChip';
import { useAuth } from '../../contexts/AuthContext';
import { hasDemoAccess } from '../../data/demoLeadStore';
import { usePresenceSession } from '../../hooks/usePresence';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import { AdminPicker } from '../../components/AdminPicker';
import { OsHotkeysBar, OsPanelHost, type OsPanel } from './OsPanels';
import { OsEcosystemMenu } from './OsEcosystemMenu';
import { getActiveOperation, listOperations } from '../../data/osStore';
import '../admin/admin.css';
import './os.css';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/os': { kicker: 'Oficina', title: 'Quadro da oficina' },
  '/os/perfil': { kicker: 'Oficina', title: 'Meu perfil' },
  '/os/conta': { kicker: 'Oficina', title: 'Meu perfil' },
  '/os/nova': { kicker: 'Oficina', title: 'Nova ordem de serviço' },
  '/os/agenda': { kicker: 'Oficina', title: 'Agenda da oficina' },
};

function resolveTitle(pathname: string, search: string) {
  if (pathname === '/os' && search.includes('quote=sent')) {
    return { kicker: 'Oficina', title: 'Orçamentos aguardando' };
  }
  if (pathname === '/os' && search.includes('status=ready')) {
    return { kicker: 'Oficina', title: 'OS prontas' };
  }
  if (pathname === '/os' && search.includes('status=progress')) {
    return { kicker: 'Oficina', title: 'OS em serviço' };
  }
  if (pathname.endsWith('/relatorio')) {
    return { kicker: 'Oficina', title: 'Relatório da OS' };
  }
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith('/os/')) {
    return { kicker: 'Oficina', title: 'Ordem de serviço' };
  }
  return { kicker: 'Oficina', title: 'Ordens de serviço' };
}

export function OsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  usePresenceSession('os');
  const { isDark } = usePanelTheme();
  const [exitOpen, setExitOpen] = useState(false);
  const [opsMenuOpen, setOpsMenuOpen] = useState(false);
  const [panel, setPanel] = useState<OsPanel>(null);
  const openPanelRef = useRef<(next: Exclude<OsPanel, null>) => void>(() => undefined);

  const operations = listOperations();
  const activeOp = getActiveOperation();
  const currentOpId = params.get('op') || activeOp.id;

  const title = resolveTitle(location.pathname, location.search);
  const isBoard = location.pathname === '/os';
  const isProfile =
    location.pathname === '/os/perfil' || location.pathname === '/os/conta';

  useEffect(() => {
    if (isProfile) setOpsMenuOpen(true);
  }, [isProfile]);

  useEffect(() => {
    if (!hasDemoAccess('os') && !user) {
      navigate('/', { replace: true });
    }
  }, [navigate, user]);

  function openPanel(next: Exclude<OsPanel, null>) {
    setOpsMenuOpen(false);
    setPanel(next);
  }

  openPanelRef.current = openPanel;

  function go(path: string) {
    setOpsMenuOpen(false);
    setPanel(null);
    navigate(path);
  }

  function handlePeriodChange(newOpId: string) {
    const next = new URLSearchParams(params);
    if (newOpId === 'all') {
      next.set('op', 'all');
    } else {
      next.set('op', newOpId);
    }
    setParams(next);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (event.key === 'Escape') {
        if (exitOpen) {
          event.preventDefault();
          setExitOpen(false);
          return;
        }
        if (panel) {
          event.preventDefault();
          setPanel(null);
          return;
        }
        if (opsMenuOpen) {
          event.preventDefault();
          setOpsMenuOpen(false);
          return;
        }
      }

      if (event.key === 'F2') {
        event.preventDefault();
        if (location.pathname === '/os') {
          window.dispatchEvent(new CustomEvent('os:open-new-modal'));
        } else {
          navigate('/os?new=1');
        }
        return;
      }
      if (event.key === 'F6') {
        event.preventDefault();
        go('/os/agenda');
        return;
      }
      if (event.key === 'F7' || event.key === 'F8') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('os:focus-search'));
        return;
      }
      if (event.key === 'F9') {
        event.preventDefault();
        go('/os?status=progress');
        return;
      }
      if (event.key === 'F11') {
        event.preventDefault();
        go('/os?status=ready');
        return;
      }
      if (event.key === 'F12') {
        event.preventDefault();
        go('/os');
        return;
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (key === 'm') {
          event.preventDefault();
          setOpsMenuOpen((open) => !open);
          return;
        }
        if (key === 'c' || key === 'r') {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent('os:focus-search'));
          return;
        }
        if (key === 'n') {
          event.preventDefault();
          if (location.pathname === '/os') {
            window.dispatchEvent(new CustomEvent('os:open-new-modal'));
          } else {
            navigate('/os?new=1');
          }
          return;
        }
        if (key === 'q') {
          event.preventDefault();
          go('/os?quote=sent');
          return;
        }
      }

      if (typing) return;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitOpen, opsMenuOpen, panel, navigate]);

  function requestExit() {
    setExitOpen(true);
  }

  return (
    <div
      className={`os-app ${opsMenuOpen ? 'is-ops-open' : ''} ${isProfile ? 'is-profile-dock' : ''} ${
        isDark ? 'is-theme-dark' : ''
      }`}
    >
      <header className="os-app__top">
        <ModuleMenuButton open={opsMenuOpen} onClick={() => setOpsMenuOpen((open) => !open)} />
        {/* Botão de ícone para acesso ao Ecossistema Marthi imediatamente ao lado do Menu */}
        <OsEcosystemMenu />

        <BrandLogo variant="mark" className="os-app__mark" />
        <div className="os-app__brand">
          <strong>Marthi OS</strong>
        </div>

        {/* Filtro centralizado ao topo usando o combobox padrão do sistema AdminPicker */}
        <div className="os-app__period-picker-wrap">
          <span className="os-app__period-icon" aria-hidden="true">📅</span>
          <AdminPicker
            compact
            aria-label="Filtrar por período / operação da oficina"
            value={currentOpId}
            options={[
              ...operations.map((op) => ({
                value: op.id,
                label: `${op.title} ${op.status === 'active' ? '(Tarefas Ativas)' : '(Concluída)'}`,
              })),
              { value: 'all', label: 'Todas as Operações (Histórico Total)' },
            ]}
            onChange={(val) => handlePeriodChange(val)}
            className="os-app__period-picker"
          />
        </div>

        <button type="button" className="os-app__exit" onClick={requestExit}>
          Sair
        </button>
      </header>

      {opsMenuOpen && !isProfile ? (
        <button
          type="button"
          className="os-app__ops-backdrop"
          aria-label="Fechar operações"
          onClick={() => setOpsMenuOpen(false)}
        />
      ) : null}

      <div className="os-app__workspace">
        <aside
          className={`os-app__ops-drawer ${opsMenuOpen || isProfile ? 'is-open' : ''}`}
          aria-hidden={!opsMenuOpen && !isProfile}
        >
          <div className="os-app__ops-head">
            <strong>Operações</strong>
            <button
              type="button"
              className="os-app__ops-close"
              title="Quadro da oficina"
              aria-label="Ir para o quadro da oficina"
              onClick={() => {
                setOpsMenuOpen(false);
                navigate('/os');
              }}
            >
              <AdminIcon name="home" />
            </button>
          </div>
          <UserChip to="/os/perfil" />
          <nav className="os-app__ops-nav" aria-label="Operações da oficina">
            <button type="button" className="os-app__ops-central" onClick={() => go('/os')}>
              <AdminIcon name="home" />
              <span>Central</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpsMenuOpen(false);
                if (location.pathname === '/os') {
                  window.dispatchEvent(new CustomEvent('os:open-new-modal'));
                } else {
                  navigate('/os?new=1');
                }
              }}
            >
              <kbd>F2</kbd>
              <span>Nova OS</span>
            </button>
            <button type="button" onClick={() => go('/os/agenda')}>
              <kbd>F6</kbd>
              <span>Agenda</span>
            </button>
            <button type="button" onClick={() => go('/os?quote=sent')}>
              <kbd>Alt+Q</kbd>
              <span>Orçamentos</span>
            </button>
            <button type="button" onClick={() => go('/os?status=progress')}>
              <kbd>F9</kbd>
              <span>Em serviço</span>
            </button>
            <button type="button" onClick={() => go('/os?status=ready')}>
              <kbd>F11</kbd>
              <span>Prontas</span>
            </button>
            <button type="button" onClick={() => go('/os')}>
              <kbd>F12</kbd>
              <span>Quadro da oficina</span>
            </button>
          </nav>
          <ModuleSideFoot />
        </aside>

        <div className="os-app__body">
          <header className="os-app__heading">
            <div>
              <ScreenBackButton home="/os" />
              <p className="admin__kicker">{title.kicker}</p>
              <h1>{title.title}</h1>
            </div>
            {isBoard ? (
              <OsHotkeysBar
                onNewOrder={() => window.dispatchEvent(new CustomEvent('os:open-new-modal'))}
              />
            ) : null}
          </header>
          <div className="os-app__content">
            <Outlet />
          </div>
        </div>
      </div>

      {panel ? (
        <OsPanelHost
          panel={panel}
          onClose={() => setPanel(null)}
          onOpenOrder={(id) => navigate(`/os/${id}`)}
          onReprint={(id) => navigate(`/os/${id}/relatorio`)}
        />
      ) : null}

      <ExitOrLogoutDialog
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        appName="oficina"
        exitActionLabel="Sair da oficina"
      />
    </div>
  );
}
