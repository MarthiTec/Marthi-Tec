import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { ADMIN_STATE_EVENT, getAdminState, type SalesOrder } from '../../data/adminStore';
import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';
import {
  emitNfeFromSale,
  FISCAL_KIND_LABEL,
  getFiscalDocumentForRef,
  listFiscalDocuments,
} from '../../data/fiscalDocuments';
import { hasModule } from '../../data/storePlan';
import { ticketVariation } from '../../data/posQueueStore';
import { usePosTickets } from './usePosTickets';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Filter = 'sold' | 'open' | 'all';

export function OrdersPage() {
  const fiscalOn = hasModule('fiscal');
  const [orders, setOrders] = useState(() => getAdminState().orders);
  const [docs, setDocs] = useState(() => listFiscalDocuments());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('sold');
  const [query, setQuery] = useState('');
  const { tickets } = usePosTickets();

  useEffect(() => {
    function refreshState() {
      setOrders(getAdminState().orders);
      setDocs(listFiscalDocuments());
    }
    for (const event of [ADMIN_STATE_EVENT, ERP_BOOTSTRAP_EVENT, 'marthi-stock'] as const) {
      window.addEventListener(event, refreshState);
    }
    return () => {
      for (const event of [ADMIN_STATE_EVENT, ERP_BOOTSTRAP_EVENT, 'marthi-stock'] as const) {
        window.removeEventListener(event, refreshState);
      }
    };
  }, []);

  const rows = useMemo(() => {
    const sold = orders
      .filter((order) => order.status === 'sold')
      .map((order) => ({
        kind: 'sale' as const,
        id: order.id,
        customer: order.customerName || 'Consumidor Final',
        product: order.productName,
        payment: order.payment,
        seller: order.sellerName || '—',
        amount: order.amount,
        amountLabel: money(order.amount),
        status: order.status,
        when: order.createdAt,
        order,
      }));

    const open = tickets
      .filter((ticket) => ticket.status === 'open')
      .map((ticket) => ({
        kind: 'ticket' as const,
        id: ticket.id,
        customer: ticket.customerName,
        product: `${ticket.productName} · ${ticketVariation(ticket)}`,
        payment: '—',
        seller: '—',
        amount: 0,
        amountLabel: ticket.priceLabel,
        status: 'open' as const,
        when: ticket.createdAt,
        order: null as SalesOrder | null,
      }));

    const mixed =
      filter === 'sold' ? sold : filter === 'open' ? open : [...sold, ...open];

    const needle = query.trim().toLowerCase();
    return mixed
      .filter((row) => {
        if (!needle) return true;
        return `${row.id} ${row.customer} ${row.product} ${row.payment} ${row.seller}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => b.when.localeCompare(a.when));
  }, [orders, tickets, filter, query]);

  const soldTotal = useMemo(
    () => orders.filter((o) => o.status === 'sold').reduce((sum, o) => sum + o.amount, 0),
    [orders],
  );

  function refresh() {
    setOrders(getAdminState().orders);
    setDocs(listFiscalDocuments());
  }

  function emit(order: SalesOrder, asNfce: boolean) {
    const result = emitNfeFromSale({
      orderId: order.id,
      customerName: order.customerName || 'Consumidor Final',
      amount: order.amount,
      asNfce,
    });
    if (!result.ok) {
      setError(result.error);
      setMessage('');
      return;
    }
    setError('');
    setMessage(
      `${FISCAL_KIND_LABEL[result.document.kind]} ${result.document.number} · chave ${result.document.accessKey.slice(0, 8)}…`,
    );
    refresh();
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <div className="dash-card__head">
          <div>
            <h2>Consultar vendas</h2>
            <p>
              Vendas fechadas no PDV e interesses abertos no totem.
              {filter === 'sold' ? ` Total listado: ${money(soldTotal)}.` : ''}
            </p>
          </div>
          <Link to="/caixa" className="btn btn--primary">
            <AdminIcon name="cart" />
            Nova venda
          </Link>
        </div>

        <div className="admin-toolbar">
          <label className="crud-search">
            <AdminIcon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pedido, cliente ou produto…"
              aria-label="Buscar vendas"
            />
          </label>
          <AdminPicker
            compact
            label="Filtro"
            value={filter}
            options={[
              { value: 'sold', label: 'Vendas realizadas' },
              { value: 'open', label: 'Abertos no totem' },
              { value: 'all', label: 'Todos' },
            ]}
            onChange={(value) => setFilter(value as Filter)}
          />
        </div>

        {message ? <p className="pdv__ok">{message}</p> : null}
        {error ? <p className="pdv__alert">{error}</p> : null}

        {rows.length === 0 ? (
          <p className="empty">Nenhuma venda neste filtro.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Quando</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Pagamento</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Fiscal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const doc = row.kind === 'sale' ? getFiscalDocumentForRef('sale', row.id) : null;
                const sold = row.status === 'sold' && row.order;

                return (
                  <tr key={`${row.kind}-${row.id}`}>
                    <td>{row.id}</td>
                    <td>{new Date(row.when).toLocaleString('pt-BR')}</td>
                    <td>{row.customer}</td>
                    <td>{row.product}</td>
                    <td>{row.payment}</td>
                    <td className="price-red">{row.amountLabel}</td>
                    <td>
                      <span className={`badge ${row.status === 'open' ? 'badge--open' : 'badge--sold'}`}>
                        {row.status === 'open' ? 'Aberto no totem' : 'Vendido'}
                      </span>
                    </td>
                    <td>
                      {doc ? (
                        <span className="badge badge--sold">
                          {FISCAL_KIND_LABEL[doc.kind]} {doc.number}
                        </span>
                      ) : (
                        <span className="empty">—</span>
                      )}
                    </td>
                    <td className="admin-table__action">
                      {sold && fiscalOn && !doc ? (
                        <div className="admin-toolbar" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn--primary btn--icon"
                            title="Emitir NFC-e"
                            aria-label="Emitir NFC-e"
                            onClick={() => emit(row.order!, true)}
                          >
                            <AdminIcon name="fiscal" />
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            title="Emitir NF-e"
                            onClick={() => emit(row.order!, false)}
                          >
                            NF-e
                          </button>
                        </div>
                      ) : sold && !fiscalOn ? (
                        <Link to="/painel/plano" className="btn btn--ghost" title="Requer Emissor Fiscal">
                          Plano
                        </Link>
                      ) : row.status === 'open' ? (
                        <Link
                          to="/painel/pdv"
                          className="btn btn--primary btn--icon"
                          title="Abrir PDV"
                          aria-label="Abrir PDV"
                        >
                          <AdminIcon name="cart" />
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {fiscalOn && docs.filter((d) => d.refType === 'sale').length > 0 ? (
          <p className="empty admin-note">
            Documentos simulados localmente. Em produção: ACBr API → SEFAZ.
          </p>
        ) : null}
      </article>
    </section>
  );
}
