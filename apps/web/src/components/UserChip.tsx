import { NavLink } from 'react-router-dom';
import { PresenceStatusControl } from './PresenceStatusControl';
import { useOperatorProfile } from '../hooks/useOperatorProfile';
import { useMyPresence } from '../hooks/usePresence';
import { profileInitials } from '../data/operatorProfile';
import './userChip.css';

type UserChipProps = {
  /** Destino no ambiente do módulo atual (ex.: /crm/conta, /erp/conta). */
  to?: string;
  /** Alternativa a `to` — abre perfil em overlay (PDV / OS). */
  onOpen?: () => void;
  /** sidebar = menu lateral (padrão do sistema); topbar = raro */
  variant?: 'sidebar' | 'topbar';
  compact?: boolean;
  className?: string;
  title?: string;
  /** Mostra seletor de status logo abaixo do chip (padrão: true no sidebar). */
  showPresence?: boolean;
};

/**
 * Referência visual do usuário em todo o sistema — fica no painel lateral.
 * Clique abre o perfil dentro do próprio módulo.
 */
export function UserChip({
  to,
  onOpen,
  variant = 'sidebar',
  compact = false,
  className = '',
  title = 'Configurar meu perfil',
  showPresence = variant === 'sidebar',
}: UserChipProps) {
  const { profile, photo } = useOperatorProfile();
  const { mine } = useMyPresence();
  const mark = profileInitials(profile.displayName);
  const away = mine?.availability === 'away' && mine.module !== 'offline';

  const classNames = ({ isActive = false }: { isActive?: boolean } = {}) =>
    [
      'user-chip',
      `user-chip--${variant}`,
      compact ? 'user-chip--compact' : '',
      isActive ? 'is-active' : '',
      away ? 'is-away' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

  const body = (
    <>
      <span className="user-chip__photo" aria-hidden>
        {photo ? <img src={photo} alt="" /> : <span>{mark}</span>}
        <i className={`user-chip__presence ${away ? 'is-away' : 'is-on'}`} />
      </span>
      {!compact ? (
        <span className="user-chip__text">
          <em>Olá</em>
          <strong>{profile.displayName}</strong>
          <small>{profile.role}</small>
        </span>
      ) : null}
    </>
  );

  const chip =
    to ? (
      <NavLink
        to={to}
        className={({ isActive }) => classNames({ isActive })}
        title={title}
        aria-label={title}
        onClick={onOpen}
      >
        {body}
      </NavLink>
    ) : (
      <button
        type="button"
        className={classNames()}
        title={title}
        aria-label={title}
        onClick={onOpen}
      >
        {body}
      </button>
    );

  if (!showPresence || compact) return chip;

  return (
    <div className="user-chip-stack">
      {chip}
      <PresenceStatusControl compact />
    </div>
  );
}
