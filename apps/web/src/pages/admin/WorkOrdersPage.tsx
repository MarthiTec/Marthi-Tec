import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BOARD_COLUMNS,
  listWorkOrders,
  PRIORITY_LABEL,
  STATUS_LABEL,
  updateWorkOrder,
  workOrderTotal,
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
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState(() => listWorkOrders());

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (!statusFilter && item.status === 'cancelled') return false;
      if (!needle) return true;
      return `${item.id} ${item.customerName} ${item.itemName} ${item.technician}`
        .toLowerCase()
        .includes(needle);
    });
  }, [orders, query, statusFilter]);

  const openCount = orders.filter((item) => !['delivered', 'cancelled'].includes(item.status)).length;
  const progressCount = orders.filter((item) => item.status === 'progress').length;
  const readyCount = orders.filter((item) => item.status === 'ready').length;

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
          <h2>Total</h2>
          <strong>{orders.length}</strong>
          <p>Histórico local desta loja.</p>
        </article>
      </div>

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
        <span>{order.technician || 'Sem técnico'}</span>
        <span>{when(order.updatedAt)}</span>
        <span>{money(workOrderTotal(order))}</span>
      </div>
      <label className="os-ticket__move">
        Mover
        <select
          value={order.status}
          onChange={(event) => onMove(order.id, event.target.value as WorkOrderStatus)}
        >
          {BOARD_COLUMNS.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
          <option value="delivered">{STATUS_LABEL.delivered}</option>
          <option value="cancelled">{STATUS_LABEL.cancelled}</option>
        </select>
      </label>
    </article>
  );
}
