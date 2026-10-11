import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { adsApi, type AdsStatus } from '../../services/adsApi';
import './ads.css';

export const ADS_SECTIONS = [
  { to: '/painel/ads', label: 'Visão geral', end: true },
  { to: '/painel/ads/criar', label: 'Criar anúncio' },
  { to: '/painel/ads/campanhas', label: 'Campanhas' },
  { to: '/painel/ads/publicacoes', label: 'Publicações e calendário' },
  { to: '/painel/ads/midias', label: 'Fotos e vídeos' },
  { to: '/painel/ads/creditos', label: 'Créditos e pagamentos' },
  { to: '/painel/ads/contas', label: 'Contas conectadas' },
];

/** Abas do Marthi ADS (mesmo padrão das abas do sistema). */
export function AdsNav() {
  return (
    <nav className="stock-form-tabs ads-nav" aria-label="Marthi ADS">
      {ADS_SECTIONS.map((section) => (
        <NavLink key={section.to} to={section.to} end={section.end} className={({ isActive }) => `stock-form-tab ${isActive ? 'is-active' : ''}`}>
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Cabeçalho comum: título, explicação curta e aviso de ambiente de teste. */
export function AdsPage({ title, lead, status, children }: { title: string; lead: string; status?: AdsStatus | null; children: ReactNode }) {
  return (
    <section className="admin-page ads-page">
      <header className="ads-head">
        <div>
          <p className="ads-head__kicker">Marthi ADS</p>
          <h1>{title}</h1>
          <p className="empty">{lead}</p>
        </div>
        {status?.config.environment === 'test' ? <span className="ads-env">Ambiente de teste</span> : null}
      </header>
      <AdsNav />
      {children}
    </section>
  );
}

export function useAdsStatus() {
  const [status, setStatus] = useState<AdsStatus | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    adsApi
      .status()
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar o Marthi ADS.'));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
  }, [load]);
  return { status, error, reload: load };
}

const CHIP_CLASS: Record<string, string> = {
  draft: 'is-muted',
  pending: 'is-info',
  submitted: 'is-info',
  processing: 'is-info',
  review: 'is-warn',
  billing: 'is-warn',
  issues: 'is-warn',
  active: 'is-ok',
  paused: 'is-muted',
  done: 'is-muted',
  rejected: 'is-bad',
  error: 'is-bad',
};

export function StatusChip({ display }: { display: { key: string; label: string; help?: string } }) {
  return (
    <span className={`ads-chip ${CHIP_CLASS[display.key] ?? 'is-muted'}`} title={display.help}>
      {display.label}
    </span>
  );
}

/** Recurso que depende de etapa futura: explica, sem botão que pareça funcionar. */
export function PhaseBlocked({ phase, title, children }: { phase: string; title: string; children: ReactNode }) {
  return (
    <article className="admin-card ads-blocked">
      <span className="ads-blocked__phase">{phase}</span>
      <h2>{title}</h2>
      <div className="ads-blocked__body">{children}</div>
    </article>
  );
}

export const money = (value: number, currency = 'BRL') => value.toLocaleString('pt-BR', { style: 'currency', currency: currency || 'BRL' });
export const dateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
