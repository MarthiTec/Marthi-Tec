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

/** Hub Produtos & Estoque (canônico em `/erp/produtos`). */
export function productsStockPath(tab?: StockTab) {
  return withTab('/erp/produtos', tab);
}

/** Dono, gerente e admin (pelo login ou pelo cadastro da loja) veem todas as abas, como no painel. */
export function hubFullAccess(role: string | undefined, isStoreAdmin: boolean) {
  return isStoreAdmin || ['admin', 'superadmin', 'manager'].includes(String(role ?? '').toLowerCase());
}
