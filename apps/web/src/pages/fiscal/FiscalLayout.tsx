import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { UserChip } from '../../components/UserChip';
import { useAuth } from '../../contexts/AuthContext';
import { hasDemoAccess } from '../../data/demoLeadStore';
import { hasModule } from '../../data/storePlan';
import { getTotemExitPassword } from '../../data/totemSettings';
import { usePresenceSession } from '../../hooks/usePresence';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import '../admin/admin.css';
import './fiscal.css';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/fiscal': { kicker: 'Emissor Fiscal', title: 'Central de emissão' },
  '/fiscal/perfil': { kicker: 'Emissor Fiscal', title: 'Meu perfil' },
  '/fiscal/conta': { kicker: 'Emissor Fiscal', title: 'Meu perfil' },
  '/fiscal/nfe': { kicker: 'Emissor Fiscal', title: 'NF-e — entrada e saída' },
  '/fiscal/nfse': { kicker: 'Emissor Fiscal', title: 'NFS-e — Portal Nacional' },
  '/fiscal/cte': { kicker: 'Emissor Fiscal', title: 'CT-e — conhecimento de transporte' },
  '/fiscal/mdfe': { kicker: 'Emissor Fiscal', title: 'MDF-e — manifesto eletrônico' },
  '/fiscal/config': { kicker: 'Emissor Fiscal', title: 'Configuração fiscal' },
  '/fiscal/cst': { kicker: 'Emissor Fiscal', title: 'CST e cClassTrib' },
};

const NAV_EMIT = [
  { to: '/fiscal/nfe', label: 'NF-e', end: false },
  { to: '/fiscal/nfse', label: 'NFS-e', end: false },
  { to: '/fiscal/cte', label: 'CT-e', end: false },
  { to: '/fiscal/mdfe', label: 'MDF-e', end: false },
] as const;

const NAV_SETUP = [
  { to: '/fiscal/config', label: 'Configuração', end: false },
  { to: '/fiscal/cst', label: 'CST / cClassTrib', end: false },
] as const;

function isMobileNav() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
}

export function FiscalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  usePresenceSession('fiscal');
  const { isDark } = usePanelTheme();
  const [navOpen, setNavOpen] = useState(() => !isMobileNav());
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);

  const title = TITLES[location.pathname] ?? {
    kicker: 'Emissor Fiscal',
    title: 'Documentos fiscais',
  };

  useEffect(() => {
    const allowed = hasModule('fiscal') || hasDemoAccess('erp') || Boolean(user);
    if (!allowed && !user) {
      navigate('/', { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    if (isMobileNav()) setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && navOpen && isMobileNav()) {
        setNavOpen(false);
      }
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
  }, [navOpen]);

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
    <div className={`fiscal-app ${navOpen ? 'is-nav-open' : 'is-nav-closed'} ${isDark ? 'is-theme-dark' : ''}`}>
      <header className="fiscal-app__top">
        <button
          type="button"
          className="fiscal-app__menu-btn"
          aria-label={navOpen ? 'Fechar menu do emissor' : 'Abrir menu do emissor'}
          aria-expanded={navOpen}
          title="Menu · Alt+M"
          onClick={() => setNavOpen((open) => !open)}
        >
          <AdminIcon name="ops" />
          <span>{navOpen ? 'Fechar' : 'Menu'}</span>
          <kbd>Alt+M</kbd>
        </button>
        <BrandLogo variant="mark" className="fiscal-app__mark" />
        <div className="fiscal-app__brand">
          <strong>Marthi Emissor Fiscal</strong>
        </div>
        <button type="button" className="fiscal-app__exit" onClick={requestExit}>
          Sair
        </button>
      </header>

      {navOpen ? (
        <button
          type="button"
          className="fiscal-app__backdrop"
          aria-label="Fechar menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <div className="fiscal-app__shell">
        <aside
          className="fiscal-app__side"
          aria-label="Menu do emissor fiscal"
          aria-hidden={!navOpen}
        >
          <div className="fiscal-app__side-head">
            <strong>Navegação</strong>
            <button
              type="button"
              className="fiscal-app__side-close"
              title="Central do emissor"
              aria-label="Ir para a central do emissor"
              onClick={() => {
                setNavOpen(false);
                navigate('/fiscal');
              }}
            >
              <AdminIcon name="home" />
            </button>
          </div>

          <UserChip
            to="/fiscal/perfil"
            onOpen={() => {
              if (isMobileNav()) setNavOpen(false);
            }}
          />

          <NavLink
            to="/fiscal/perfil"
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            onClick={() => {
              if (isMobileNav()) setNavOpen(false);
            }}
          >
            <AdminIcon name="people" />
            Meu perfil
          </NavLink>

          <NavLink
            to="/fiscal"
            end
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            onClick={() => {
              if (isMobileNav()) setNavOpen(false);
            }}
          >
            <AdminIcon name="home" />
            Central
          </NavLink>

          <p className="fiscal-app__side-label">Emissão</p>
          {NAV_EMIT.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              <AdminIcon name="fiscal" />
              {item.label}
            </NavLink>
          ))}

          <p className="fiscal-app__side-label">Cadastros</p>
          {NAV_SETUP.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              <AdminIcon name="ops" />
              {item.label}
            </NavLink>
          ))}

          <p className="fiscal-app__side-note">
            NFC-e (cupom) fica no PDV / Caixa — não é emitida por aqui.{' '}
            <NavLink to="/caixa">Abrir caixa</NavLink>
          </p>
        </aside>

        <div className="fiscal-app__main">
          <header className="fiscal-app__heading">
            <div>
              <p className="admin__kicker">{title.kicker}</p>
              <h1>{title.title}</h1>
            </div>
          </header>
          <div className="fiscal-app__content">
            <Outlet />
          </div>
        </div>
      </div>

      {exitOpen ? (
        <div
          className="fiscal-lock"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fiscal-exit-title"
        >
          <form className="fiscal-lock__card" onSubmit={confirmExit}>
            <h2 id="fiscal-exit-title">Saída protegida</h2>
            <p>Digite a senha da loja para sair do emissor. O operador não acessa o painel por aqui.</p>
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
            <div className="fiscal-lock__actions">
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
                Sair do emissor
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
