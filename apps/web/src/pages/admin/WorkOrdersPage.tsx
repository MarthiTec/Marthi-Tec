import { useMemo, useRef, useState, type DragEvent } from 'react';
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

const DROP_STATUSES: WorkOrderStatus[] = [...BOARD_COLUMNS, 'delivered'];

export function WorkOrdersPage() {
  const [params] = useSearchParams();
  const statusFilter = params.get('status') as WorkOrderStatus | null;
  const quoteFilter = params.get('quote') as QuoteStatus | null;
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState(() => listWorkOrders());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<WorkOrderStatus | null>(null);

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

  const columns = statusFilter && BOARD_COLUMNS.includes(statusFilter) ? [statusFilter] : BOARD_COLUMNS;
  const showKanban = quoteFilter !== 'sent';

  function move(id: string, status: WorkOrderStatus) {
    const current = orders.find((item) => item.id === id);
    if (!current || current.status === status) return;
    updateWorkOrder(id, { status });
    setOrders(listWorkOrders());
  }

  function onDragStart(orderId: string) {
    setDraggingId(orderId);
  }

  function onDragEnd() {
    setDraggingId(null);
    setOverStatus(null);
  }

  function onDrop(status: WorkOrderStatus) {
    if (draggingId) move(draggingId, status);
    onDragEnd();
  }

  return (
    <section className="admin-page">
      <div className="admin-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar OS, cliente ou item…"
        />
        <Link to="/os/nova" className="btn btn--primary">
          Nova OS
        </Link>
        <Link to="/os/agenda" className="btn btn--ghost">
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
            <Link to="/os?quote=sent">Ver lista</Link>
          </p>
        </article>
      </div>

      {showKanban ? (
        <p className="empty os-board-hint">Arraste o card para a próxima coluna · estilo Jira</p>
      ) : null}

      {quoteFilter === 'sent' ? (
        <article className="admin-card">
          <h2>Aguardando aprovação do cliente</h2>
          <p>Orçamentos enviados — registre a resposta do cliente no detalhe da OS.</p>
          {filtered.length === 0 ? <p className="empty">Nenhum orçamento pendente.</p> : null}
          <div className="os-board" style={{ gridTemplateColumns: '1fr' }}>
            {filtered.map((order) => (
              <WorkOrderCard
                key={order.id}
                order={order}
                onMove={move}
                dragging={draggingId === order.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            ))}
          </div>
          <div className="admin-toolbar" style={{ marginTop: 12 }}>
            <Link to="/os" className="btn btn--ghost">
              Voltar ao quadro
            </Link>
          </div>
        </article>
      ) : (
        <div className="os-board">
          {columns.map((status) => {
            const column = filtered.filter((item) => item.status === status);
            return (
              <BoardColumn
                key={status}
                status={status}
                orders={column}
                isOver={overStatus === status}
                draggingId={draggingId}
                onDragOver={() => setOverStatus(status)}
                onDragLeave={() => setOverStatus((current) => (current === status ? null : current))}
                onDrop={() => onDrop(status)}
                onMove={move}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function BoardColumn({
  status,
  orders,
  isOver,
  draggingId,
  onDragOver,
  onDragLeave,
  onDrop,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  status: WorkOrderStatus;
  orders: WorkOrder[];
  isOver: boolean;
  draggingId: string | null;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onMove: (id: string, status: WorkOrderStatus) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  function handleDragOver(event: DragEvent) {
    if (!DROP_STATUSES.includes(status)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    onDragOver();
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    onDrop();
  }

  return (
    <section
      className={`os-col ${isOver ? 'is-drop-target' : ''} ${draggingId ? 'is-dragging-board' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
    >
      <header className="os-col__head">
        <h2>{STATUS_LABEL[status]}</h2>
        <span>{orders.length}</span>
      </header>
      {orders.length === 0 ? <p className="empty">Solte aqui</p> : null}
      {orders.map((order) => (
        <WorkOrderCard
          key={order.id}
          order={order}
          onMove={onMove}
          dragging={draggingId === order.id}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ))}
    </section>
  );
}

function WorkOrderCard({
  order,
  onMove,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  order: WorkOrder;
  onMove: (id: string, status: WorkOrderStatus) => void;
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const draggedRef = useRef(false);

  function handleDragStart(event: DragEvent) {
    draggedRef.current = true;
    event.dataTransfer.setData('text/os-id', order.id);
    event.dataTransfer.setData('text/plain', order.id);
    event.dataTransfer.effectAllowed = 'move';
    onDragStart(order.id);
  }

  function handleDragEnd() {
    onDragEnd();
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  }

  return (
    <article
      className={`os-ticket ${dragging ? 'is-dragging' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Link
        to={`/os/${order.id}`}
        className="os-ticket__link"
        draggable={false}
        onClick={(event) => {
          if (draggedRef.current) {
            event.preventDefault();
          }
        }}
      >
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
      <div
        className="os-ticket__move"
        onPointerDown={(event) => event.stopPropagation()}
        onDragStart={(event) => event.preventDefault()}
      >
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
