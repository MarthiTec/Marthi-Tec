import { useCallback, useEffect, useState } from 'react';
import { apiAcceptCatalogOrder, apiCancelCatalogOrder, apiListCatalogOrders, type CatalogOrder } from '../services/salesCatalogApi';
import './catalogOrdersQueue.css';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `há ${hours} h` : new Date(iso).toLocaleDateString('pt-BR');
};
const CONDITION: Record<string, string> = { perfect: 'Perfeito', marks: 'Marcas de uso', damaged: 'Avariado' };

/** Resumo do aparelho da troca que o cliente adiantou (vai para a observação do usado). */
export function catalogTradeSummary(trade: NonNullable<CatalogOrder['tradeIn']>) {
  return [
    trade.battery !== null ? `bateria ${trade.battery}%` : '',
    CONDITION[trade.condition] ?? '',
    trade.screenReplaced ? 'tela trocada' : '',
    trade.opened ? 'já foi aberto' : '',
    trade.faceIdOk ? '' : 'Face ID/Touch ID com defeito',
    trade.hasBox ? 'com caixa' : '',
    trade.hasInvoice ? 'com nota' : '',
    trade.notes,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Fila da venda externa com os pedidos e cadastros que os clientes mandaram pelo catálogo.
 * "Atender" aprova o cadastro (ou acha o cliente que já existe) e preenche a venda; ao concluir a venda,
 * o pedido sai da fila.
 */
export function CatalogOrdersQueue({ storeId, onAttend }: { storeId: string | null; onAttend: (order: CatalogOrder, customer: { id: string; name: string; phone: string; document: string; email: string }) => void }) {
  const [orders, setOrders] = useState<CatalogOrder[]>([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    if (document.hidden) return;
    apiListCatalogOrders()
      .then((list) => {
        setOrders(list);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar os pedidos do catálogo.'));
  }, []);

  useEffect(() => {
    setOrders([]);
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [storeId, load]);

  async function attend(order: CatalogOrder) {
    setBusyId(order.id);
    setError('');
    setNotice('');
    try {
      const result = await apiAcceptCatalogOrder(order.id);
      if (order.kind === 'signup' && !order.tradeIn) {
        setNotice(`${result.customer.name} ${result.createdCustomer ? 'cadastrado(a)' : 'já era cliente: dados completados'}.`);
      } else {
        onAttend(result.order, result.customer);
        setNotice(`Pedido ${order.code} carregado na venda${result.createdCustomer ? ' · cliente cadastrado' : ''}. Confira e conclua.`);
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atender o pedido.');
    } finally {
      setBusyId('');
    }
  }

  async function cancel(order: CatalogOrder) {
    const reason = window.prompt(`Cancelar o pedido ${order.code} de ${order.customer.name}? Motivo (opcional):`);
    if (reason === null) return;
    setBusyId(order.id);
    try {
      await apiCancelCatalogOrder(order.id, reason);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cancelar.');
    } finally {
      setBusyId('');
    }
  }

  if (!orders.length && !error && !notice) return null;
  return (
    <article className="admin-card cat-queue">
      <header className="cat-queue__head">
        <h2>Pedidos do catálogo</h2>
        <span className="cat-queue__count">{orders.length}</span>
      </header>
      <p className="cat-queue__muted">Feitos pelo cliente no celular. Atender aprova o cadastro e já preenche a venda abaixo.</p>
      {error ? <p role="alert" className="cat-queue__error">{error}</p> : null}
      {notice ? <p role="status" className="cat-queue__notice">{notice}</p> : null}
      <ul className="cat-queue__list">
        {orders.map((order) => (
          <li key={order.id} className={`cat-queue__item${order.status === 'in_service' ? ' is-service' : ''}`}>
            <div className="cat-queue__top">
              <strong>
                {order.kind === 'signup' ? (order.tradeIn ? 'Upgrade' : 'Cadastro') : 'Pedido'} {order.code}
              </strong>
              <span className="cat-queue__badge">{order.status === 'in_service' ? 'Em atendimento' : 'Novo'}</span>
              <small>{ago(order.createdAt)}</small>
            </div>
            <p className="cat-queue__customer">
              <strong>{order.customer.name}</strong> · {order.customer.phone}
              {order.customer.document ? ` · ${order.customer.document}` : ''}
              {order.customer.city ? ` · ${order.customer.city}/${order.customer.state}` : ''}
            </p>
            {order.items.length ? (
              <ul className="cat-queue__lines">
                {order.items.map((line, index) => (
                  <li key={index}>
                    {line.qty > 1 ? `${line.qty}x ` : ''}
                    {line.name}
                    {line.variantLabel ? ` · ${line.variantLabel}` : ''}
                    {line.condition && line.condition !== 'Novo' ? ` · ${line.condition}` : ''}
                    {line.availability === 'order' ? <span className="cat-queue__order"> sob encomenda</span> : null}
                    <strong> {money(line.price * line.qty)}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="cat-queue__meta">
              {order.items.length ? (
                <>
                  <strong>{money(order.total)}</strong> · {order.payment}
                  {order.installments > 1 ? ` ${order.installments}x` : ''} · {order.fulfillment === 'delivery' ? 'Entrega' : 'Retira na loja'}
                </>
              ) : null}
              {order.sellerName ? ` · atendido por ${order.sellerName}` : ''}
            </p>
            {order.tradeIn ? (
              <p className="cat-queue__trade">
                Troca: <strong>{order.tradeIn.device}</strong>
                {[order.tradeIn.capacity, order.tradeIn.color].filter(Boolean).length ? ` · ${[order.tradeIn.capacity, order.tradeIn.color].filter(Boolean).join(' · ')}` : ''} · {catalogTradeSummary(order.tradeIn)}
                {order.tradeIn.imei ? ` · IMEI ${order.tradeIn.imei}` : ''}
              </p>
            ) : null}
            {order.notes ? <p className="cat-queue__muted">“{order.notes}”</p> : null}
            <div className="cat-queue__actions">
              <button type="button" className="btn btn--primary btn--sm" disabled={busyId === order.id} onClick={() => void attend(order)}>
                {order.kind === 'signup' && !order.tradeIn ? 'Aprovar cadastro' : 'Atender'}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" disabled={busyId === order.id} onClick={() => void cancel(order)}>
                Cancelar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
