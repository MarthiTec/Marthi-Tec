import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon, type AdminIconName } from '../../components/AdminIcons';
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
import {
  listStockMovements,
  STOCK_BALANCE_LABEL,
  stockBalanceSnapshot,
  stockBalanceStatus,
  stockMargin,
} from '../../data/stockLedger';

/** Catálogo gerencial — deep-links para telas existentes (sem relatório novo). */
const REPORTS: Array<{ to: string; icon: AdminIconName; title: string; text: string; kind?: 'ops' }> = [
  {
    to: '/painel/relatorio-vendas',
    icon: 'chart',
    title: 'Vendas & Metas',
    text: 'Receita de vendas concluídas, ticket, meta e lucro (quando permitido). Filtros, PDF e Excel autenticado.',
  },
  {
    to: '/painel/metas',
    icon: 'chart',
    title: 'Metas & Comissões',
    text: 'Cadastro e acompanhamento de metas por vendedor — gestão, não tabela de vendas.',
  },
  {
    to: '/erp/financeiro?tab=dre',
    icon: 'wallet',
    title: 'Financeiro / DRE',
    text: 'Livro de receitas e despesas do período. Separado da receita de vendas faturadas.',
  },
  {
    to: '/erp/financeiro?tab=aging',
    icon: 'chart',
    title: 'Aging a receber / a pagar',
    text: 'Saldo em aberto por vencimento (due_date real). Capital de giro — não é receita de vendas.',
  },
  {
    to: '/erp/relatorio-estoque',
    icon: 'box',
    title: 'Relatório de estoque',
    text: 'Aparelhos e variações com fotos, fornecedor, custo, venda e data de entrada. Filtros e impressão.',
  },
  {
    to: '/erp/relatorio-imei',
    icon: 'barcode',
    title: 'Estoque por IMEI',
    text: 'Cada IMEI com modelo, custo, venda, entrada, saída e situação. Histórico do aparelho e baixas.',
  },
  {
    to: '/painel/os/pecas?aba=relatorio',
    icon: 'wrench',
    title: 'Peças de manutenção (OS)',
    text: 'Consumo de peças da oficina, estoque baixo e encomendas — CSV e impressão.',
  },
  {
    to: '/erp/produtos?aba=movimentacoes',
    icon: 'swap',
    title: 'Movimentação de estoque',
    text: 'Operação (workspace Produtos & Estoque): entradas, vendas, ajustes e baixas.',
    kind: 'ops',
  },
  {
    to: '/erp/produtos?aba=ajustes',
    icon: 'clipboard',
    title: 'Balanço e alertas',
    text: 'Operação (workspace Produtos & Estoque): saldo, mínimo/máximo, markup e margem.',
    kind: 'ops',
  },
];

export function ErpReportsPage() {
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
  const managerial = REPORTS.filter((r) => r.kind !== 'ops');
  const operational = REPORTS.filter((r) => r.kind === 'ops');

  return (
    <section className="admin-page">
      <div className="dash-card__head" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="admin-page__title" style={{ margin: 0 }}>Relatórios &amp; Indicadores</h1>
          <p className="empty" style={{ margin: '4px 0 0 0' }}>
            Catálogo da loja: escolha um relatório para filtrar, imprimir ou exportar. Indicadores rápidos abaixo — sem números inventados.
          </p>
        </div>
      </div>

      <nav className="erp-reports__list" aria-label="Relatórios gerenciais">
        {managerial.map((report) => (
          <Link key={report.to} to={report.to} className="erp-reports__item">
            <AdminIcon name={report.icon} />
            <span>
              <strong>{report.title}</strong>
              <small>{report.text}</small>
            </span>
          </Link>
        ))}
      </nav>

      <h2 className="admin-page__title" style={{ fontSize: '1rem', margin: '20px 0 8px' }}>
        Operação (não são relatórios gerenciais)
      </h2>
      <nav className="erp-reports__list" aria-label="Operação de estoque">
        {operational.map((report) => (
          <Link key={report.to} to={report.to} className="erp-reports__item">
            <AdminIcon name={report.icon} />
            <span>
              <strong>{report.title}</strong>
              <small>{report.text}</small>
            </span>
          </Link>
        ))}
      </nav>

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
          <Link to="/erp/financeiro?tab=dre" className="btn btn--ghost" style={{ marginTop: 8 }}>
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

      <div className="admin-grid" style={{ marginTop: 12 }}>
        <article className="admin-card">
          <div className="admin-toolbar">
            <h2 style={{ margin: 0 }}>Estoque baixo</h2>
            <Link to="/erp/produtos?aba=ajustes" className="btn btn--ghost">
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
            <Link to="/erp/produtos?aba=movimentacoes" className="btn btn--ghost">
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

      <div className="admin-toolbar" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
        <Link to="/painel/relatorio-vendas" className="btn btn--ghost">
          Vendas &amp; Metas
        </Link>
        <Link to="/erp/financeiro?tab=dre" className="btn btn--ghost">
          DRE completo
        </Link>
        <Link to="/erp/financeiro?tab=aging" className="btn btn--ghost">
          Aging AR/AP
        </Link>
        <Link to="/painel/os/pecas?aba=relatorio" className="btn btn--ghost">
          Peças OS
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
