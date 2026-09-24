import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { matchesQuery } from '../../components/CrudKit';
import { getAdminState, STOCK_EVENT } from '../../data/adminStore';
import { money } from '../../data/financeBook';
import {
  applyStockMovement,
  listStockMovements,
  setStockQtyAbsolute,
  STOCK_MOVE_LABEL,
  STOCK_MOVEMENTS_EVENT,
  type StockMoveType,
} from '../../data/stockLedger';

const MOVE_OPTIONS: { value: StockMoveType; label: string; direction: 1 | -1 }[] = [
  { value: 'purchase', label: 'Compra / entrada com custo', direction: 1 },
  { value: 'entry', label: 'Entrada manual', direction: 1 },
  { value: 'return', label: 'Devolução / estorno', direction: 1 },
  { value: 'sale', label: 'Venda (baixa)', direction: -1 },
  { value: 'exit', label: 'Saída manual', direction: -1 },
  { value: 'os', label: 'Consumo OS', direction: -1 },
  { value: 'transfer', label: 'Transferência (saída)', direction: -1 },
  { value: 'adjust', label: 'Ajuste / inventário (definir saldo)', direction: 1 },
];

export function StockMovementsPage() {
  const [stock, setStock] = useState(() => getAdminState().stock);
  const [movements, setMovements] = useState(() => listStockMovements(300));
  const [stockId, setStockId] = useState(stock[0]?.id ?? '');
  const [moveType, setMoveType] = useState<StockMoveType>('purchase');
  const [qty, setQty] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | StockMoveType>('all');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function refresh() {
    setStock(getAdminState().stock);
    setMovements(listStockMovements(300));
  }

  useEffect(() => {
    function onChange() {
      refresh();
    }
    window.addEventListener(STOCK_EVENT, onChange);
    window.addEventListener(STOCK_MOVEMENTS_EVENT, onChange);
    return () => {
      window.removeEventListener(STOCK_EVENT, onChange);
      window.removeEventListener(STOCK_MOVEMENTS_EVENT, onChange);
    };
  }, []);

  const selected = stock.find((item) => item.id === stockId) ?? null;
  const moveMeta = MOVE_OPTIONS.find((item) => item.value === moveType) ?? MOVE_OPTIONS[0];
  const isInventory = moveType === 'adjust';

  const visible = useMemo(() => {
    return movements.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      return matchesQuery(`${item.stockName} ${item.sku} ${item.note} ${item.refId ?? ''}`, query);
    });
  }, [movements, typeFilter, query]);

  function submit() {
    setError('');
    setMessage('');
    if (!stockId) {
      setError('Selecione o produto.');
      return;
    }
    const qtyNum = Number(qty.replace(',', '.'));
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      setError('Quantidade inválida.');
      return;
    }

    if (isInventory) {
      const result = setStockQtyAbsolute(stockId, qtyNum, note || 'Ajuste de inventário');
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`Saldo de ${result.item.name} ajustado para ${result.item.qty}.`);
      setNote('');
      refresh();
      return;
    }

    const cost =
      unitCost.trim() === ''
        ? selected?.avgCost || selected?.cost || 0
        : Number(unitCost.replace(',', '.'));
    if (!Number.isFinite(cost) || cost < 0) {
      setError('Custo unitário inválido.');
      return;
    }

    const result = applyStockMovement({
      stockId,
      type: moveType,
      qty: qtyNum,
      direction: moveMeta.direction,
      unitCost: cost,
      note: note || STOCK_MOVE_LABEL[moveType],
      skipAvgCost: moveMeta.direction !== 1 || moveType === 'return',
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(
      `${STOCK_MOVE_LABEL[moveType]} · ${result.item.name} · saldo ${result.item.qty}${
        moveType === 'purchase' ? ` · custo médio ${money(result.item.avgCost)}` : ''
      }.`,
    );
    setQty('1');
    setNote('');
    refresh();
  }

  return (
    <section className="admin-page">
      <p className="empty" style={{ marginTop: 0 }}>
        Entradas, saídas, compras (atualizam custo médio e última compra), vendas e inventário.
        Consulte o{' '}
        <Link to="/erp/balanco">balanço</Link> para mínimos, máximos, markup e margem.
      </p>

      <article className="admin-card">
        <h2>Lançar movimento</h2>
        <div className="admin-form">
          <AdminPicker
            label="Produto"
            value={stockId}
            placeholder="Selecionar…"
            options={stock.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.sku} (${item.qty})`,
            }))}
            onChange={(value) => {
              setStockId(value);
              const hit = stock.find((item) => item.id === value);
              if (hit) setUnitCost(String(hit.avgCost || hit.cost || 0));
            }}
          />
          <AdminPicker
            label="Tipo"
            value={moveType}
            options={MOVE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
            onChange={(value) => setMoveType(value as StockMoveType)}
          />
          <label>
            {isInventory ? 'Saldo alvo' : 'Quantidade'}
            <input
              type="number"
              min={0}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>
          {!isInventory ? (
            <label>
              Custo unitário
              <input
                type="number"
                min={0}
                step={0.01}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder={
                  selected
                    ? String(selected.avgCost || selected.cost || 0)
                    : '0'
                }
              />
            </label>
          ) : null}
          <label className="span-2">
            Observação
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="NF, OS, inventário…"
            />
          </label>
        </div>
        {selected ? (
          <p className="empty">
            Saldo atual {selected.qty} · mín {selected.minQty} · máx {selected.maxQty} · custo médio{' '}
            {money(selected.avgCost || selected.cost)} · última compra{' '}
            {selected.lastPurchaseCost ? money(selected.lastPurchaseCost) : '—'}
            {selected.lastPurchaseAt
              ? ` em ${new Date(selected.lastPurchaseAt).toLocaleDateString('pt-BR')}`
              : ''}
          </p>
        ) : null}
        {error ? (
          <p className="qty-low" role="alert">
            {error}
          </p>
        ) : null}
        {message ? <p className="empty">{message}</p> : null}
        <div className="admin-toolbar" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Confirmar movimento
          </button>
          <Link to="/erp/balanco" className="btn btn--ghost">
            Ver balanço
          </Link>
        </div>
      </article>

      <article className="admin-card">
        <div className="admin-toolbar crud-bar">
          <label className="admin-field crud-filter-field" style={{ flex: '1 1 260px' }}>
            Buscar
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Produto, SKU, nota ou referência"
            />
          </label>
          <label className="admin-field crud-filter-field" style={{ flex: '0 0 200px' }}>
            Tipo
            <AdminPicker
              compact
              label="Tipo"
              value={typeFilter}
              options={[
                { value: 'all', label: 'Todos' },
                ...Object.entries(STOCK_MOVE_LABEL).map(([value, label]) => ({ value, label })),
              ]}
              onChange={(value) => setTypeFilter(value as 'all' | StockMoveType)}
            />
          </label>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Produto</th>
              <th>Tipo</th>
              <th>Qtd</th>
              <th>Custo un.</th>
              <th>Saldo</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  Nenhum movimento registrado ainda. Lance uma compra ou ajuste acima.
                </td>
              </tr>
            ) : (
              visible.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                  <td>
                    {item.stockName}
                    <div className="empty">{item.sku}</div>
                  </td>
                  <td>{STOCK_MOVE_LABEL[item.type]}</td>
                  <td className={item.direction < 0 ? 'qty-low' : ''}>
                    {item.direction > 0 ? '+' : '−'}
                    {item.qty}
                  </td>
                  <td>{money(item.unitCost)}</td>
                  <td>{item.balanceAfter}</td>
                  <td>
                    {item.note || '—'}
                    {item.refId ? <div className="empty">{item.refId}</div> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
