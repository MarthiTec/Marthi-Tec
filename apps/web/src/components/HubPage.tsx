import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminIcon, type AdminIconName } from './AdminIcons';
import './hubPage.css';

export type HubTab<T extends string> = {
  id: T;
  label: string;
  icon: AdminIconName;
  /** Quantidade cadastrada, mostrada ao lado do nome da aba. */
  count?: number | null;
  /** Uma linha explicando para que serve a aba. */
  hint?: string;
  render: () => ReactNode;
};

/**
 * Tela com abas no padrão de "Lojas & Licenciamento": título, abas com ícone e contagem e o
 * conteúdo da aba escolhida. A aba fica no endereço (?aba=), então dá para criar atalhos.
 */
export function HubPage<T extends string>({
  icon,
  title,
  subtitle,
  tabs,
  aside,
}: {
  icon: AdminIconName;
  title: string;
  subtitle: string;
  tabs: HubTab<T>[];
  aside?: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const active = tabs.find((tab) => tab.id === params.get('aba')) ?? tabs[0];

  function select(id: T) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('aba', id);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="admin-page hub-page">
      <header className="hub-head">
        <div className="hub-head__info">
          <h1>
            <span className="hub-head__icon" aria-hidden>
              <AdminIcon name={icon} />
            </span>
            {title}
          </h1>
          <p>{subtitle}</p>
        </div>
        {aside ? <div className="hub-head__aside">{aside}</div> : null}
      </header>

      <nav className="hub-tabs" role="tablist" aria-label={title}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active.id}
            className={`hub-tab${tab.id === active.id ? ' is-active' : ''}`}
            onClick={() => select(tab.id)}
          >
            <AdminIcon name={tab.icon} />
            <span>{tab.label}</span>
            {typeof tab.count === 'number' ? <span className="hub-tab__count">{tab.count}</span> : null}
          </button>
        ))}
      </nav>

      {active.hint ? <p className="hub-hint">{active.hint}</p> : null}
      <section className="hub-panel" role="tabpanel" key={active.id}>
        {active.render()}
      </section>
    </div>
  );
}
