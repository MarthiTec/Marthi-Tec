/**
 * Telas agrupadas em abas: Especificações (marcas, atributos, grupos e tipos de retirada), Pessoas
 * (clientes, fornecedores, vendedores, funcionários e permissões) e Produtos & Estoque
 * (produtos, movimentações, entradas, ajustes/balanço e especificações + kits/lotes/almoxarifado).
 * O endereço segue o app em que a pessoa está (painel, totem ou Retaguarda).
 */
export type SpecsTab = 'marcas' | 'tipos' | 'modelos' | 'atributos' | 'grupos' | 'retirada';
/** Sub-abas do bloco Especificações no hub de estoque (specs + recursos de apoio). */
export type StockSpecsTab = SpecsTab | 'kits' | 'lotes' | 'almoxarifado';
export type PeopleTab = 'clientes' | 'fornecedores' | 'vendedores' | 'funcionarios' | 'permissoes';
/** Abas do hub Produtos & Estoque — `especificacoes` embute specs + kits/lotes/almoxarifado. */
export type StockTab = 'produtos' | 'movimentacoes' | 'entradas' | 'ajustes' | 'especificacoes';

/** Query da sub-aba de Especificações quando embutida no hub (`?aba=especificacoes&espec=marcas`). */
export const STOCK_SPECS_PARAM = 'espec';

function withTab(base: string, tab?: string) {
  return tab ? `${base}?aba=${tab}` : base;
}

export function specificationsPath(pathname: string, tab?: SpecsTab) {
  const base = pathname.startsWith('/erp')
    ? '/erp/especificacoes'
    : pathname.startsWith('/painel/totem')
      ? '/painel/totem/especificacoes'
      : '/painel/especificacoes';
  return withTab(base, tab);
}

/**
 * Especificações no contexto do hub Produtos & Estoque (painel / Retaguarda).
 * Totem continua no atalho dedicado (`/painel/totem/especificacoes`) — sem kits/lotes/almoxarifado.
 */
export function productsStockSpecsPath(pathname: string, tab?: StockSpecsTab) {
  if (pathname.startsWith('/painel/totem')) {
    // Totem: só as abas de catálogo (marcas/atributos/…); kits etc. ficam na Retaguarda/hub.
    if (tab === 'kits' || tab === 'lotes' || tab === 'almoxarifado') {
      return productsStockPath('/painel', 'especificacoes') + `&${STOCK_SPECS_PARAM}=${tab}`;
    }
    return specificationsPath(pathname, tab);
  }
  const hub = productsStockPath(pathname, 'especificacoes');
  return tab ? `${hub}&${STOCK_SPECS_PARAM}=${tab}` : hub;
}

export function peoplePath(pathname: string, tab?: PeopleTab) {
  return withTab(pathname.startsWith('/erp') ? '/erp/pessoas' : '/painel/pessoas', tab);
}

/**
 * Hub Produtos & Estoque — o endereço segue o contexto (totem / painel / Retaguarda).
 * Totem-only fica em `/painel/totem/produtos` (sem abas de entrada/balanço do ERP).
 * Painel e aliases usam `/painel/produtos` (AdminLayout). Retaguarda usa `/erp/produtos`.
 */
export function productsStockPath(pathname: string, tab?: StockTab) {
  if (pathname.startsWith('/painel/totem')) {
    // Catálogo do totem: só cadastro na vitrine — sem hub de entradas/movimentos.
    return '/painel/totem/produtos';
  }
  const base = pathname.startsWith('/erp') ? '/erp/produtos' : '/painel/produtos';
  return withTab(base, tab);
}

/** Dono, gerente e admin (pelo login ou pelo cadastro da loja) veem todas as abas, como no painel. */
export function hubFullAccess(role: string | undefined, isStoreAdmin: boolean) {
  return isStoreAdmin || ['admin', 'superadmin', 'manager'].includes(String(role ?? '').toLowerCase());
}
