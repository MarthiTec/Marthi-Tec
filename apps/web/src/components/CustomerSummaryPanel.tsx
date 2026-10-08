import { useEffect, useState } from 'react';
import { apiCustomerSummary, type ApiCustomerSummary } from '../services/erpApi';
import { STATUS_LABEL as OS_STATUS } from '../data/osStore';
import './customerSummary.css';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString('pt-BR') : '—');


/** Resumo do cliente para a loja: compras, formas de pagamento, produtos e serviços (OS). */
export function CustomerSummaryPanel({ customerId }: { customerId: string }) {
  const [data, setData] = useState<ApiCustomerSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    void apiCustomerSummary(customerId)
      .then((summary) => alive && setData(summary))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Não foi possível carregar o resumo.'));
    return () => {
      alive = false;
    };
  }, [customerId]);

  if (error) return <article className="admin-card"><p role="alert" className="qty-low">{error}</p></article>;
  if (!data) return <article className="admin-card"><p className="empty">Carregando resumo do cliente…</p></article>;

  const maxPayment = Math.max(1, ...data.payments.map((item) => item.amount));

  return (
    <article className="admin-card customer-summary">
      <h3 className="customer-section-title">Resumo financeiro</h3>
      <div className="customer-summary__kpis">
        <div>
          <small>Compras</small>
          <strong>{data.salesCount}</strong>
          {data.cancelledCount ? <span>{data.cancelledCount} cancelada(s)</span> : null}
        </div>
        <div>
          <small>Total comprado</small>
          <strong>{money(data.totalSpent)}</strong>
        </div>
        <div>
          <small>Ticket médio</small>
          <strong>{money(data.averageTicket)}</strong>
        </div>
        <div>
          <small>Última compra</small>
          <strong>{date(data.lastPurchaseAt)}</strong>
          {data.sellerName ? <span>Vendedor: {data.sellerName}</span> : null}
        </div>
      </div>

      <div className="customer-summary__cols">
        <section>
          <h4>Formas de pagamento</h4>
          {data.payments.length === 0 ? (
            <p className="empty">Sem pagamentos registrados.</p>
          ) : (
            <ul className="customer-summary__bars">
              {data.payments.map((item) => (
                <li key={item.method}>
                  <div>
                    <span>{item.method}</span>
                    <strong>{money(item.amount)}</strong>
                  </div>
                  <i style={{ width: `${Math.max(4, (item.amount / maxPayment) * 100)}%` }} aria-hidden />
                  <small>{item.times} vez(es)</small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4>Produtos comprados</h4>
          {data.products.length === 0 ? (
            <p className="empty">Nenhum produto comprado ainda.</p>
          ) : (
            <ul className="customer-summary__list">
              {data.products.map((item) => (
                <li key={item.name}>
                  <span>{item.qty}× {item.name}</span>
                  <small>{money(item.amount)} · {date(item.lastAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4>Serviços (OS)</h4>
          {data.services.length === 0 ? (
            <p className="empty">Nenhuma ordem de serviço.</p>
          ) : (
            <ul className="customer-summary__list">
              {data.services.map((item) => (
                <li key={item.id}>
                  <span>{item.device || 'Aparelho'} <em>{(OS_STATUS as Record<string, string>)[item.status] ?? item.status}</em></span>
                  <small>{money(item.total)} · {date(item.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
