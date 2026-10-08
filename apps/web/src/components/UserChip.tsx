import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PresenceStatusControl } from './PresenceStatusControl';
import { useOperatorProfile } from '../hooks/useOperatorProfile';
import { useMyPresence } from '../hooks/usePresence';
import { profileInitials } from '../data/operatorProfile';
import {
  getClientAccount,
  getActiveStore,
  MULTI_STORE_CHANGED_EVENT,
  STORE_CONTEXT_CHANGED_EVENT,
} from '../data/multiStoreStore';
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
  // getClientAccount()/getActiveStore() leem o cache local de loja/empresa, que só fica
  // correto depois que a hidratação com a API termina (assíncrona, após o login). Sem essa
  // assinatura, o cartão congela no primeiro valor lido e nunca reflete a loja real.
  const [, forceRefresh] = useState(0);
  useEffect(() => {
    const onChange = () => forceRefresh((n) => n + 1);
    window.addEventListener(MULTI_STORE_CHANGED_EVENT, onChange);
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(MULTI_STORE_CHANGED_EVENT, onChange);
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, onChange);
    };
  }, []);
  const account = getClientAccount();
  const store = getActiveStore();
  const companyName = store?.name || account.tradeName || 'Loja';
  const companyDoc = store?.cnpj || account.document || '';
  const mark = profileInitials(profile.displayName);
  const away = mine?.availability === 'away' && mine.module !== 'offline';

  const classNames = ({ isActive = false }: { isActive?: boolean } = {}) =>
    [
      'user-chip',
      `user-chip--${variant}`,
      compact ? 'user-chip--compact' : '',
      isActive ? 'is-active' : '',
      away ? 'is-away' : '',
      showPresence && !compact ? 'has-status' : '',
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
          <span className="user-chip__company" title={`${companyName} · CNPJ: ${companyDoc}`}>
            🏢 {companyName} · {companyDoc}
          </span>
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
    // O status fica dentro do cartão (canto de cima), só como ícone; ao clicar abre as opções.
    // É irmão do link, não filho: botão dentro de link não é permitido.
    <div className="user-chip-stack has-status">
      {chip}
      <PresenceStatusControl iconOnly className="user-chip__status" />
    </div>
  );
}
