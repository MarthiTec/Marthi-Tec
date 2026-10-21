import { Link, Navigate, useLocation } from 'react-router-dom';
import { HubPage, type HubTab } from '../../components/HubPage';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessPath, userIsStoreAdmin } from '../../data/erpRegistry';
import { hubFullAccess, type StockTab } from '../../data/hubPaths';
import { StockEntryPage } from './StockEntryPage';
import { StockPage } from './StockPage';
import { StockBalancePage } from '../erp/StockBalancePage';
import { StockMovementsPage } from '../erp/StockMovementsPage';

const TABS: Array<HubTab<StockTab> & { legacy: string }> = [
  {
    id: 'produtos',
    label: 'Produtos',
    icon: 'box',
    legacy: '/erp/produtos',
    hint: 'Cadastro de produtos e estoque. Kits, lotes e almoxarifado ficam na Retaguarda completa.',
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
];

/** Redireciona rotas legadas (entrada/balanço/movimentos) para a aba do hub, preservando state. */
export function RedirectToProductsStock({ aba }: { aba: StockTab }) {
  const location = useLocation();
  return <Navigate to={`/erp/produtos?aba=${aba}`} replace state={location.state} />;
}

/**
 * Área de trabalho Produtos & Estoque: abas sobre as telas já existentes
 * (StockPage, movimentos, entrada, balanço) — sem mudar regras de negócio.
 */
export function ProductsStockPage() {
  const { user } = useAuth();
  const full = hubFullAccess(user?.role, userIsStoreAdmin(user?.email));
  // Produtos e as demais abas usam a mesma capability erp_stock; filtramos por path legado.
  const allowed = TABS.filter((tab) => {
    if (tab.id === 'produtos') return full || canAccessPath('/erp/produtos', user?.email);
    return full || canAccessPath(tab.legacy, user?.email);
  });
  if (allowed.length === 0) {
    return <p className="empty">Sem permissão para Produtos & Estoque.</p>;
  }
  return (
    <HubPage
      icon="box"
      title="Produtos & Estoque"
      subtitle="Cadastros, entradas, movimentos e inventário numa área só — sem voltar ao menu a cada passo."
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
