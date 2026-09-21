import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import {
  CHANNEL_LABEL,
  formatElapsed,
  KITCHEN_EVENT,
  kitchenOrderElapsed,
  listKitchenOrders,
  updateKitchenStatus,
  type KitchenOrder,
  type KitchenStatus,
} from '../../data/kitchenOrderStore';
import { getTotemExitPassword } from '../../data/totemSettings';
import './cozinha.css';

const COLUMNS: { id: KitchenStatus; title: string; action?: KitchenStatus; actionLabel?: string }[] = [
  { id: 'queued', title: 'Na fila', action: 'preparing', actionLabel: 'Iniciar' },
  { id: 'preparing', title: 'Em preparo', action: 'ready', actionLabel: 'Pronto' },
  { id: 'ready', title: 'Pronto / retirar', action: 'delivered', actionLabel: 'Entregue' },
];

function OrderCard({
  order,
  action,
  actionLabel,
  tick,
}: {
  order: KitchenOrder;
  action?: KitchenStatus;
  actionLabel?: string;
  tick: number;
}) {
  const elapsed = kitchenOrderElapsed(order);
  void tick;
  const urgent = elapsed >= 10 * 60;

  return (
    <article className={`kds-card ${urgent ? 'is-urgent' : ''}`}>
      <header className="kds-card__head">
        <strong className="kds-card__senha">#{order.senha}</strong>
        <span className="kds-card__time">{formatElapsed(elapsed)}</span>
      </header>
      <p className="kds-card__meta">
        <em>{CHANNEL_LABEL[order.channel]}</em>
        {order.tableLabel ? <span>· {order.tableLabel}</span> : null}
        {order.customerName ? <span>· {order.customerName}</span> : null}
      </p>
      <ul className="kds-card__lines">
        {order.lines.map((line) => (
          <li key={line.id}>
            <strong>{line.qty}×</strong> {line.name}
            {line.detail ? <small>{line.detail}</small> : null}
            {line.note ? <small className="is-note">{line.note}</small> : null}
          </li>
        ))}
      </ul>
      {order.note ? <p className="kds-card__note">{order.note}</p> : null}
      <div className="kds-card__actions">
        {action && actionLabel ? (
          <button
            type="button"
            className="kds-btn kds-btn--primary"
            onClick={() => updateKitchenStatus(order.id, action)}
          >
            {actionLabel}
          </button>
        ) : null}
        {order.status !== 'cancelled' && order.status !== 'delivered' ? (
          <button
            type="button"
            className="kds-btn kds-btn--ghost"
            onClick={() => updateKitchenStatus(order.id, 'cancelled')}
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function CozinhaPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState(() => listKitchenOrders({ activeOnly: true }));
  const [tick, setTick] = useState(0);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      setOrders(listKitchenOrders({ activeOnly: true }));
    }
    window.addEventListener(KITCHEN_EVENT, refresh);
    window.addEventListener('storage', refresh);
    const timer = window.setInterval(() => {
      refresh();
      setTick((value) => value + 1);
    }, 5000);
    return () => {
      window.removeEventListener(KITCHEN_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.clearInterval(timer);
    };
  }, []);

  const byColumn = useMemo(() => {
    const map: Record<string, KitchenOrder[]> = {
      queued: [],
      preparing: [],
      ready: [],
    };
    for (const order of orders) {
      if (map[order.status]) map[order.status].push(order);
    }
    return map;
  }, [orders]);

  function confirmExit(event: FormEvent) {
    event.preventDefault();
    if (exitPassword.trim() !== getTotemExitPassword()) {
      setExitError('Senha incorreta.');
      return;
    }
    navigate('/');
  }

  return (
    <div className="kds-app">
      <header className="kds-app__top">
        <BrandLogo variant="mark" className="kds-app__mark" />
        <div className="kds-app__brand">
          <strong>Marthi Cozinha</strong>
          <span>Fila ao vivo · mesa · totem · balcão</span>
        </div>
        <div className="kds-app__stats">
          <span>
            Fila <strong>{byColumn.queued.length}</strong>
          </span>
          <span>
            Preparo <strong>{byColumn.preparing.length}</strong>
          </span>
          <span>
            Pronto <strong>{byColumn.ready.length}</strong>
          </span>
        </div>
        <Link to="/mesa" className="kds-app__link">
          Mesas
        </Link>
        <button type="button" className="kds-app__exit" onClick={() => setExitOpen(true)}>
          Sair
        </button>
      </header>

      <div className="kds-board">
        {COLUMNS.map((column) => (
          <section key={column.id} className="kds-col" data-status={column.id}>
            <header className="kds-col__head">
              <h2>{column.title}</h2>
              <span>{byColumn[column.id]?.length ?? 0}</span>
            </header>
            <div className="kds-col__list">
              {(byColumn[column.id] ?? []).map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  action={column.action}
                  actionLabel={column.actionLabel}
                  tick={tick}
                />
              ))}
              {!(byColumn[column.id] ?? []).length ? (
                <p className="kds-empty">Nenhum pedido</p>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      {exitOpen ? (
        <div className="kds-lock" role="dialog" aria-modal="true">
          <form className="kds-lock__card" onSubmit={confirmExit}>
            <h2>Saída protegida</h2>
            <p>Digite a senha da loja para sair da tela da cozinha.</p>
            {exitError ? <p className="kds-alert">{exitError}</p> : null}
            <label>
              Senha
              <input
                type="password"
                value={exitPassword}
                onChange={(e) => setExitPassword(e.target.value)}
                autoFocus
              />
            </label>
            <div className="kds-lock__actions">
              <button type="button" onClick={() => setExitOpen(false)}>
                Cancelar
              </button>
              <button type="submit">Sair</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
