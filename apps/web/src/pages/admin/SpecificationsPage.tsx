import { Link, useLocation } from 'react-router-dom';
import { HubPage, type HubTab } from '../../components/HubPage';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessPath, userIsStoreAdmin } from '../../data/erpRegistry';
import {
  hubFullAccess,
  productsStockPath,
  STOCK_SPECS_PARAM,
  type SpecsTab,
  type StockSpecsTab,
} from '../../data/hubPaths';
import { AttributesPage } from './AttributesPage';
import { BrandsPage } from './BrandsPage';
import { CatalogModelsPage, CatalogTypesPage } from './CatalogTypesModelsPages';
import { KitsPage } from './KitsPage';
import { LotsPage } from './LotsPage';
import { PickupMethodsPage } from './PickupMethodsPage';
import { ProductGroupsPage } from './ProductGroupsPage';
import { WarehousePage } from './WarehousePage';

const CORE_TABS: Array<HubTab<SpecsTab>> = [
  { id: 'marcas', label: 'Marcas', icon: 'tag', hint: 'Marcas dos produtos, com o ícone que aparece na vitrine do totem.', render: () => <BrandsPage /> },
  { id: 'tipos', label: 'Tipos', icon: 'list', hint: 'Linhas de cada marca (ex.: Samsung › Galaxy A). Marca → Tipo → Modelo monta a descrição do produto.', render: () => <CatalogTypesPage /> },
  { id: 'modelos', label: 'Modelos', icon: 'smartphone', hint: 'Modelos de cada tipo (ex.: Galaxy A › A15). Aparecem no cadastro simplificado do produto.', render: () => <CatalogModelsPage /> },
  { id: 'atributos', label: 'Atributos', icon: 'sliders', hint: 'Cor, capacidade, tamanho… Os valores viram as variações do produto.', render: () => <AttributesPage /> },
  { id: 'grupos', label: 'Grupos', icon: 'apps', hint: 'Grupos e subgrupos (ex.: Bebidas › Cerveja). Você escolhe como chamar cada nível.', render: () => <ProductGroupsPage /> },
  { id: 'retirada', label: 'Tipos de retirada', icon: 'truck', hint: 'Em mãos, encomenda, entrega: como o cliente recebe o produto e o prazo de cada forma.', render: () => <PickupMethodsPage /> },
];

const SUPPORT_TABS: Array<HubTab<Exclude<StockSpecsTab, SpecsTab>>> = [
  { id: 'kits', label: 'Kits', icon: 'layers', hint: 'Montar kits com vários produtos (composições e preços).', render: () => <KitsPage /> },
  { id: 'lotes', label: 'Lotes', icon: 'barcode', hint: 'Lote, validade e rastro para controle de entrada e saída.', render: () => <LotsPage /> },
  { id: 'almoxarifado', label: 'Almoxarifados', icon: 'warehouse', hint: 'Locais de estoque e transferências entre almoxarifados.', render: () => <WarehousePage /> },
];

/**
 * Especificações dos produtos.
 * - Menu / totem: marcas, atributos, grupos e retirada.
 * - Embutido no hub Produtos & Estoque: também Kits, Lotes e Almoxarifados (telas já existentes).
 */
export function SpecificationsPage({
  embedded = false,
  includeSupportResources = false,
}: {
  embedded?: boolean;
  /** Kits / Lotes / Almoxarifados — só no workspace de estoque (não no Totem). */
  includeSupportResources?: boolean;
} = {}) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const totem = pathname.startsWith('/painel/totem');
  // Cada aba respeita a permissão da tela que existia antes dela.
  const legacy: Record<StockSpecsTab, string> = totem
    ? {
        marcas: '/painel/totem/marcas',
        tipos: '/painel/totem/marcas',
        modelos: '/painel/totem/marcas',
        atributos: '/painel/totem/atributos',
        grupos: '/painel/totem/marcas',
        retirada: '/painel/totem',
        kits: '/erp/kits',
        lotes: '/erp/lotes',
        almoxarifado: '/erp/almoxarifado',
      }
    : {
        marcas: '/erp/marcas',
        tipos: '/erp/marcas',
        modelos: '/erp/marcas',
        atributos: '/erp/atributos',
        grupos: '/erp/marcas',
        retirada: '/erp/tipos-retirada',
        kits: '/erp/kits',
        lotes: '/erp/lotes',
        almoxarifado: '/erp/almoxarifado',
      };

  const tabs: HubTab<StockSpecsTab>[] = [
    ...CORE_TABS,
    ...(includeSupportResources && !totem ? SUPPORT_TABS : []),
  ];
  const full = hubFullAccess(user?.role, userIsStoreAdmin(user?.email));
  const allowed = tabs.filter((tab) => full || canAccessPath(legacy[tab.id], user?.email));
  if (allowed.length === 0) return <p className="empty">Sem permissão para as especificações dos produtos.</p>;

  const backToStock = productsStockPath(pathname);
  const aside = embedded ? null : (
    <div className="hub-head__aside-links" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Link to={backToStock} className="btn btn--ghost">
        Produtos & Estoque
      </Link>
    </div>
  );

  return (
    <HubPage
      icon="tag"
      title="Especificações"
      subtitle={
        includeSupportResources && !totem
          ? 'Marcas, atributos, grupos, retirada — e kits, lotes e almoxarifados usados no produto.'
          : 'Tudo o que descreve os produtos num lugar só: marcas, tipos, modelos, atributos, grupos e tipos de retirada.'
      }
      tabs={allowed}
      aside={aside}
      compact={embedded}
      paramKey={embedded ? STOCK_SPECS_PARAM : 'aba'}
    />
  );
}
