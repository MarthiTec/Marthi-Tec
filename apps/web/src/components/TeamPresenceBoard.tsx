import { profileInitials } from '../data/operatorProfile';
import {
  presenceDetailLabel,
  presenceStatusLabel,
  type TeamPresence,
} from '../data/presenceStore';
import { useTeamPresence } from '../hooks/usePresence';
import './presenceBoard.css';

function PresenceAvatar({ entry }: { entry: TeamPresence }) {
  const mark = profileInitials(entry.displayName);
  return (
    <span className="presence-board__avatar" aria-hidden>
      {entry.photo ? <img src={entry.photo} alt="" /> : <span>{mark}</span>}
    </span>
  );
}

function PresenceRow({
  entry,
  isMe,
}: {
  entry: TeamPresence;
  isMe: boolean;
}) {
  const online = entry.module !== 'offline';
  const away = entry.availability === 'away' && online;

  return (
    <li
      className={[
        'presence-board__row',
        online ? 'is-online' : 'is-offline',
        away ? 'is-away' : '',
        isMe ? 'is-me' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="presence-board__who">
        <PresenceAvatar entry={entry} />
        <span className={`presence-board__pulse ${away ? 'is-away' : online ? 'is-on' : ''}`} aria-hidden />
        <div className="presence-board__meta">
          <strong>
            {entry.displayName}
            {isMe ? <em>você</em> : null}
          </strong>
          <small>{entry.role}</small>
        </div>
      </div>
      <div className="presence-board__state">
        <span className="presence-board__badge">{presenceStatusLabel(entry)}</span>
        <span className="presence-board__place">{presenceDetailLabel(entry)}</span>
      </div>
    </li>
  );
}

/** Quem está logado, onde e com qual disponibilidade — visão do painel. */
export function TeamPresenceBoard() {
  const { rows, userKey } = useTeamPresence();
  const activeCount = rows.filter(
    (item) => item.module !== 'offline' && item.availability === 'active',
  ).length;
  const awayCount = rows.filter(
    (item) => item.module !== 'offline' && item.availability === 'away',
  ).length;

  return (
    <article className="admin-card presence-board">
      <header className="presence-board__head">
        <div>
          <h2>Equipe na operação</h2>
          <p>
            Foto, status e módulo em tempo real — o mesmo perfil que você ajusta em cada app.
          </p>
        </div>
        <div className="presence-board__stats">
          <span>
            <strong>{activeCount}</strong> ativos
          </span>
          <span>
            <strong>{awayCount}</strong> ausentes
          </span>
          <span>
            <strong>{rows.length}</strong> na equipe
          </span>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="empty">Ninguém na equipe ainda. Cadastre funcionários com acesso ao sistema.</p>
      ) : (
        <ul className="presence-board__list">
          {rows.map((entry) => (
            <PresenceRow key={entry.userKey} entry={entry} isMe={entry.userKey === userKey} />
          ))}
        </ul>
      )}
    </article>
  );
}
