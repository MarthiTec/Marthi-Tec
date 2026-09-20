import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { BrandLogo } from '../../components/BrandLogo';
import { useAuth } from '../../contexts/AuthContext';
import { ensureCrmSellerProfile, resolveCrmSeller } from '../../data/crmStore';
import { getTotemExitPassword } from '../../data/totemSettings';
import '../admin/admin.css';
import './crm.css';

const TITLES: Record<string, { kicker: string; title: string }> = {
  '/crm': { kicker: 'Marthi CRM', title: 'Negócios' },
  '/crm/perfil': { kicker: 'Marthi CRM', title: 'Meu perfil' },
  '/crm/rede': { kicker: 'Marthi CRM', title: 'Rede Marthi' },
};

function resolveTitle(pathname: string) {
  if (pathname.startsWith('/crm/negocio/')) {
    return { kicker: 'Marthi CRM', title: 'Detalhe do negócio' };
  }
  return TITLES[pathname] ?? { kicker: 'Marthi CRM', title: 'CRM' };
}

function isMobileNav() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
}

export function CrmLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const seller = useMemo(
    () => resolveCrmSeller(user?.name, user?.email),
    [user?.name, user?.email],
  );
  const profile = useMemo(
    () => ensureCrmSellerProfile(seller.sellerId, seller.sellerName),
    [seller.sellerId, seller.sellerName],
  );
  const [navOpen, setNavOpen] = useState(() => !isMobileNav());
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);

  const title = resolveTitle(location.pathname);

  useEffect(() => {
    if (!user) navigate('/login?next=/crm', { replace: true });
  }, [navigate, user]);

  useEffect(() => {
    if (isMobileNav()) setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
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
  }, []);

  function confirmExit(event: FormEvent) {
    event.preventDefault();
    if (exitPassword.trim() !== getTotemExitPassword()) {
      setExitError('Senha incorreta.');
      return;
    }
    navigate('/');
  }

  return (
    <div className={`crm-app ${navOpen ? 'is-nav-open' : 'is-nav-closed'}`}>
      <header className="crm-app__top">
        <button
          type="button"
          className="crm-app__menu-btn"
          aria-expanded={navOpen}
          title="Menu · Alt+M"
          onClick={() => setNavOpen((open) => !open)}
        >
          <AdminIcon name="ops" />
          <span>{navOpen ? 'Fechar' : 'Menu'}</span>
          <kbd>Alt+M</kbd>
        </button>
        <BrandLogo variant="mark" className="crm-app__mark" />
        <div className="crm-app__brand">
          <strong>Marthi CRM</strong>
          <span>
            @{profile.handle} · {profile.displayName}
          </span>
        </div>
        <button
          type="button"
          className="crm-app__exit"
          onClick={() => {
            setExitOpen(true);
            setExitPassword('');
            setExitError(null);
          }}
        >
          Sair
        </button>
      </header>

      {navOpen ? (
        <button
          type="button"
          className="crm-app__backdrop"
          aria-label="Fechar menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <div className="crm-app__shell">
        <aside className="crm-app__side" aria-hidden={!navOpen}>
          <p className="crm-app__side-label">CRM</p>
          <NavLink to="/crm" end className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            <AdminIcon name="ops" />
            Negócios
          </NavLink>
          <NavLink
            to="/crm/perfil"
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
          >
            <AdminIcon name="people" />
            Meu perfil
          </NavLink>
          <NavLink
            to="/crm/rede"
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
          >
            <AdminIcon name="people" />
            Rede Marthi
          </NavLink>
          <p className="crm-app__side-label">Painel da loja</p>
          <NavLink to="/painel" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            <AdminIcon name="home" />
            Abrir painel
          </NavLink>
          <NavLink
            to="/painel/crm"
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
          >
            <AdminIcon name="ops" />
            Visão CRM no painel
          </NavLink>
        </aside>

        <div className="crm-app__main">
          <header className="crm-app__heading">
            <div>
              <p className="admin__kicker">{title.kicker}</p>
              <h1>{title.title}</h1>
            </div>
          </header>
          <div className="crm-app__content">
            <Outlet context={seller} />
          </div>
        </div>
      </div>

      {exitOpen ? (
        <div className="crm-lock" role="dialog" aria-modal="true">
          <form className="crm-lock__card" onSubmit={confirmExit}>
            <h2 style={{ margin: 0 }}>Saída protegida</h2>
            <p className="empty" style={{ margin: 0 }}>
              Digite a senha da loja para sair do CRM.
            </p>
            {exitError ? <p className="qty-low">{exitError}</p> : null}
            <label>
              Senha
              <input
                type="password"
                value={exitPassword}
                onChange={(e) => setExitPassword(e.target.value)}
                autoFocus
              />
            </label>
            <div className="admin-toolbar">
              <button type="button" className="btn btn--ghost" onClick={() => setExitOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary">
                Sair
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
