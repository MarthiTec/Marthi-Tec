import type { PartnerModuleId } from '../../data/catalog';
import type { AdminIconName } from '../../components/AdminIcons';

export type AdminNavChild = {
  to: string;
  label: string;
  end?: boolean;
  /** Link para o app independente (operadores). Só um por grupo. */
  openApp?: boolean;
  /** Cor do produto na homepage / catálogo. */
  accent?: string;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  icon: AdminIconName;
  module: PartnerModuleId | null;
  to?: string;
  end?: boolean;
  children?: AdminNavChild[];
};

/**
 * Painel = visão administrativa (dono/gerente): consulta e demonstrativo.
 * Apps independentes (Totem, PDV, OS, ERP, Fiscal, E-com, CRM) = operação.
 * Em cada grupo standalone: no máximo um item `openApp`.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  { id: 'home', label: 'Painel', icon: 'home', to: '/painel', end: true, module: null },
  {
    id: 'totem',
    label: 'Totem',
    icon: 'totem',
    module: 'totem',
    children: [
      { to: '/totem', label: 'Abrir totem', openApp: true, accent: '#0f766e' },
      { to: '/painel/totem', label: 'Dados e insights', end: true },
      { to: '/painel/totem/produtos', label: 'Catálogo do totem' },
      { to: '/painel/totem/especificacoes', label: 'Especificações' },
      { to: '/painel/totem/config', label: 'Configuração' },
    ],
  },
  {
    id: 'presales',
    label: 'PDV',
    icon: 'cart',
    module: 'erp',
    // Ordem Fase A: Operar → Negociar → Configurar → Desempenho (sem paths novos).
    children: [
      { to: '/caixa', label: 'Abrir caixa', openApp: true, accent: '#1d4ed8' },
      { to: '/painel/venda-externa', label: 'Venda Externa / Sem Caixa', accent: '#059669' },
      { to: '/painel/pdv', label: 'Fila do totem', end: true },
      { to: '/painel/pedidos', label: 'Consultar vendas' },
      { to: '/painel/cotacao', label: 'Cotação rápida', accent: '#0f766e' },
      { to: '/painel/orcamentos', label: 'Orçamentos', accent: '#0284c7' },
      { to: '/painel/pagamentos', label: 'Formas de pagamento' },
      { to: '/painel/taxas-cartao', label: 'Taxas & Maquininhas' },
      { to: '/painel/calculadora', label: 'Calculadora' },
      { to: '/painel/metas', label: 'Metas & Comissões', accent: '#6366f1' },
    ],
  },
  {
    id: 'os',
    label: 'OS',
    icon: 'wrench',
    module: 'os',
    children: [
      { to: '/os', label: 'Abrir oficina', openApp: true, accent: '#b45309' },
      { to: '/painel/os', label: 'Visão no painel', end: true },
      { to: '/painel/os/agenda', label: 'Agenda' },
      { to: '/painel/os/solicitacoes', label: 'Solicitações de orçamento' },
      { to: '/painel/os/manutencoes', label: 'Catálogo de manutenções' },
      { to: '/painel/os/pecas', label: 'Peças de manutenção' },
    ],
  },
  {
    id: 'erp',
    label: 'Retaguarda',
    icon: 'ops',
    module: 'erp',
    // Ordem Fase A: Abrir → Estoque (celular) → Vitrine → Cadastros → Conta.
    children: [
      { to: '/erp', label: 'Abrir Retaguarda', openApp: true, accent: '#0e7490' },
      { to: '/painel/erp', label: 'Visão e ajustes', end: true },
      // Fase A+/B: hub no Painel (AdminLayout). Dual path `/erp/produtos` permanece na Retaguarda.
      // Especificações / Kits / Lotes / Almoxarifado: só na aba Especificações do hub (não no menu).
      { to: '/painel/produtos', label: 'Produtos & Estoque' },
      { to: '/painel/catalogo', label: 'Catálogo digital', accent: '#e4572e' },
      { to: '/painel/solicitacoes-compra', label: 'Solicitações de compras', accent: '#0284c7' },
      { to: '/painel/pessoas', label: 'Pessoas' },
      { to: '/erp/api-aparelhos', label: 'Consulta de aparelhos' },
      { to: '/painel/financeiro', label: 'Financeiro & Pagamentos' },
      { to: '/painel/plano', label: 'Planos & Faturamento' },
      { to: '/painel/lojas', label: 'Dados da Empresa & Lojas' },
      { to: '/painel/usuarios', label: 'Usuários & Permissões' },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: 'chart',
    module: 'erp',
    children: [
      { to: '/painel/relatorios', label: 'Central de Relatórios', end: true, accent: '#d97706' },
      { to: '/painel/relatorio-vendas', label: 'Vendas & Metas', accent: '#d97706' },
      { to: '/painel/metas', label: 'Metas & Comissões', accent: '#6366f1' },
      { to: '/painel/financeiro?tab=dre', label: 'Financeiro / DRE' },
      { to: '/painel/financeiro?tab=aging', label: 'Aging a receber / a pagar' },
      { to: '/painel/relatorio-estoque', label: 'Estoque (com fotos)' },
      { to: '/painel/relatorio-imei', label: 'Estoque por IMEI' },
      { to: '/painel/os/pecas?aba=relatorio', label: 'Peças de manutenção (OS)' },
      { to: '/painel/solicitacoes-compra', label: 'Leads do catálogo digital' },
      { to: '/painel/pessoas?aba=clientes', label: 'Clientes' },
    ],
  },
  {
    id: 'ads',
    label: 'Anúncios Ads',
    icon: 'megaphone',
    module: null,
    children: [
      { to: '/painel/ads', label: 'Visão geral', end: true },
      { to: '/painel/ads/criar', label: 'Criar anúncio' },
      { to: '/painel/ads/campanhas', label: 'Campanhas' },
      { to: '/painel/ads/publicacoes', label: 'Publicações e calendário' },
      { to: '/painel/ads/midias', label: 'Fotos e vídeos' },
      { to: '/painel/ads/creditos', label: 'Créditos e pagamentos' },
      { to: '/painel/ads/contas', label: 'Contas conectadas' },
    ],
  },
  {
    id: 'cardapio',
    label: 'Cardápio Digital',
    icon: 'store',
    module: null,
    children: [
      { to: '/cardapio', label: 'Abrir cardápio', openApp: true, accent: '#c48a39' },
      { to: '/painel/cardapio', label: 'Gestão e Pratos do Dia', end: true },
      { to: '/painel/cardapio/imprimir', label: 'Display de Mesa (QR Code)' },
      { to: '/mesa', label: 'Mesas / Salão' },
      { to: '/cozinha', label: 'Fila da Cozinha' },
    ],
  },
  {
    id: 'fiscal',
    label: 'Emissor Fiscal',
    icon: 'fiscal',
    module: 'fiscal',
    children: [
      { to: '/fiscal', label: 'Abrir emissor', openApp: true, accent: '#7c3aed' },
      { to: '/painel/fiscal', label: 'Visão no painel', end: true },
      { to: '/painel/notas', label: 'Notas emitidas' },
      { to: '/painel/classificacao-fiscal', label: 'Classificação fiscal' },
      { to: '/painel/cfop', label: 'CFOP e FECP' },
      { to: '/painel/fiscal/config', label: 'Configuração' },
    ],
  },
  {
    id: 'ecommerce',
    label: 'E-commerce',
    icon: 'store',
    module: 'ecommerce',
    children: [
      { to: '/ecommerce', label: 'Abrir e-commerce', openApp: true, accent: '#db2777' },
      { to: '/painel/ecommerce', label: 'Visão no painel', end: true },
    ],
  },
  {
    id: 'help',
    label: 'Central de ajuda',
    icon: 'help',
    to: '/painel/ajuda',
    end: true,
    module: null,
  },
];

export function navGroupForPath(pathname: string, search = '') {
  const cleanSearch = search.replace(/^\?/, '');
  const params = new URLSearchParams(cleanSearch);
  const aba = params.get('aba');
  const tab = params.get('tab');

  if (
    pathname.startsWith('/painel/operacoes') ||
    pathname.startsWith('/painel/usuarios') ||
    pathname.startsWith('/painel/ramo') ||
    pathname.startsWith('/painel/personalizacao')
  ) {
    return 'operacoes';
  }
  if (pathname.startsWith('/painel/totem')) return 'totem';

  // Relatórios (antes de PDV/OS/Retaguarda — paths compartilhados).
  if (
    pathname.startsWith('/painel/relatorios') ||
    pathname.startsWith('/painel/relatorio-vendas') ||
    pathname.startsWith('/painel/relatorio-estoque') ||
    pathname.startsWith('/painel/relatorio-imei') ||
    pathname.startsWith('/erp/relatorios') ||
    pathname.startsWith('/erp/relatorio-estoque') ||
    pathname.startsWith('/erp/relatorio-imei') ||
    ((pathname.startsWith('/painel/financeiro') || pathname.startsWith('/erp/financeiro')) &&
      (tab === 'dre' || tab === 'aging')) ||
    ((pathname.startsWith('/painel/os/pecas') || pathname.startsWith('/os/pecas')) && aba === 'relatorio')
  ) {
    return 'relatorios';
  }

  if (
    pathname.startsWith('/painel/pdv') ||
    pathname.startsWith('/painel/venda-externa') ||
    pathname.startsWith('/painel/metas') ||
    pathname.startsWith('/painel/pedidos') ||
    pathname.startsWith('/painel/pagamentos') ||
    pathname.startsWith('/painel/cotacao') ||
    pathname.startsWith('/painel/orcamentos') ||
    pathname.startsWith('/painel/calculadora') ||
    pathname.startsWith('/painel/taxas-cartao')
  ) {
    return 'presales';
  }
  if (pathname.startsWith('/painel/cardapio') || pathname.startsWith('/cardapio')) return 'cardapio';
  if (pathname.startsWith('/painel/os') || pathname.startsWith('/os')) return 'os';
  if (
    pathname.startsWith('/painel/erp') ||
    pathname.startsWith('/erp') ||
    pathname.startsWith('/painel/clientes') ||
    pathname.startsWith('/painel/funcionarios') ||
    pathname.startsWith('/painel/permissoes') ||
    pathname.startsWith('/painel/vendedores') ||
    pathname.startsWith('/painel/fornecedores') ||
    pathname.startsWith('/painel/produtos') ||
    pathname.startsWith('/painel/estoque') ||
    pathname.startsWith('/painel/balanco') ||
    pathname.startsWith('/painel/movimentos') ||
    pathname.startsWith('/painel/catalogo') ||
    pathname.startsWith('/painel/solicitacoes-compra') ||
    pathname.startsWith('/painel/marcas') ||
    pathname.startsWith('/painel/atributos') ||
    pathname.startsWith('/painel/especificacoes') ||
    pathname.startsWith('/painel/pessoas') ||
    pathname.startsWith('/painel/kits') ||
    pathname.startsWith('/painel/lotes') ||
    pathname.startsWith('/painel/almoxarifado') ||
    pathname.startsWith('/painel/tabelas') ||
    pathname.startsWith('/painel/financeiro') ||
    pathname.startsWith('/painel/plano') ||
    pathname.startsWith('/painel/faturamento') ||
    pathname.startsWith('/painel/lojas') ||
    pathname.startsWith('/painel/auditoria')
  ) {
    return 'erp';
  }
  if (
    pathname.startsWith('/painel/notas') ||
    pathname.startsWith('/painel/fiscal') ||
    pathname.startsWith('/painel/classificacao-fiscal') ||
    pathname.startsWith('/painel/cfop') ||
    pathname.startsWith('/fiscal')
  ) {
    return 'fiscal';
  }
  if (pathname.startsWith('/painel/ecommerce') || pathname.startsWith('/ecommerce')) {
    return 'ecommerce';
  }
  if (pathname.startsWith('/painel/ajuda')) return 'help';
  if (pathname === '/painel' && !search) return 'home';
  return null;
}

/** Hub Produtos & Estoque existe em `/painel/produtos` e `/erp/produtos` (dual path). */
function stockHubPaths(path: string) {
  if (path === '/painel/produtos' || path === '/erp/produtos') {
    return ['/painel/produtos', '/erp/produtos'];
  }
  return [path];
}

export function childIsActive(child: AdminNavChild, pathname: string, search: string) {
  const [path, query] = child.to.split('?');
  const cleanSearch = search.replace(/^\?/, '');
  const hubs = stockHubPaths(path);
  const onPath = hubs.some((hub) => pathname === hub);
  if (query) {
    return onPath && cleanSearch === query;
  }
  // Hubs (Pessoas, Produtos & Estoque) usam `?aba=` (+ opcional `espec=` sob Especificações).
  if (onPath && cleanSearch) {
    const params = new URLSearchParams(cleanSearch);
    const keys = [...params.keys()];
    if (keys.every((key) => key === 'aba' || key === 'espec') && params.has('aba')) return true;
    return false;
  }
  if (child.end) return pathname === path && !cleanSearch;
  return hubs.some((hub) => pathname === hub || pathname.startsWith(`${hub}/`));
}
