import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  BOARD_COLUMNS,
  listWorkOrders,
  PRIORITY_LABEL,
  QUOTE_STATUS_LABEL,
  STATUS_LABEL,
  updateWorkOrder,
  workOrderTotal,
  type QuoteStatus,
  type WorkOrder,
  type WorkOrderStatus,
} from '../../data/osStore';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

export function WorkOrdersPage() {
  const [params] = useSearchParams();
  const statusFilter = params.get('status') as WorkOrderStatus | null;
  const quoteFilter = params.get('quote') as QuoteStatus | null;
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState(() => listWorkOrders());

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (quoteFilter && item.quoteStatus !== quoteFilter) return false;
      if (!statusFilter && !quoteFilter && item.status === 'cancelled') return false;
      if (!needle) return true;
      return `${item.id} ${item.customerName} ${item.itemName} ${item.technician}`
        .toLowerCase()
        .includes(needle);
    });
  }, [orders, query, statusFilter, quoteFilter]);

  const openCount = orders.filter((item) => !['delivered', 'cancelled'].includes(item.status)).length;
  const progressCount = orders.filter((item) => item.status === 'progress').length;
  const readyCount = orders.filter((item) => item.status === 'ready').length;
  const quoteWaiting = orders.filter((item) => item.quoteStatus === 'sent').length;

  function move(id: string, status: WorkOrderStatus) {
    updateWorkOrder(id, { status });
    setOrders(listWorkOrders());
  }

  return (
    <section className="admin-page">
      <div className="admin-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar OS, cliente ou item…"
        />
        <Link to="/painel/os/nova" className="btn btn--primary">
          Nova OS
        </Link>
        <Link to="/painel/os/agenda" className="btn btn--ghost">
          Agenda
        </Link>
      </div>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>Em oficina</h2>
          <strong>{openCount}</strong>
          <p>Ordens ainda não entregues.</p>
        </article>
        <article className="admin-card">
          <h2>Em serviço</h2>
          <strong>{progressCount}</strong>
          <p>Técnico trabalhando agora.</p>
        </article>
        <article className="admin-card">
          <h2>Prontas</h2>
          <strong>{readyCount}</strong>
          <p>Aguardando o cliente retirar.</p>
        </article>
        <article className="admin-card">
          <h2>Orçamentos</h2>
          <strong>{quoteWaiting}</strong>
          <p>
            Aguardando aprovação.{' '}
            <Link to="/painel/os?quote=sent">Ver lista</Link>
          </p>
        </article>
      </div>

      {quoteFilter === 'sent' ? (
        <article className="admin-card">
          <h2>Aguardando aprovação do cliente</h2>
          <p>Orçamentos enviados — registre a resposta do cliente no detalhe da OS.</p>
          {filtered.length === 0 ? <p className="empty">Nenhum orçamento pendente.</p> : null}
          <div className="os-board" style={{ gridTemplateColumns: '1fr' }}>
            {filtered.map((order) => (
              <WorkOrderCard key={order.id} order={order} onMove={move} />
            ))}
          </div>
          <div className="admin-toolbar" style={{ marginTop: 12 }}>
            <Link to="/painel/os" className="btn btn--ghost">
              Voltar ao quadro
            </Link>
          </div>
        </article>
      ) : (
        <div className="os-board">
          {(statusFilter && BOARD_COLUMNS.includes(statusFilter)
            ? [statusFilter]
            : BOARD_COLUMNS
          ).map((status) => {
            const column = filtered.filter((item) => item.status === status);
            return (
              <section key={status} className="os-col">
                <header className="os-col__head">
                  <h2>{STATUS_LABEL[status]}</h2>
                  <span>{column.length}</span>
                </header>
                {column.length === 0 ? <p className="empty">Nenhuma OS.</p> : null}
                {column.map((order) => (
                  <WorkOrderCard key={order.id} order={order} onMove={move} />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function WorkOrderCard({
  order,
  onMove,
}: {
  order: WorkOrder;
  onMove: (id: string, status: WorkOrderStatus) => void;
}) {
  return (
    <article className="os-ticket">
      <Link to={`/painel/os/${order.id}`} className="os-ticket__link">
        <span className="os-ticket__code">{order.id}</span>
        <strong>{order.customerName}</strong>
        <p>
          {order.itemName}
          {order.itemRef ? ` · ${order.itemRef}` : ''}
        </p>
        <p>{order.defect}</p>
      </Link>
      <div className="os-ticket__meta">
        <span className={`os-priority os-priority--${order.priority}`}>
          {PRIORITY_LABEL[order.priority]}
        </span>
        {order.quoteStatus !== 'none' ? (
          <span className={`os-quote os-quote--${order.quoteStatus}`}>
            {QUOTE_STATUS_LABEL[order.quoteStatus]}
          </span>
        ) : null}
        <span>{order.technician || 'Sem técnico'}</span>
        <span>{when(order.updatedAt)}</span>
        <span>{money(workOrderTotal(order))}</span>
      </div>
      <div className="os-ticket__move">
        <AdminPicker
          label="Mover"
          value={order.status}
          options={[
            ...BOARD_COLUMNS.map((status) => ({
              value: status,
              label: STATUS_LABEL[status],
            })),
            { value: 'delivered', label: STATUS_LABEL.delivered },
            { value: 'cancelled', label: STATUS_LABEL.cancelled },
          ]}
          onChange={(value) => onMove(order.id, value as WorkOrderStatus)}
        />
      </div>
    </article>
  );
}
