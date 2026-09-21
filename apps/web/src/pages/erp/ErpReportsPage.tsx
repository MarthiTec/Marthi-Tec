import { Link } from 'react-router-dom';
import { getAdminState } from '../../data/adminStore';
import { listEmployees } from '../../data/erpRegistry';
import {
  buildDre,
  money,
  payablesOpenTotal,
  receivablesOpenTotal,
  totalTreasury,
} from '../../data/financeBook';
import {
  listStockMovements,
  STOCK_BALANCE_LABEL,
  stockBalanceSnapshot,
  stockBalanceStatus,
  stockMargin,
} from '../../data/stockLedger';

export function ErpReportsPage() {
  const dre = buildDre();
  const users = listEmployees(true).filter((item) => item.isSystemUser);
  const stock = getAdminState().stock;
  const snap = stockBalanceSnapshot(stock);
  const low = stock.filter((item) => stockBalanceStatus(item) === 'low');
  const recentMoves = listStockMovements(6);

  return (
    <section className="admin-page">
      <p className="empty" style={{ marginTop: 0 }}>
        Demonstrativos rápidos da retaguarda. Para operação detalhada use financeiro, balanço e
        movimentos.
      </p>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>Tesouraria</h2>
          <strong>{money(totalTreasury())}</strong>
          <p>Saldo consolidado das contas.</p>
        </article>
        <article className="admin-card">
          <h2>A receber / a pagar</h2>
          <strong>
            {money(receivablesOpenTotal())} / {money(payablesOpenTotal())}
          </strong>
          <p>Títulos em aberto.</p>
        </article>
        <article className="admin-card">
          <h2>Resultado do mês</h2>
          <strong className={dre.result >= 0 ? 'price-red' : 'qty-low'}>{money(dre.result)}</strong>
          <p>
            Receita {money(dre.revenue)} · despesa {money(dre.expenses)}
          </p>
        </article>
        <article className="admin-card">
          <h2>Estoque a custo</h2>
          <strong>{money(snap.inventory)}</strong>
          <p>
            Venda {money(snap.retail)} · {snap.low} baixos · {snap.over} altos
          </p>
        </article>
      </div>

      <div className="admin-grid" style={{ marginTop: 12 }}>
        <article className="admin-card">
          <div className="admin-toolbar">
            <h2 style={{ margin: 0 }}>Estoque baixo</h2>
            <Link to="/erp/balanco" className="btn btn--ghost">
              Balanço
            </Link>
          </div>
          {low.length === 0 ? (
            <p className="empty">Nenhum item abaixo do mínimo.</p>
          ) : (
            <ul className="empty" style={{ margin: 0, paddingLeft: 18 }}>
              {low.slice(0, 8).map((item) => (
                <li key={item.id}>
                  {item.name} · {item.qty}/{item.minQty} · margem {stockMargin(item)}% ·{' '}
                  {STOCK_BALANCE_LABEL[stockBalanceStatus(item)]}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="admin-card">
          <div className="admin-toolbar">
            <h2 style={{ margin: 0 }}>Últimos movimentos</h2>
            <Link to="/erp/movimentos" className="btn btn--ghost">
              Movimentos
            </Link>
          </div>
          {recentMoves.length === 0 ? (
            <p className="empty">Sem movimentações ainda.</p>
          ) : (
            <ul className="empty" style={{ margin: 0, paddingLeft: 18 }}>
              {recentMoves.map((item) => (
                <li key={item.id}>
                  {item.stockName} · {item.direction > 0 ? '+' : '−'}
                  {item.qty} · saldo {item.balanceAfter}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="admin-card">
          <div className="admin-toolbar">
            <h2 style={{ margin: 0 }}>Usuários do sistema</h2>
            <Link to="/erp/permissoes" className="btn btn--ghost">
              Permissões
            </Link>
          </div>
          {users.length === 0 ? (
            <p className="empty">Nenhum usuário vinculado.</p>
          ) : (
            <ul className="empty" style={{ margin: 0, paddingLeft: 18 }}>
              {users.map((item) => (
                <li key={item.id}>
                  {item.name} · {item.userEmail || item.email} · {item.role}
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div className="admin-toolbar" style={{ marginTop: 12 }}>
        <Link to="/erp/financeiro?tab=dre" className="btn btn--ghost">
          DRE completo
        </Link>
        <Link to="/erp/auditoria" className="btn btn--ghost">
          Auditoria
        </Link>
        <Link to="/erp/boletos" className="btn btn--ghost">
          Boletos
        </Link>
      </div>
    </section>
  );
}
