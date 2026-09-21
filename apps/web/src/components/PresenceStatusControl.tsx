import { useEffect, useId, useRef, useState } from 'react';
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

/** Seletor de disponibilidade — ativo ou ausente (almoço, reunião…). */
export function PresenceStatusControl({ compact = false, className = '' }: PresenceStatusControlProps) {
  const { mine, setActive, setAway } = useMyPresence();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  return (
    <div
      ref={rootRef}
      className={`presence-ctl ${compact ? 'presence-ctl--compact' : ''} ${isAway ? 'is-away' : 'is-active'} ${className}`}
    >
      <button
        type="button"
        className="presence-ctl__trigger"
        aria-expanded={open}
        aria-controls={menuId}
        title={detail}
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

      {open ? (
        <div id={menuId} className="presence-ctl__menu" role="menu">
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
      ) : null}
    </div>
  );
}
