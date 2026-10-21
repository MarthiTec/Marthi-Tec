import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon, type AdminIconName } from './AdminIcons';
import './panelAppsMenu.css';

export type AppsGridItem = {
  id: string;
  label: string;
  hint: string;
  icon: AdminIconName;
  to?: string;
  adminOnly?: boolean;
  /** Extra paths that mark this tile as current (ex.: dual /erp ↔ /painel). */
  also?: string[];
  danger?: boolean;
};

function pathMatches(candidate: string, pathname: string) {
  if (candidate === '/painel' || candidate === '/erp') return pathname === candidate;
  return pathname === candidate || pathname.startsWith(`${candidate}/`) || pathname.startsWith(`${candidate}?`);
}

/** Dual shell: `/painel/foo` ↔ `/erp/foo` when both exist. */
function dualPath(path: string): string | null {
  if (path.startsWith('/painel/')) return `/erp/${path.slice('/painel/'.length)}`;
  if (path.startsWith('/erp/')) return `/painel/${path.slice('/erp/'.length)}`;
  return null;
}

function isCurrentItem(item: AppsGridItem, pathname: string) {
  if (!item.to) return false;
  if (pathMatches(item.to, pathname)) return true;
  const dual = dualPath(item.to);
  if (dual && pathMatches(dual, pathname)) return true;
  return item.also?.some((path) => pathMatches(path, pathname)) ?? false;
}

/**
 * Grade de atalhos (3×3 dots → popover com ícone + título + descrição).
 * Usado no Painel (`PanelAppsMenu`) e na Retaguarda (`ErpAppsMenu`).
 */
export function AppsGridMenu({
  items,
  ariaLabel,
  title,
  isAdmin = true,
  onLogout,
}: {
  items: AppsGridItem[];
  ariaLabel: string;
  title?: string;
  isAdmin?: boolean;
  onLogout?: () => void;
}) {
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

  const apps = items.filter((app) => isAdmin || !app.adminOnly);

  return (
    <div className="panel-apps" ref={box}>
      <button
        type="button"
        className={`panel-apps__btn${open ? ' is-active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        <AdminIcon name="apps" />
      </button>
      {open ? (
        <div className="panel-apps__popover" role="menu">
          {apps.map((app) => {
            const current = isCurrentItem(app, location.pathname);
            return (
              <button
                key={app.id}
                type="button"
                role="menuitem"
                className={`panel-apps__item${current ? ' is-current' : ''}${app.danger ? ' is-danger' : ''}`}
                onClick={() => {
                  setOpen(false);
                  if (app.to) navigate(app.to);
                  else onLogout?.();
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
