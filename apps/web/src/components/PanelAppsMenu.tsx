import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon, type AdminIconName } from './AdminIcons';
import { TOP_SHORTCUTS } from '../data/screenDirectory';
import './panelAppsMenu.css';

type PanelApp = { id: string; label: string; hint: string; icon: AdminIconName; to?: string; adminOnly?: boolean };

// Log-out é sempre a última opção.
const PANEL_APPS: PanelApp[] = [
  ...TOP_SHORTCUTS.map(({ id, label, hint, icon, path, adminOnly }) => ({ id, label, hint, icon, to: path, adminOnly })),
  { id: 'logout', label: 'Log-out', hint: 'Encerrar a sessão', icon: 'logout' },
];

/**
 * Atalhos gerais do painel (Painel, Usuários, Operações, Lojas, Central de ajuda, Log-out) num botão de grade
 * no topo, como nas outras telas. A barra lateral fica só com os módulos (Totem, PDV, OS…).
 */
export function PanelAppsMenu({ isAdmin, onLogout }: { isAdmin: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  useEffect(() => setOpen(false), [location.pathname]);

  const apps = PANEL_APPS.filter((app) => isAdmin || !app.adminOnly);

  return (
    <div className="panel-apps" ref={box}>
      <button
        type="button"
        className={`panel-apps__btn${open ? ' is-active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Atalhos do painel"
        title="Painel, usuários, operações, lojas, faturamento, ajuda e log-out"
        onClick={() => setOpen((current) => !current)}
      >
        <AdminIcon name="apps" />
      </button>
      {open ? (
        <div className="panel-apps__popover" role="menu">
          {apps.map((app) => {
            const current = app.to ? (app.to === '/painel' ? location.pathname === '/painel' : location.pathname.startsWith(app.to)) : false;
            return (
              <button
                key={app.id}
                type="button"
                role="menuitem"
                className={`panel-apps__item${current ? ' is-current' : ''}${app.id === 'logout' ? ' is-danger' : ''}`}
                onClick={() => {
                  setOpen(false);
                  if (app.to) navigate(app.to);
                  else onLogout();
                }}
              >
                <span className="panel-apps__icon">
                  <AdminIcon name={app.icon} />
                </span>
                <strong>{app.label}</strong>
                <small>{app.hint}</small>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
