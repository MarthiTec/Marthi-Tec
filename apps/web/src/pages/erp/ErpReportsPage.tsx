import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { getAdminState } from '../../data/adminStore';
import { listEmployees } from '../../data/erpRegistry';
import {
  emptyDre,
  loadDre,
  type DreReport,
  money,
  payablesOpenTotal,
  receivablesOpenTotal,
  totalTreasury,
} from '../../data/financeBook';
import { reportsHubSegments, reportsPathPrefix } from '../../data/reportsHub';
import {
  listStockMovements,
  STOCK_BALANCE_LABEL,
  stockBalanceSnapshot,
  stockBalanceStatus,
  stockMargin,
} from '../../data/stockLedger';
import '../admin/reportsHub.css';

/**
 * Central de Relatórios — catálogo por segmento (Painel `/painel/relatorios`
 * e Retaguarda `/erp/relatorios`). Sem KPIs inventados; empty states honestos.
 */
export function ErpReportsPage() {
  const location = useLocation();
  const prefix = reportsPathPrefix(location.pathname);
  const segments = useMemo(() => reportsHubSegments(prefix), [prefix]);
  const financeDre = prefix === '/erp' ? '/erp/financeiro?tab=dre' : '/painel/financeiro?tab=dre';
  const financeAging = prefix === '/erp' ? '/erp/financeiro?tab=aging' : '/painel/financeiro?tab=aging';
  const balancoTo = prefix === '/erp' ? '/erp/produtos?aba=ajustes' : '/painel/produtos?aba=ajustes';
  const movesTo = prefix === '/erp' ? '/erp/produtos?aba=movimentacoes' : '/painel/produtos?aba=movimentacoes';

  const [dre, setDre] = useState<DreReport>(() => emptyDre());
  useEffect(() => {
    let alive = true;
    loadDre()
      .then((report) => alive && setDre(report))
      .catch(() => alive && setDre(emptyDre()));
    return () => {
      alive = false;
    };
  }, []);
  const users = listEmployees(true).filter((item) => item.isSystemUser);
  const stock = getAdminState().stock;
  const snap = stockBalanceSnapshot(stock);
  const low = stock.filter((item) => stockBalanceStatus(item) === 'low');
  const recentMoves = listStockMovements(6);

  return (
    <section className="admin-page">
      <div className="dash-card__head" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="admin-page__title" style={{ margin: 0 }}>
            Relatórios
          </h1>
          <p className="reports-hub__intro">
            Escolha o segmento e abra um relatório com dados reais da loja. Indicadores abaixo vêm do
            livro/estoque carregados — sem números inventados.
          </p>
        </div>
      </div>

      <div className="reports-hub__segments">
        {segments.map((segment) => (
          <section key={segment.id} className="reports-hub__segment" aria-labelledby={`reports-seg-${segment.id}`}>
            <div className="reports-hub__segment-head">
              <h2 id={`reports-seg-${segment.id}`}>{segment.title}</h2>
              <p>{segment.blurb}</p>
            </div>
            <nav className="reports-hub__list" aria-label={segment.title}>
              {segment.links.map((report) => (
                <Link
                  key={`${segment.id}-${report.to}-${report.title}`}
                  to={report.to}
                  className={`reports-hub__item${report.kind === 'ops' ? ' reports-hub__item--ops' : ''}`}
                >
                  <AdminIcon name={report.icon} />
                  <span>
                    <strong>{report.title}</strong>
                    <small>{report.text}</small>
                  </span>
                </Link>
              ))}
            </nav>
            {segment.unavailable ? (
              <p className="reports-hub__unavailable" role="status">
                {segment.unavailable}
              </p>
            ) : null}
          </section>
        ))}
      </div>

      <div className="reports-hub__kpis">
        <p className="reports-hub__kpi-note">
          Snapshot rápido (tesouraria / títulos / livro / estoque). Recebido ≠ receita de vendas.
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
            <p>Títulos em aberto (saldo a receber ≠ receita de vendas).</p>
          </article>
          <article className="admin-card">
            <h2>Resultado do mês (livro)</h2>
            <strong className={dre.result >= 0 ? 'price-red' : 'qty-low'}>{money(dre.result)}</strong>
            <p>
              Entradas do livro {money(dre.revenue)} · saídas {money(dre.expenses)}
            </p>
            <Link to={financeDre} className="btn btn--ghost" style={{ marginTop: 8 }}>
              Abrir DRE
            </Link>
          </article>
          <article className="admin-card">
            <h2>Estoque a custo</h2>
            <strong>{money(snap.inventory)}</strong>
            <p>
              Venda {money(snap.retail)} · {snap.low} baixos · {snap.over} altos
            </p>
          </article>
        </div>
      </div>

      <div className="admin-grid" style={{ marginTop: 12 }}>
        <article className="admin-card">
          <div className="admin-toolbar">
            <h2 style={{ margin: 0 }}>Estoque baixo</h2>
            <Link to={balancoTo} className="btn btn--ghost">
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
            <Link to={movesTo} className="btn btn--ghost">
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
            <Link to="/painel/usuarios" className="btn btn--ghost">
              Usuários
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

      <div className="admin-toolbar" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
        <Link to="/painel/relatorio-vendas" className="btn btn--ghost">
          Vendas &amp; Metas
        </Link>
        <Link to={financeDre} className="btn btn--ghost">
          DRE completo
        </Link>
        <Link to={financeAging} className="btn btn--ghost">
          Aging AR/AP
        </Link>
        <Link to="/painel/os/pecas?aba=relatorio" className="btn btn--ghost">
          Peças OS
        </Link>
        <Link to="/painel/auditoria" className="btn btn--ghost">
          Auditoria
        </Link>
      </div>
    </section>
  );
}
