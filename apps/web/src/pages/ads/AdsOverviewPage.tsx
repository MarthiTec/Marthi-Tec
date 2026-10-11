import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adsApi, type AdsCampaign, type AdsHealth } from '../../services/adsApi';
import { AdsPage, dateTime, StatusChip, useAdsStatus } from './AdsShared';

const PHASES = [
  { key: 'facebookAds', title: 'Anúncios no Facebook', text: 'Conectar a Meta, criar anúncio de um produto, autorizar orçamento, acompanhar e pausar.', phase: 'Fase 1' },
  { key: 'credits', title: 'Créditos e cobrança pelo Marthi', text: 'Bloqueado até definir o modelo financeiro e o provedor de pagamento. Hoje a Meta cobra direto na sua conta de anúncios.', phase: 'Fase 2' },
  { key: 'instagramAds', title: 'Anúncios no Instagram', text: 'Depois de validar o Facebook, pela mesma conexão Meta.', phase: 'Fase 3' },
  { key: 'instagramOrganic', title: 'Publicações programadas no Instagram', text: 'Foto com legenda, publicada na hora ou agendada, sem pagar anúncio (conexão da loja em Operações › Meta).', phase: 'Fase 1' },
  { key: 'googleAds', title: 'Google Ads e YouTube Ads', text: 'Integrações próprias, em fase posterior.', phase: 'Fase 4' },
];

export function AdsOverviewPage() {
  const { status, error } = useAdsStatus();
  const [health, setHealth] = useState<AdsHealth | null>(null);
  const [campaigns, setCampaigns] = useState<AdsCampaign[]>([]);
  useEffect(() => {
    if (!status) return;
    adsApi.health().then(setHealth).catch(() => undefined);
    adsApi.campaigns().then(setCampaigns).catch(() => undefined);
  }, [status]);

  const count = (keys: string[]) => campaigns.filter((item) => keys.includes(item.display.key)).length;
  return (
    <AdsPage title="Anúncios Ads" lead="Anuncie os produtos do seu cadastro no Facebook e acompanhe tudo por aqui." status={status}>
      {error ? <p className="ads-error">{error}</p> : null}
      <div className="ads-grid">
        <article className="admin-card">
          <h2 className="ads-card-title">Sua conta Meta</h2>
          {!health ? (
            <p className="empty">Conferindo…</p>
          ) : health.canAdvertise ? (
            <p className="ads-ok">
              Pronta para anunciar: Página {health.connection?.page?.name} · conta {health.connection?.adAccount?.name}.
            </p>
          ) : (
            <>
              <p className="ads-error">Ainda falta algo para anunciar.</p>
              <ul className="ads-issues" style={{ marginTop: 8 }}>
                {health.checks
                  .filter((check) => !check.ok && check.id !== 'instagram')
                  .map((check) => (
                    <li key={check.id} className="is-warning">
                      <strong>{check.title}.</strong> {check.help}
                    </li>
                  ))}
              </ul>
            </>
          )}
          <div className="ads-actions">
            <Link to="/painel/ads/contas">Contas conectadas</Link>
            <Link to="/painel/ads/criar" className="btn btn--primary">
              Criar anúncio
            </Link>
          </div>
        </article>
        <article className="admin-card">
          <h2 className="ads-card-title">Campanhas</h2>
          <div className="ads-kpis">
            <div className="ads-kpi">
              <span>Ativas</span>
              <strong>{count(['active'])}</strong>
            </div>
            <div className="ads-kpi">
              <span>Em análise</span>
              <strong>{count(['review', 'processing', 'submitted'])}</strong>
            </div>
            <div className="ads-kpi">
              <span>Pausadas</span>
              <strong>{count(['paused'])}</strong>
            </div>
            <div className="ads-kpi">
              <span>Precisam de atenção</span>
              <strong>{count(['rejected', 'error', 'issues', 'billing'])}</strong>
            </div>
            <div className="ads-kpi">
              <span>Rascunhos</span>
              <strong>{count(['draft'])}</strong>
            </div>
          </div>
          <ul className="ads-checks" style={{ marginTop: 10 }}>
            {campaigns.slice(0, 5).map((item) => (
              <li key={item.id}>
                <span />
                <span>
                  <strong>{item.content.headline || item.name}</strong>
                  <small>
                    <StatusChip display={item.display} /> · {dateTime(item.lastSyncedAt ?? item.createdAt)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <Link to="/painel/ads/campanhas">Ver todas as campanhas</Link>
        </article>
      </div>
      <article className="admin-card">
        <h2 className="ads-card-title">O que já está disponível</h2>
        <ul className="ads-checks">
          {PHASES.map((phase) => {
            const available = status?.phases[phase.key] === 'available';
            return (
              <li key={phase.key} className={available ? 'is-ok' : ''}>
                <span className="ads-checks__icon">{available ? '✓' : '○'}</span>
                <span>
                  <strong>
                    {phase.title} <span className="ads-blocked__phase">{phase.phase}</span>
                  </strong>
                  <small>{available ? phase.text : `Ainda não disponível. ${phase.text}`}</small>
                </span>
              </li>
            );
          })}
        </ul>
      </article>
    </AdsPage>
  );
}
