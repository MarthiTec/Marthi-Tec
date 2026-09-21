import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { matchesQuery } from '../../components/CrudKit';
import {
  applyPriceTable,
  getAdminState,
  STOCK_KIND_LABEL,
  type StockKind,
} from '../../data/adminStore';
import { money } from '../../data/financeBook';
import {
  STOCK_BALANCE_LABEL,
  stockBalanceSnapshot,
  stockBalanceStatus,
  stockInventoryValue,
  stockMargin,
  stockMarkup,
  stockRetailValue,
  type StockBalanceStatus,
} from '../../data/stockLedger';

type StatusFilter = 'all' | StockBalanceStatus;

function formatDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function StockBalancePage() {
  const [tick, setTick] = useState(0);
  const state = useMemo(() => getAdminState(), [tick]);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | StockKind>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const snapshot = useMemo(() => stockBalanceSnapshot(state.stock), [state.stock]);
  const tables = state.priceTables.filter((item) => item.active);

  const rows = useMemo(() => {
    return state.stock
      .filter((item) => {
        if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
        const status = stockBalanceStatus(item);
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        return matchesQuery(`${item.name} ${item.sku} ${item.barcode}`, query);
      })
      .map((item) => {
        const status = stockBalanceStatus(item);
        const avg = item.avgCost || item.cost || 0;
        return {
          item,
          status,
          avg,
          markup: stockMarkup(item),
          margin: stockMargin(item),
          inventory: stockInventoryValue(item),
          retail: stockRetailValue(item),
        };
      });
  }, [state.stock, kindFilter, statusFilter, query]);

  return (
    <section className="admin-page">
      <p className="empty" style={{ marginTop: 0 }}>
        Balanço do estoque: saldo, mínimos/máximos, custo médio, markup, margem e última compra.
        Movimentações em{' '}
        <Link to="/erp/movimentos">Movimentos</Link> · cadastro em{' '}
        <Link to="/erp/produtos">Produtos</Link> · tipos de preço em{' '}
        <Link to="/erp/tabelas">Tabelas</Link>.
      </p>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>SKUs / unidades</h2>
          <strong>
            {snapshot.skus} · {snapshot.units}
          </strong>
          <p>Cadastro e peças físicas.</p>
        </article>
        <article className="admin-card">
          <h2>Valor a custo</h2>
          <strong>{money(snapshot.inventory)}</strong>
          <p>Saldo × custo médio.</p>
        </article>
        <article className="admin-card">
          <h2>Valor de venda</h2>
          <strong>{money(snapshot.retail)}</strong>
          <p>Saldo × preço base.</p>
        </article>
        <article className="admin-card">
          <h2>Alertas</h2>
          <strong className={snapshot.low || snapshot.empty ? 'qty-low' : ''}>
            {snapshot.low} baixos · {snapshot.over} altos · {snapshot.empty} zerados
          </strong>
          <p>Margem potencial {money(snapshot.potentialMargin)}.</p>
        </article>
      </div>

      <article className="admin-card" style={{ marginTop: 12 }}>
        <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
          <label style={{ flex: '1 1 220px' }}>
            Buscar
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Produto, SKU ou barras…"
            />
          </label>
          <AdminPicker
            compact
            label="Tipo"
            value={kindFilter}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'device', label: STOCK_KIND_LABEL.device },
              { value: 'part', label: STOCK_KIND_LABEL.part },
              { value: 'supply', label: STOCK_KIND_LABEL.supply },
            ]}
            onChange={(value) => setKindFilter(value as 'all' | StockKind)}
          />
          <AdminPicker
            compact
            label="Status"
            value={statusFilter}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'low', label: 'Abaixo do mínimo' },
              { value: 'over', label: 'Acima do máximo' },
              { value: 'empty', label: 'Zerados' },
              { value: 'ok', label: 'OK' },
            ]}
            onChange={(value) => setStatusFilter(value as StatusFilter)}
          />
          <button type="button" className="btn btn--ghost" onClick={() => setTick((n) => n + 1)}>
            Atualizar
          </button>
          <Link to="/erp/movimentos" className="btn btn--primary">
            Novo movimento
          </Link>
        </div>

        {tables.length ? (
          <p className="empty" style={{ marginTop: 8 }}>
            Tipos de preço ativos:{' '}
            {tables
              .map((table) => `${table.name} (${table.percent > 0 ? '+' : ''}${table.percent}%)`)
              .join(' · ')}
          </p>
        ) : null}

        <table className="admin-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Saldo</th>
              <th>Mín / Máx</th>
              <th>Custo méd.</th>
              <th>Últ. compra</th>
              <th>Preço base</th>
              <th>Markup</th>
              <th>Margem</th>
              <th>Valor estoque</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty">
                  Nenhum item neste filtro.
                </td>
              </tr>
            ) : (
              rows.map(({ item, status, avg, markup, margin, inventory }) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <div className="empty">
                      {item.sku}
                      {tables.length
                        ? ` · ${tables
                            .slice(0, 2)
                            .map(
                              (table) =>
                                `${table.name} ${money(applyPriceTable(item.price, table))}`,
                            )
                            .join(' · ')}`
                        : ''}
                    </div>
                  </td>
                  <td className={status === 'low' || status === 'empty' ? 'qty-low' : ''}>
                    {item.qty}
                  </td>
                  <td>
                    {item.minQty} / {item.maxQty || '—'}
                  </td>
                  <td>{money(avg)}</td>
                  <td>
                    {item.lastPurchaseCost
                      ? money(item.lastPurchaseCost)
                      : money(item.cost)}
                    <div className="empty">{formatDate(item.lastPurchaseAt)}</div>
                  </td>
                  <td className="price-red">{money(item.price)}</td>
                  <td>{markup.toLocaleString('pt-BR')}%</td>
                  <td>{margin.toLocaleString('pt-BR')}%</td>
                  <td>{money(inventory)}</td>
                  <td className={status === 'low' || status === 'empty' ? 'qty-low' : ''}>
                    {STOCK_BALANCE_LABEL[status]}
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
