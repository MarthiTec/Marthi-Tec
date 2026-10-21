/**
 * Telas agrupadas em abas: Especificações (marcas, atributos, grupos e tipos de retirada), Pessoas
 * (clientes, fornecedores, vendedores, funcionários e permissões) e Produtos & Estoque
 * (produtos, movimentações, entradas e ajustes/balanço). O endereço segue o app em
 * que a pessoa está (painel, totem ou Retaguarda) para não tirar ninguém do contexto.
 */
export type SpecsTab = 'marcas' | 'atributos' | 'grupos' | 'retirada';
export type PeopleTab = 'clientes' | 'fornecedores' | 'vendedores' | 'funcionarios' | 'permissoes';
export type StockTab = 'produtos' | 'movimentacoes' | 'entradas' | 'ajustes';

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
