import { Link } from 'react-router-dom';
import { AdminIcon, type AdminIconName } from '../../components/AdminIcons';
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

/** Relatórios completos da loja (abrem em tela própria, com filtros e impressão). */
const REPORTS: Array<{ to: string; icon: AdminIconName; title: string; text: string }> = [
  { to: '/erp/relatorio-estoque', icon: 'box', title: 'Relatório de estoque', text: 'Aparelhos e variações com fotos, fornecedor, custo, venda e data de entrada. Filtros, colunas e impressão.' },
  { to: '/erp/relatorio-imei', icon: 'barcode', title: 'Estoque por IMEI', text: 'Cada IMEI com modelo, custo, venda, entrada, saída e situação. Histórico do aparelho e baixas.' },
  { to: '/erp/movimentos', icon: 'swap', title: 'Movimentação de estoque', text: 'Entradas, vendas, ajustes e baixas com saldo anterior e novo.' },
  { to: '/erp/balanco', icon: 'clipboard', title: 'Balanço e alertas', text: 'Saldo, mínimo/máximo, custo médio, markup e margem.' },
];

export function ErpReportsPage() {
  const dre = buildDre();
  const users = listEmployees(true).filter((item) => item.isSystemUser);
  const stock = getAdminState().stock;
  const snap = stockBalanceSnapshot(stock);
  const low = stock.filter((item) => stockBalanceStatus(item) === 'low');
  const recentMoves = listStockMovements(6);

  function handleShareWhatsApp() {
    const lines = [
      `📊 *Marthi ERP - Relatório Geral da Operação*`,
      `📅 *Emissão:* ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      '────────────────────────',
      `🏦 *Tesouraria / Saldos:* ${money(totalTreasury())}`,
      `📈 *A Receber (Aberto):* ${money(receivablesOpenTotal())}`,
      `📉 *A Pagar (Aberto):* ${money(payablesOpenTotal())}`,
      `🎯 *Resultado do Mês:* ${money(dre.result)} (Receita: ${money(dre.revenue)} | Despesas: ${money(dre.expenses)})`,
      `📦 *Estoque Total a Custo:* ${money(snap.inventory)} (Venda estimada: ${money(snap.retail)})`,
      `⚠️ *Itens com Estoque Baixo:* ${low.length}`,
      '────────────────────────',
      '_Emitido via Marthi ERP_',
    ];
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank');
  }

  function handleShareEmail() {
    const subject = `Marthi ERP - Relatório Geral da Operação`;
    const lines = [
      `Marthi ERP - Relatório Geral da Operação`,
      `Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`,
      '',
      `Tesouraria / Saldos: ${money(totalTreasury())}`,
      `A Receber (Aberto): ${money(receivablesOpenTotal())}`,
      `A Pagar (Aberto): ${money(payablesOpenTotal())}`,
      `Resultado do Mês: ${money(dre.result)} (Receita: ${money(dre.revenue)} | Despesas: ${money(dre.expenses)})`,
      `Estoque Total a Custo: ${money(snap.inventory)} (Venda estimada: ${money(snap.retail)})`,
      `Itens com Estoque Baixo: ${low.length}`,
      '',
      'Enviado automaticamente pelo Marthi ERP.',
    ];
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }

  return (
    <section className="admin-page">
      <div className="dash-card__head" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="admin-page__title" style={{ margin: 0 }}>Relatórios &amp; Indicadores</h1>
          <p className="empty" style={{ margin: '4px 0 0 0' }}>
            Demonstrativos rápidos da retaguarda financeira, estoque e movimentações da loja.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--primary"
            style={{ fontSize: '0.84rem', padding: '7px 14px' }}
            onClick={handleShareWhatsApp}
            title="Compartilhar indicadores consolidados por WhatsApp"
          >
            📱 Enviar no WhatsApp
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ fontSize: '0.84rem', padding: '7px 14px' }}
            onClick={handleShareEmail}
            title="Enviar relatório por e-mail"
          >
            ✉️ Enviar por E-mail
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ fontSize: '0.84rem', padding: '7px 14px' }}
            onClick={() => window.print()}
            title="Imprimir ou salvar em PDF"
          >
            🖨️ Imprimir Relatório
          </button>
        </div>
      </div>

      <nav className="erp-reports__list" aria-label="Relatórios">
        {REPORTS.map((report) => (
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
