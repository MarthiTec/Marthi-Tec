import { Link, Navigate, useLocation } from 'react-router-dom';
import { HubPage, type HubTab } from '../../components/HubPage';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessPath, userIsStoreAdmin } from '../../data/erpRegistry';
import { hubFullAccess, STOCK_SPECS_PARAM, type StockSpecsTab, type StockTab } from '../../data/hubPaths';
import { SpecificationsPage } from './SpecificationsPage';
import { StockEntryPage } from './StockEntryPage';
import { StockPage } from './StockPage';
import { StockBalancePage } from '../erp/StockBalancePage';
import { StockMovementsPage } from '../erp/StockMovementsPage';

const TABS: Array<HubTab<StockTab> & { legacy: string | string[] }> = [
  {
    id: 'produtos',
    label: 'Produtos',
    icon: 'box',
    legacy: '/erp/produtos',
    hint: 'Cadastro de produtos e estoque. Kits, lotes e almoxarifado ficam na aba Especificações.',
    render: () => <StockPage />,
  },
  {
    id: 'movimentacoes',
    label: 'Movimentações',
    icon: 'swap',
    legacy: '/erp/movimentos',
    hint: 'Entradas, saídas, compras, vendas e ajustes pontuais de saldo.',
    render: () => <StockMovementsPage />,
  },
  {
    id: 'entradas',
    label: 'Entradas',
    icon: 'inbox',
    legacy: '/erp/entrada-estoque',
    hint: 'Lançar compra/entrada com IMEI e custo. Sem o produto no cadastro? Use Cadastrar produto nesta aba.',
    render: () => <StockEntryPage />,
  },
  {
    id: 'ajustes',
    label: 'Ajustes',
    icon: 'clipboard',
    legacy: '/erp/balanco',
    hint: 'Inventário físico (balanço). Ajuste pontual de quantidade fica em Movimentações → tipo Ajuste.',
    render: () => <StockBalancePage />,
  },
  {
    id: 'especificacoes',
    label: 'Especificações',
    icon: 'tag',
    // Qualquer um destes paths libera a aba (admin da loja já vê tudo via hubFullAccess).
    legacy: ['/erp/especificacoes', '/erp/kits', '/erp/lotes', '/erp/almoxarifado', '/painel/especificacoes'],
    hint: 'Marcas, atributos, grupos e retirada — mais kits, lotes e almoxarifados. Cadastro do produto continua enxuto na aba Produtos.',
    render: () => <SpecificationsPage embedded includeSupportResources />,
  },
];

/** Redireciona rotas legadas (entrada/balanço/movimentos) para a aba do hub, preservando state. */
export function RedirectToProductsStock({ aba }: { aba: StockTab }) {
  const location = useLocation();
  const base = location.pathname.startsWith('/painel') ? '/painel/produtos' : '/erp/produtos';
  return <Navigate to={`${base}?aba=${aba}`} replace state={location.state} />;
}

const STOCK_SPECS_TABS = new Set<StockSpecsTab>([
  'marcas',
  'tipos',
  'modelos',
  'atributos',
  'grupos',
  'retirada',
  'kits',
  'lotes',
  'almoxarifado',
]);

/** Kits / Lotes / Almox / marcas… → hub Produtos & Estoque → aba Especificações (+ `espec=`). */
export function RedirectToProductsStockSpecs({ espec }: { espec?: StockSpecsTab } = {}) {
  const location = useLocation();
  const base = location.pathname.startsWith('/painel') ? '/painel/produtos' : '/erp/produtos';
  // Rotas legadas `/especificacoes?aba=marcas` → hub `?aba=especificacoes&espec=marcas`.
  const legacyAba = new URLSearchParams(location.search).get('aba');
  const tab =
    espec ??
    (legacyAba && STOCK_SPECS_TABS.has(legacyAba as StockSpecsTab)
      ? (legacyAba as StockSpecsTab)
      : undefined);
  const to = tab
    ? `${base}?aba=especificacoes&${STOCK_SPECS_PARAM}=${tab}`
    : `${base}?aba=especificacoes`;
  return <Navigate to={to} replace state={location.state} />;
}

function canAccessLegacy(legacy: string | string[], email: string | undefined, full: boolean) {
  if (full) return true;
  const paths = Array.isArray(legacy) ? legacy : [legacy];
  return paths.some((path) => canAccessPath(path, email));
}

/**
 * Área de trabalho Produtos & Estoque: abas sobre as telas já existentes
 * (StockPage, movimentos, entrada, balanço, especificações) — sem mudar regras de negócio.
 */
export function ProductsStockPage() {
  const { user } = useAuth();
  const full = hubFullAccess(user?.role, userIsStoreAdmin(user?.email));
  const allowed = TABS.filter((tab) => {
    if (tab.id === 'produtos') {
      return (
        full ||
        canAccessPath('/erp/produtos', user?.email) ||
        canAccessPath('/painel/produtos', user?.email)
      );
    }
    return canAccessLegacy(tab.legacy, user?.email, full);
  });
  if (allowed.length === 0) {
    return <p className="empty">Sem permissão para Produtos & Estoque.</p>;
  }
  return (
    <HubPage
      icon="box"
      title="Produtos & Estoque"
      subtitle="Cadastros, entradas, movimentos, inventário e especificações numa área só — sem voltar ao menu a cada passo."
      tabs={allowed}
      aside={
        <div className="hub-head__aside-links" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/painel/solicitacoes-compra" className="btn btn--ghost">
            Solicitações
          </Link>
          <Link to="/erp" className="btn btn--ghost">
            Retaguarda completa
          </Link>
        </div>
      }
    />
  );
}
