import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminState } from '../../data/adminStore';
import { boletoSnapshot } from '../../data/boletoStore';
import {
  ERP_BOOTSTRAP_EVENT,
  getErpBootstrapState,
} from '../../data/erpBootstrap';
import { listEmployees } from '../../data/erpRegistry';
import {
  getDashboardSnapshot,
  hydrateDashboardFromApi,
  type DashboardSnapshot,
} from '../../data/dashboardStats';
import { money, payablesOpenTotal, receivablesOpenTotal } from '../../data/financeBook';
import { stockBalanceSnapshot } from '../../data/stockLedger';
import { isNestAuthed } from '../../services/nestClient';

const CARDS = [
  {
    to: '/erp/balanco',
    tag: 'Estoque',
    title: 'Balanço e alertas',
    text: 'Saldo, mín/máx, custo médio, markup, margem e última compra.',
  },
  {
    to: '/erp/movimentos',
    tag: 'Estoque',
    title: 'Movimentação',
    text: 'Compras, vendas, OS, inventário e histórico de saldos.',
  },
  {
    to: '/erp/produtos',
    tag: 'Produtos',
    title: 'Cadastro',
    text: 'SKUs, preços, kits, lotes e almoxarifado.',
  },
  {
    to: '/erp/clientes',
    tag: 'Pessoas',
    title: 'Clientes e equipe',
    text: 'Clientes, funcionários, permissões, vendedores e fornecedores.',
  },
  {
    to: '/erp/financeiro',
    tag: 'Financeiro',
    title: 'Hub financeiro',
    text: 'Operação, boletos, conciliação bancária, remessa/retorno CNAB e configurações.',
  },
  {
    to: '/erp/financeiro?section=boletos',
    tag: 'Cobrança',
    title: 'Boletos Pix e híbridos',
    text: 'Emita boleto bancário, Pix ou híbrido e baixe com lançamento no extrato.',
  },
  {
    to: '/erp/financeiro?section=arquivos',
    tag: 'CNAB',
    title: 'Remessa e retorno',
    text: 'Gere remessa, importe retorno e configure pastas/convênio no financeiro.',
  },
  {
    to: '/erp/relatorios',
    tag: 'Retaguarda',
    title: 'Relatórios',
    text: 'Visões rápidas de estoque, financeiro e acessos.',
  },
  {
    to: '/erp/tabelas',
    tag: 'Preço',
    title: 'Tabelas de preço',
    text: 'Tipos de preço (percentuais) sobre o preço base do estoque.',
  },
] as const;

export function ErpHomePage() {
  const [dash, setDash] = useState<DashboardSnapshot>(() => getDashboardSnapshot(7));
  const [ready, setReady] = useState(() => getErpBootstrapState().ready || !isNestAuthed());
  const stock = getAdminState().stock;
  const snap = stockBalanceSnapshot(stock);
  const users = listEmployees(true).filter((item) => item.isSystemUser).length;
  const boletos = boletoSnapshot();

  useEffect(() => {
    const sync = () => setReady(getErpBootstrapState().ready || !isNestAuthed());
    window.addEventListener(ERP_BOOTSTRAP_EVENT, sync);
    return () => window.removeEventListener(ERP_BOOTSTRAP_EVENT, sync);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const next = await hydrateDashboardFromApi(7);
        if (alive) setDash(next);
      } catch {
        if (alive) setDash(getDashboardSnapshot(7));
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready]);

  const skuCount = dash.skuCount ?? snap.skus;
  const stockUnits = dash.stockUnits ?? snap.units;
  const lowStock = dash.lowStock ?? snap.low;
  const receivables = dash.receivablesOpen ?? receivablesOpenTotal();
  const payables = dash.payablesOpen ?? payablesOpenTotal();

  return (
    <div className="erp-home">
      <p className="empty" style={{ margin: 0 }}>
        Retaguarda da loja: cadastros, estoque, financeiro, boletos e relatórios. PDV e fiscal ficam
        nos apps de operação.
      </p>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>SKUs</h2>
          <strong>{skuCount}</strong>
          <p>{stockUnits} unidades em saldo.</p>
        </article>
        <article className="admin-card">
          <h2>Estoque baixo</h2>
          <strong className={lowStock ? 'qty-low' : ''}>{lowStock}</strong>
          <p>
            {snap.over} acima do máx · valor a custo {money(snap.inventory)}
          </p>
        </article>
        <article className="admin-card">
          <h2>A receber</h2>
          <strong>{money(receivables)}</strong>
          <p>Títulos em aberto.</p>
        </article>
        <article className="admin-card">
          <h2>Boletos abertos</h2>
          <strong>{boletos.open}</strong>
          <p>
            {money(boletos.openAmount)} · {users} usuários do sistema
          </p>
        </article>
      </div>

      <div className="erp-home__grid">
        {CARDS.map((card) => (
          <Link key={card.to} to={card.to} className="erp-home__card">
            <em>{card.tag}</em>
            <strong>{card.title}</strong>
            <span>{card.text}</span>
          </Link>
        ))}
      </div>

      <p className="empty" style={{ margin: 0 }}>
        A pagar em aberto: {money(payables)}. Ajustes rápidos de preço e senha ficam no{' '}
        <Link to="/painel/erp">painel administrativo</Link>.
      </p>
    </div>
  );
}
