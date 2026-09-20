import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { POS_QUEUE_EVENT } from '../../data/posQueueStore';
import {
  getTotemBuyersToday,
  getTotemClickRanking,
  getTotemDayStats,
  TOTEM_ANALYTICS_EVENT,
  type TotemBuyerRow,
  type TotemDayStats,
  type TotemProductRank,
} from '../../data/totemAnalyticsStore';

function when(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function TotemInsightsPage() {
  const [stats, setStats] = useState<TotemDayStats>(() => getTotemDayStats());
  const [ranking, setRanking] = useState<TotemProductRank[]>(() => getTotemClickRanking(10));
  const [buyers, setBuyers] = useState<TotemBuyerRow[]>(() => getTotemBuyersToday());

  function refresh() {
    setStats(getTotemDayStats());
    setRanking(getTotemClickRanking(10));
    setBuyers(getTotemBuyersToday());
  }

  useEffect(() => {
    function onUpdate() {
      refresh();
    }
    window.addEventListener(TOTEM_ANALYTICS_EVENT, onUpdate);
    window.addEventListener(POS_QUEUE_EVENT, onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener(TOTEM_ANALYTICS_EVENT, onUpdate);
      window.removeEventListener(POS_QUEUE_EVENT, onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  const maxClicks = Math.max(1, ...ranking.map((item) => item.clicks));

  return (
    <section className="admin-page">
      <article className="admin-card">
        <div className="admin-toolbar" style={{ marginTop: 0, marginBottom: 8 }}>
          <div>
            <h2 style={{ margin: 0 }}>Dados do totem</h2>
            <p className="empty" style={{ margin: '6px 0 0' }}>
              Cliques, propostas e compras do dia — para a loja acompanhar o quiosque sem abrir o
              totem.
            </p>
          </div>
          <Link to="/totem" className="btn btn--primary">
            <AdminIcon name="totem" />
            Abrir totem
          </Link>
          <Link to="/painel/totem/config" className="btn btn--ghost">
            Configuração
          </Link>
        </div>
      </article>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>Cliques hoje</h2>
          <strong>{stats.clicksToday}</strong>
          <p>Toques em produtos no totem.</p>
        </article>
        <article className="admin-card">
          <h2>Propostas hoje</h2>
          <strong>{stats.proposalsToday}</strong>
          <p>Leads enviados à fila do PDV.</p>
        </article>
        <article className="admin-card">
          <h2>Vendas hoje</h2>
          <strong>{stats.soldToday}</strong>
          <p>Propostas fechadas como venda.</p>
        </article>
        <article className="admin-card">
          <h2>Fila aberta</h2>
          <strong>{stats.openToday}</strong>
          <p>Aguardando o representante hoje.</p>
        </article>
      </div>

      <div className="totem-insights">
        <article className="admin-card">
          <h2>Ranking · itens mais clicados</h2>
          <p className="empty">Ordenado pelo total de cliques no totem.</p>
          {ranking.length === 0 ? (
            <p className="empty">Ainda sem cliques. Abra o totem e navegue pelos produtos.</p>
          ) : (
            <ol className="totem-rank">
              {ranking.map((item, index) => (
                <li key={item.productId}>
                  <div className="totem-rank__head">
                    <span className="totem-rank__pos">{index + 1}</span>
                    <div>
                      <strong>{item.productName}</strong>
                      <span>
                        {item.clicks} clique{item.clicks === 1 ? '' : 's'}
                        {item.clicksToday
                          ? ` · ${item.clicksToday} hoje`
                          : ''}
                      </span>
                    </div>
                  </div>
                  <div className="totem-rank__bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(8, (item.clicks / maxClicks) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>

        <article className="admin-card">
          <h2>Compras pelo totem · hoje</h2>
          <p className="empty">
            Clientes que fecharam venda via proposta do totem nesta data · {stats.uniqueBuyersToday}{' '}
            pessoa{stats.uniqueBuyersToday === 1 ? '' : 's'}.
          </p>
          {buyers.length === 0 ? (
            <p className="empty">Nenhuma venda do totem fechada hoje.</p>
          ) : (
            <div className="caixa-panel__table" style={{ border: 'none', borderRadius: 0 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Telefone</th>
                    <th>Hoje</th>
                    <th>Total</th>
                    <th>Produtos (hoje)</th>
                    <th>Última</th>
                  </tr>
                </thead>
                <tbody>
                  {buyers.map((buyer) => (
                    <tr key={`${buyer.customerPhone}-${buyer.customerName}`}>
                      <td>{buyer.customerName}</td>
                      <td>{buyer.customerPhone || '—'}</td>
                      <td>{buyer.purchasesToday}×</td>
                      <td>{buyer.purchasesTotal}×</td>
                      <td>{buyer.productsToday.join(', ') || '—'}</td>
                      <td>{when(buyer.lastPurchaseAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
