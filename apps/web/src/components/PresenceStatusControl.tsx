import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMyPresence } from '../hooks/usePresence';
import {
  PRESENCE_AWAY_OPTIONS,
  presenceDetailLabel,
  presenceStatusLabel,
  type PresenceAwayReason,
} from '../data/presenceStore';
import './presenceControls.css';

type PresenceStatusControlProps = {
  compact?: boolean;
  className?: string;
};

type MenuPos = { top: number; left: number };

/** Seletor de disponibilidade — ativo ou ausente (almoço, reunião…). */
export function PresenceStatusControl({ compact = false, className = '' }: PresenceStatusControlProps) {
  const { mine, setActive, setAway } = useMyPresence();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    function place() {
      const trigger = rootRef.current?.querySelector('.presence-ctl__trigger');
      if (!(trigger instanceof HTMLElement)) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 248;
      const gap = 8;
      const spaceRight = window.innerWidth - rect.right;
      const openRight = spaceRight >= menuWidth + gap;
      const left = openRight
        ? Math.min(rect.right + gap, window.innerWidth - menuWidth - 8)
        : Math.max(8, rect.left);
      const top = Math.min(rect.top, window.innerHeight - 320);
      setMenuPos({ top: Math.max(8, top), left });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isAway = mine?.availability === 'away' && mine.module !== 'offline';
  const label = mine ? presenceStatusLabel(mine) : 'Ativo';
  const detail = mine ? presenceDetailLabel(mine) : 'Disponível';

  function pickActive() {
    setActive();
    setOpen(false);
  }

  function pickAway(reason: PresenceAwayReason) {
    setAway(reason);
    setOpen(false);
  }

  const host = rootRef.current;
  const inLightHost = Boolean(host?.closest('.op-profile, .admin-page'));
  const inDarkTheme = Boolean(host?.closest('.is-theme-dark, .admin--dark'));
  const lightSurface = inLightHost && !inDarkTheme;

  const menu =
    open && menuPos ? (
      <div
        ref={menuRef}
        id={menuId}
        className={`presence-ctl__menu presence-ctl__menu--portal${lightSurface ? ' presence-ctl__menu--light' : ''}`}
        role="menu"
        style={{ top: menuPos.top, left: menuPos.left }}
      >
        <p className="presence-ctl__menu-label">Seu status na equipe</p>
        <button type="button" role="menuitem" className={!isAway ? 'is-current' : ''} onClick={pickActive}>
          <span className="presence-ctl__dot is-online" aria-hidden />
          Ativo / disponível
        </button>
        <p className="presence-ctl__menu-label">Ausente</p>
        {PRESENCE_AWAY_OPTIONS.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="menuitem"
            className={isAway && mine?.awayReason === option.value ? 'is-current' : ''}
            onClick={() => pickAway(option.value)}
          >
            <span className="presence-ctl__dot is-away" aria-hidden />
            {option.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={`presence-ctl ${compact ? 'presence-ctl--compact' : ''} ${isAway ? 'is-away' : 'is-active'} ${open ? 'is-open' : ''} ${className}`}
    >
      <button
        type="button"
        className="presence-ctl__trigger"
        aria-expanded={open}
        aria-controls={menuId}
        title={`${label} — ${detail}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="presence-ctl__dot" aria-hidden />
        {!compact ? (
          <span className="presence-ctl__copy">
            <strong>{label}</strong>
            <em>{detail}</em>
          </span>
        ) : (
          <span className="presence-ctl__short">{label}</span>
        )}
      </button>

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
