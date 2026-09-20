import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { useAuth } from '../../contexts/AuthContext';
import { hasDemoAccess } from '../../data/demoLeadStore';
import { getOperatorProfile } from '../../data/operatorProfile';
import { getTotemExitPassword } from '../../data/totemSettings';
import { OsHotkeysBar, OsPanelHost, type OsPanel } from './OsPanels';
import '../admin/admin.css';
import './os.css';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/os': { kicker: 'Oficina', title: 'Quadro da oficina' },
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
  const { user } = useAuth();
  const profile = useMemo(() => getOperatorProfile(user?.name ?? 'Operador'), [user?.name]);
  const operatorName = user?.name ?? profile.displayName;
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);
  const [opsMenuOpen, setOpsMenuOpen] = useState(false);
  const [panel, setPanel] = useState<OsPanel>(null);
  const openPanelRef = useRef<(next: Exclude<OsPanel, null>) => void>(() => undefined);

  const title = resolveTitle(location.pathname, location.search);
  const isBoard = location.pathname === '/os';

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
          setExitPassword('');
          setExitError(null);
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
        go('/os/nova');
        return;
      }
      if (event.key === 'F6') {
        event.preventDefault();
        go('/os/agenda');
        return;
      }
      if (event.key === 'F7') {
        event.preventDefault();
        openPanelRef.current('consult');
        return;
      }
      if (event.key === 'F8') {
        event.preventDefault();
        openPanelRef.current('reprint');
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
        if (key === 'o') {
          event.preventDefault();
          setOpsMenuOpen((open) => !open);
          return;
        }
        if (key === 'c') {
          event.preventDefault();
          openPanelRef.current('consult');
          return;
        }
        if (key === 'n') {
          event.preventDefault();
          go('/os/nova');
          return;
        }
        if (key === 'q') {
          event.preventDefault();
          go('/os?quote=sent');
          return;
        }
        if (key === 'r') {
          event.preventDefault();
          openPanelRef.current('reprint');
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
    <div className={`os-app ${opsMenuOpen ? 'is-ops-open' : ''}`}>
      <header className="os-app__top">
        <button
          type="button"
          className="os-app__ops-btn"
          aria-label="Operações da oficina · Alt+O"
          aria-expanded={opsMenuOpen}
          title="Operações · Alt+O"
          onClick={() => setOpsMenuOpen((open) => !open)}
        >
          <AdminIcon name="ops" />
          <kbd>Alt+O</kbd>
        </button>
        <BrandLogo variant="mark" className="os-app__mark" />
        <div className="os-app__brand">
          <strong>Marthi OS</strong>
          <span>{operatorName}</span>
        </div>
        <button type="button" className="os-app__exit" onClick={requestExit}>
          Sair
        </button>
      </header>

      {opsMenuOpen ? (
        <button
          type="button"
          className="os-app__ops-backdrop"
          aria-label="Fechar operações"
          onClick={() => setOpsMenuOpen(false)}
        />
      ) : null}

      <aside className={`os-app__ops-drawer ${opsMenuOpen ? 'is-open' : ''}`} aria-hidden={!opsMenuOpen}>
        <div className="os-app__ops-head">
          <strong>Operações</strong>
          <button type="button" className="os-app__ops-close" onClick={() => setOpsMenuOpen(false)}>
            Fechar
          </button>
        </div>
        <nav className="os-app__ops-nav" aria-label="Operações da oficina">
          <button type="button" onClick={() => go('/os/nova')}>
            <kbd>F2</kbd>
            <span>Nova OS</span>
          </button>
          <button type="button" onClick={() => openPanel('consult')}>
            <kbd>F7</kbd>
            <span>Consultar OS</span>
          </button>
          <button type="button" onClick={() => openPanel('reprint')}>
            <kbd>F8</kbd>
            <span>Reimprimir OS</span>
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
      </aside>

      <div className="os-app__body">
        <header className="os-app__heading">
          <div>
            <p className="admin__kicker">{title.kicker}</p>
            <h1>{title.title}</h1>
          </div>
          {isBoard ? (
            <OsHotkeysBar
              onConsult={() => openPanel('consult')}
              onReprint={() => openPanel('reprint')}
            />
          ) : null}
        </header>
        <div className="os-app__content">
          <Outlet />
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

      {exitOpen ? (
        <div className="os-lock" role="dialog" aria-modal="true" aria-labelledby="os-exit-title">
          <form className="os-lock__card" onSubmit={confirmExit}>
            <h2 id="os-exit-title">Saída protegida</h2>
            <p>Digite a senha da loja para sair da oficina. O operador não acessa o painel por aqui.</p>
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
            <div className="os-lock__actions">
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
                Sair da oficina
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
