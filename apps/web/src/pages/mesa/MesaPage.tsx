import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import { getAdminState, type StockItem } from '../../data/adminStore';
import {
  CHANNEL_LABEL,
  clearTable,
  enqueueKitchenOrder,
  KITCHEN_EVENT,
  listKitchenOrders,
  listRestaurantTables,
  seatTable,
  type RestaurantTable,
} from '../../data/kitchenOrderStore';
import { getTotemExitPassword } from '../../data/totemSettings';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import './mesa.css';

type DraftLine = {
  key: string;
  stockId: string;
  name: string;
  qty: number;
  note: string;
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function menuItems(stock: StockItem[]) {
  return stock
    .filter((item) => item.qty > 0)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function MesaPage() {
  const navigate = useNavigate();
  const { isDark } = usePanelTheme();
  const [tables, setTables] = useState(() => listRestaurantTables());
  const [activeOrders, setActiveOrders] = useState(() => listKitchenOrders({ activeOnly: true }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<DraftLine[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);

  const stock = useMemo(() => menuItems(getAdminState().stock), []);
  const selected = selectedId ? tables.find((item) => item.id === selectedId) ?? null : null;

  useEffect(() => {
    function refresh() {
      setTables(listRestaurantTables());
      setActiveOrders(listKitchenOrders({ activeOnly: true }));
    }
    window.addEventListener(KITCHEN_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(KITCHEN_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    setGuestName(selected.guestName);
  }, [selected?.id, selected?.guestName]);

  const filteredMenu = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return stock.slice(0, 40);
    return stock
      .filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          item.sku.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [query, stock]);

  function pickTable(table: RestaurantTable) {
    setSelectedId(table.id);
    setMessage(null);
    setError(null);
    setCart([]);
    setNote('');
  }

  function addItem(item: StockItem) {
    setCart((current) => {
      const hit = current.find((line) => line.stockId === item.id && !line.note);
      if (hit) {
        return current.map((line) =>
          line.key === hit.key ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [
        ...current,
        {
          key: `${item.id}-${Date.now()}`,
          stockId: item.id,
          name: item.name,
          qty: 1,
          note: '',
        },
      ];
    });
    setError(null);
  }

  function patchQty(key: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0),
    );
  }

  function sendToKitchen() {
    if (!selected) {
      setError('Escolha uma mesa.');
      return;
    }
    if (!cart.length) {
      setError('Inclua itens no pedido.');
      return;
    }
    try {
      if (selected.status === 'free') {
        seatTable(selected.id, guestName);
      } else if (guestName.trim()) {
        seatTable(selected.id, guestName);
      }
      const order = enqueueKitchenOrder({
        channel: 'mesa',
        tableId: selected.id,
        customerName: guestName.trim() || selected.guestName || `Mesa ${selected.number}`,
        note,
        occupyTable: true,
        lines: cart.map((line) => ({
          name: line.name,
          qty: line.qty,
          note: line.note,
        })),
      });
      setCart([]);
      setNote('');
      setMessage(`Pedido #${order.senha} enviado à cozinha · ${CHANNEL_LABEL.mesa}`);
      setError(null);
      setTables(listRestaurantTables());
      setActiveOrders(listKitchenOrders({ activeOnly: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar.');
    }
  }

  function liberarMesa() {
    if (!selected) return;
    clearTable(selected.id);
    setMessage(`${selected.label} liberada.`);
    setCart([]);
    setGuestName('');
  }

  function confirmExit(event: FormEvent) {
    event.preventDefault();
    if (exitPassword.trim() !== getTotemExitPassword()) {
      setExitError('Senha incorreta.');
      return;
    }
    navigate('/');
  }

  const tableOrders = selected
    ? activeOrders.filter((item) => item.tableId === selected.id)
    : [];

  return (
    <div className={`mesa-app ${isDark ? 'is-theme-dark' : ''}`}>
      <header className="mesa-app__top">
        <BrandLogo variant="mark" className="mesa-app__mark" />
        <div className="mesa-app__brand">
          <strong>Marthi Mesas</strong>
          <span>Garçom · tablet / celular</span>
        </div>
        <Link to="/cozinha" className="mesa-app__link">
          Cozinha
        </Link>
        <button type="button" className="mesa-app__exit" onClick={() => setExitOpen(true)}>
          Sair
        </button>
      </header>

      <div className="mesa-app__shell">
        <section className="mesa-floor" aria-label="Mapa de mesas">
          <header className="mesa-floor__head">
            <div>
              <p className="mesa-kicker">Salão</p>
              <h1>Controle de mesas</h1>
            </div>
            <p className="mesa-floor__legend">
              <i className="is-free" /> Livre
              <i className="is-busy" /> Ocupada
              <i className="is-pick" /> Selecionada
            </p>
          </header>
          <div className="mesa-floor__grid">
            {tables.map((table) => {
              const busy = table.status !== 'free';
              const active = table.id === selectedId;
              return (
                <button
                  key={table.id}
                  type="button"
                  className={`mesa-tile ${busy ? 'is-busy' : 'is-free'} ${active ? 'is-active' : ''}`}
                  onClick={() => pickTable(table)}
                >
                  <strong>{table.number}</strong>
                  <span>{table.seats} lugares</span>
                  {busy ? <em>{table.guestName || 'Ocupada'}</em> : <em>Livre</em>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mesa-order" aria-label="Pedido da mesa">
          {!selected ? (
            <div className="mesa-order__empty">
              <h2>Toque em uma mesa</h2>
              <p>Monte o pedido e envie direto para a fila da cozinha.</p>
            </div>
          ) : (
            <>
              <header className="mesa-order__head">
                <div>
                  <p className="mesa-kicker">{selected.label}</p>
                  <h2>Pedido do salão</h2>
                </div>
                <button type="button" className="mesa-btn mesa-btn--ghost" onClick={liberarMesa}>
                  Liberar mesa
                </button>
              </header>

              <label className="mesa-field">
                Nome do cliente
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Opcional · ajuda na chamada"
                />
              </label>

              <label className="mesa-field">
                Buscar cardápio
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nome ou código…"
                />
              </label>

              <div className="mesa-menu">
                {filteredMenu.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="mesa-menu__item"
                    onClick={() => addItem(item)}
                  >
                    <strong>{item.name}</strong>
                    <span>{money(item.price)}</span>
                  </button>
                ))}
                {!filteredMenu.length ? <p className="mesa-muted">Nenhum item no estoque.</p> : null}
              </div>

              <div className="mesa-cart">
                <h3>Comanda</h3>
                {!cart.length ? <p className="mesa-muted">Vazia — toque nos itens acima.</p> : null}
                {cart.map((line) => (
                  <div key={line.key} className="mesa-cart__line">
                    <div>
                      <strong>{line.name}</strong>
                    </div>
                    <div className="mesa-cart__qty">
                      <button type="button" onClick={() => patchQty(line.key, -1)}>
                        −
                      </button>
                      <span>{line.qty}</span>
                      <button type="button" onClick={() => patchQty(line.key, 1)}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
                <label className="mesa-field">
                  Observação para a cozinha
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Sem cebola, ponto da carne…"
                  />
                </label>
              </div>

              {tableOrders.length ? (
                <div className="mesa-open">
                  <h3>Já na cozinha</h3>
                  {tableOrders.map((order) => (
                    <p key={order.id}>
                      <strong>#{order.senha}</strong> · {order.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}
                    </p>
                  ))}
                </div>
              ) : null}

              {error ? <p className="mesa-alert">{error}</p> : null}
              {message ? <p className="mesa-ok">{message}</p> : null}

              <button type="button" className="mesa-btn mesa-btn--primary" onClick={sendToKitchen}>
                Enviar para cozinha
              </button>
            </>
          )}
        </section>
      </div>

      {exitOpen ? (
        <div className="mesa-lock" role="dialog" aria-modal="true">
          <form className="mesa-lock__card" onSubmit={confirmExit}>
            <h2>Saída protegida</h2>
            <p>Digite a senha da loja para sair do controle de mesas.</p>
            {exitError ? <p className="mesa-alert">{exitError}</p> : null}
            <label className="mesa-field">
              Senha
              <input
                type="password"
                value={exitPassword}
                onChange={(e) => setExitPassword(e.target.value)}
                autoFocus
              />
            </label>
            <div className="mesa-lock__actions">
              <button type="button" className="mesa-btn mesa-btn--ghost" onClick={() => setExitOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="mesa-btn mesa-btn--primary">
                Sair
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
