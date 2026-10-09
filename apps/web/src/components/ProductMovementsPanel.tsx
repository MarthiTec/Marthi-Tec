import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiListProductMovements, type ProductMovement } from '../services/productCatalogApi';

const ORIGIN_LABEL: Record<string, string> = {
  invoice: 'Nota de entrada',
  invoice_reversal: 'Estorno de nota',
  sale: 'Venda (PDV)',
  sale_external: 'Venda externa',
  sale_cancel: 'Venda cancelada',
  pickup_delivery: 'Entrega de encomenda',
  commercial_receipt: 'Recebimento de pedido',
  commercial_delivery: 'Entrega de pedido',
  commercial_reversal: 'Estorno de pedido',
  trade_in: 'Aparelho recebido na troca',
  trade_in_reversal: 'Estorno de troca',
  adjustment: 'Ajuste de estoque',
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

type Filter = 'all' | 'in' | 'out';

/**
 * Últimas entradas e saídas do produto: de quem veio (fornecedor e nota) e para quem foi (cliente).
 */
export function ProductMovementsPanel({ stockId }: { stockId: string | null }) {
  const [rows, setRows] = useState<ProductMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!stockId) return;
    let alive = true;
    setLoading(true);
    setError('');
    apiListProductMovements(stockId, 50)
      .then((data) => alive && setRows(data))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Não foi possível carregar as movimentações.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [stockId]);

  if (!stockId) {
    return (
      <article className="admin-card stock-form-card">
        <h3>Entradas e saídas</h3>
        <p className="empty">Salve o produto para acompanhar as entradas (fornecedor e nota) e as saídas (cliente) dele aqui.</p>
      </article>
    );
  }

  const visible = rows.filter((row) => filter === 'all' || (filter === 'in' ? row.direction === 'in' : row.direction !== 'in'));
  const lastIn = rows.find((row) => row.direction === 'in');
  const lastOut = rows.find((row) => row.direction === 'out');

  return (
    <article className="admin-card stock-form-card product-movements">
      <h3>Entradas e saídas</h3>
      <div className="product-movements__summary">
        <div>
          <span>Última entrada</span>
          <strong>{lastIn ? when(lastIn.at) : '—'}</strong>
          <small>{lastIn?.supplier?.name || (lastIn ? ORIGIN_LABEL[lastIn.origin] ?? lastIn.origin : 'Sem entradas')}</small>
        </div>
        <div>
          <span>Última saída</span>
          <strong>{lastOut ? when(lastOut.at) : '—'}</strong>
          <small>{lastOut?.customer?.name || (lastOut ? ORIGIN_LABEL[lastOut.origin] ?? lastOut.origin : 'Sem saídas')}</small>
        </div>
      </div>
      <div className="product-movements__filters" role="group" aria-label="Filtrar movimentações">
        {([['all', 'Todas'], ['in', 'Entradas'], ['out', 'Saídas']] as const).map(([id, label]) => (
          <button key={id} type="button" className={`stock-attr-pill ${filter === id ? 'is-selected' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      {error ? <p role="alert" className="qty-low">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Movimento</th>
              <th>Qtd</th>
              <th>Custo</th>
              <th>Fornecedor / cliente</th>
              <th>Nota / venda</th>
              <th>Por</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td data-label="Data">{when(row.at)}</td>
                <td data-label="Movimento">
                  <span className={`product-movements__dir is-${row.direction}`}>{row.direction === 'in' ? 'Entrada' : row.direction === 'out' ? 'Saída' : 'Ajuste'}</span>
                  <small className="product-movements__origin">{ORIGIN_LABEL[row.origin] ?? row.origin}</small>
                </td>
                <td data-label="Qtd">{row.qty.toLocaleString('pt-BR')}</td>
                <td data-label="Custo">{row.unitCost ? money(row.unitCost) : '—'}</td>
                <td data-label="Fornecedor / cliente">{row.supplier?.name || row.customer?.name || '—'}</td>
                <td data-label="Nota / venda">
                  {row.invoice ? (
                    <Link to="/erp/notas">NF {row.invoice.number}{row.invoice.series ? `/${row.invoice.series}` : ''}</Link>
                  ) : row.saleId ? (
                    <span title={row.saleId}>Venda {row.saleId.slice(-6).toUpperCase()}</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td data-label="Por">{row.operator || '—'}</td>
              </tr>
            ))}
            {!visible.length ? (
              <tr>
                <td colSpan={7} className="empty">{loading ? 'Carregando…' : 'Nenhuma movimentação ainda.'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </article>
  );
}
