import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { adsApi, formatMinor, type AdsCampaign, type AdsInsights } from '../../services/adsApi';
import { AdsPage, dateTime, money, StatusChip, useAdsStatus } from './AdsShared';

const PRESETS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last_7d', label: 'Últimos 7 dias' },
  { value: 'last_30d', label: 'Últimos 30 dias' },
  { value: 'maximum', label: 'Desde o início' },
];
const REQUESTED: Record<string, string> = { draft: 'Rascunho', paused: 'Pausada', active: 'Ativa' };

/** Motivos de reprovação (ad_review_feedback) em lista legível. */
function feedbackLines(feedback: Record<string, unknown> | null) {
  if (!feedback) return [];
  const lines: string[] = [];
  for (const group of Object.values(feedback)) {
    if (group && typeof group === 'object') for (const [title, text] of Object.entries(group as Record<string, unknown>)) lines.push(`${title}: ${String(text)}`);
  }
  return lines;
}

export function AdsCampaignsPage() {
  const { status } = useAdsStatus();
  const navigate = useNavigate();
  const [items, setItems] = useState<AdsCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdsCampaign | null>(null);
  const [preset, setPreset] = useState('maximum');
  const [insights, setInsights] = useState<AdsInsights | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmSpend, setConfirmSpend] = useState(false);

  const load = () =>
    adsApi
      .campaigns()
      .then((rows) => {
        setItems(rows);
        setSelected((current) => (current ? rows.find((row) => row.id === current.id) ?? null : current));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar as campanhas.'))
      .finally(() => setLoading(false));
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setInsights(null);
    setConfirmSpend(false);
    if (!selected?.external?.campaign_id) return;
    adsApi.insights(selected.id, preset).then(setInsights).catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível consultar os resultados.'));
  }, [selected?.id, preset]);

  async function act(work: () => Promise<AdsCampaign | void>, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await work();
      if (next) setSelected(next);
      setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  }

  const feedback = feedbackLines(selected?.reviewFeedback ?? null);
  const metric = (key: string) => (insights?.data && insights.data[key] != null ? insights.data[key] : null);
  return (
    <AdsPage title="Campanhas" lead="Acompanhe o que foi enviado para a Meta: análise, veiculação, pausa e resultados." status={status}>
      {error ? <p className="ads-error">{error}</p> : null}
      {notice ? <p className="ads-ok">{notice}</p> : null}
      <article className="admin-card">
        <div className="ads-table-wrap">
          <table className="admin-table ads-table">
            <thead>
              <tr>
                <th>Anúncio</th>
                <th>Situação na Meta</th>
                <th>Orçamento</th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={selected?.id === item.id ? 'is-checked' : undefined} style={{ cursor: 'pointer' }} onClick={() => setSelected(item)}>
                  <td>
                    <strong>{item.content.headline || item.name}</strong>
                    <small>Pedido pelo Marthi: {REQUESTED[item.requestedStatus] ?? item.requestedStatus}</small>
                  </td>
                  <td>
                    <StatusChip display={item.display} />
                  </td>
                  <td>
                    {formatMinor(item.budgetMinor, item.currency)} {item.budgetType === 'daily' ? '/dia' : 'total'}
                  </td>
                  <td>{dateTime(item.lastSyncedAt ?? item.createdAt)}</td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={4} className="empty">
                    {loading ? 'Carregando…' : (
                      <>
                        Nenhum anúncio ainda. <Link to="/painel/ads/criar">Criar anúncio</Link>
                      </>
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      {selected ? (
        <div className="ads-grid">
          <article className="admin-card ads-detail">
            <h2 className="ads-card-title">{selected.content.headline || selected.name}</h2>
            <p>
              <StatusChip display={selected.display} /> <span className="ads-note">{selected.display.help}</span>
            </p>
            <p className="ads-note">
              Pedido pelo Marthi: <strong>{REQUESTED[selected.requestedStatus]}</strong> · Situação informada pela Meta: <strong>{selected.effectiveStatus || '—'}</strong> · consultado em {dateTime(selected.lastSyncedAt)}
            </p>
            {selected.authorizedBy ? (
              <p className="ads-note">
                Orçamento autorizado por {selected.authorizedBy} em {dateTime(selected.authorizedAt)}
              </p>
            ) : null}
            {selected.lastError ? <p className="ads-error">{selected.lastError}</p> : null}
            {feedback.length ? (
              <div className="ads-feedback">
                <strong>Motivo informado pela Meta:</strong>
                <ul>
                  {feedback.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="ads-actions">
              {selected.submitState === 'draft' || selected.submitState === 'error' ? (
                <button type="button" className="btn btn--primary" onClick={() => navigate(`/painel/ads/criar?id=${selected.id}&etapa=${selected.submitState === 'error' ? 5 : 2}`)}>
                  {selected.submitState === 'error' ? 'Ver erro e enviar de novo' : 'Continuar rascunho'}
                </button>
              ) : null}
              {selected.display.key === 'rejected' || selected.display.key === 'issues' ? (
                <button type="button" className="btn btn--primary" onClick={() => navigate(`/painel/ads/criar?id=${selected.id}&etapa=2`)}>
                  Corrigir e reenviar
                </button>
              ) : null}
              {selected.submitState === 'submitted' ? (
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void act(() => adsApi.sync(selected.id), 'Situação atualizada com a Meta.')}>
                  Atualizar situação
                </button>
              ) : null}
              {selected.submitState === 'submitted' && selected.requestedStatus === 'active' ? (
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void act(() => adsApi.pause(selected.id), 'Campanha pausada na Meta.')}>
                  Pausar
                </button>
              ) : null}
              {selected.submitState === 'draft' && !selected.external?.campaign_id ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Excluir este rascunho?')) void act(async () => {
                      await adsApi.deleteDraft(selected.id);
                      setSelected(null);
                    }, 'Rascunho excluído.');
                  }}
                >
                  Excluir rascunho
                </button>
              ) : null}
            </div>
            {selected.submitState === 'submitted' && selected.requestedStatus !== 'active' && selected.display.key !== 'done' ? (
              status?.canAdmin ? (
                <div>
                  <label className="ads-check">
                    <input type="checkbox" checked={confirmSpend} onChange={(e) => setConfirmSpend(e.target.checked)} />
                    Autorizo gastar até {formatMinor(selected.budgetMinor, selected.currency)} {selected.budgetType === 'daily' ? 'por dia (média)' : 'no total'} na minha conta de anúncios da Meta.
                  </label>
                  <div className="ads-actions">
                    <span />
                    <button type="button" className="btn btn--primary" disabled={busy || !confirmSpend} onClick={() => void act(() => adsApi.activate(selected.id, selected.budgetMinor), 'Orçamento autorizado. A Meta veicula quando o anúncio estiver aprovado.')}>
                      {selected.authorizedBy ? 'Retomar (autorizar de novo)' : 'Autorizar e ativar'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="ads-note">Só o administrador da loja autoriza gastos e retoma campanhas.</p>
              )
            ) : null}
          </article>

          <article className="admin-card ads-detail">
            <div className="ads-actions" style={{ marginTop: 0 }}>
              <h2 className="ads-card-title" style={{ margin: 0 }}>
                Resultados
              </h2>
              <AdminPicker label="Período" value={preset} options={PRESETS} onChange={setPreset} />
            </div>
            {!selected.external?.campaign_id ? (
              <p className="empty">Os resultados aparecem depois que a campanha é enviada para a Meta.</p>
            ) : !insights ? (
              <p className="empty">Consultando a Meta…</p>
            ) : insights.data === null ? (
              <p className="empty">A Meta ainda não tem dados para este período (não é o mesmo que zero). Consultado em {dateTime(insights.fetchedAt)}.</p>
            ) : (
              <>
                <div className="ads-kpis">
                  <Kpi label="Gasto" value={metric('spend') != null ? money(Number(metric('spend')), insights.currency) : null} />
                  <Kpi label="Impressões" value={metric('impressions') != null ? Number(metric('impressions')).toLocaleString('pt-BR') : null} />
                  <Kpi label="Alcance (pessoas)" value={metric('reach') != null ? Number(metric('reach')).toLocaleString('pt-BR') : null} />
                  <Kpi label="Cliques no link" value={metric('inline_link_clicks') != null ? Number(metric('inline_link_clicks')).toLocaleString('pt-BR') : null} />
                  <Kpi label="Custo por clique" value={metric('cpc') != null ? money(Number(metric('cpc')), insights.currency) : null} />
                  <Kpi label="Custo por mil (CPM)" value={metric('cpm') != null ? money(Number(metric('cpm')), insights.currency) : null} />
                  <Kpi label="Taxa de cliques" value={metric('ctr') != null ? `${Number(metric('ctr')).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : null} />
                  <Kpi label="Frequência" value={metric('frequency') != null ? Number(metric('frequency')).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : null} />
                </div>
                <p className="ads-note">
                  Período da Meta: {insights.data.date_start ?? '—'} a {insights.data.date_stop ?? '—'} · consultado em {dateTime(insights.fetchedAt)}. A Meta pode levar algumas horas para consolidar os números.
                </p>
              </>
            )}
            <p className="ads-note">Vendas e retorno sobre o investimento não aparecem porque o rastreamento de conversões ainda não está configurado.</p>
          </article>
        </div>
      ) : null}
    </AdsPage>
  );
}

function Kpi({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="ads-kpi">
      <span>{label}</span>
      <strong>{value ?? '—'}</strong>
      {value == null ? <small>sem informação</small> : null}
    </div>
  );
}
