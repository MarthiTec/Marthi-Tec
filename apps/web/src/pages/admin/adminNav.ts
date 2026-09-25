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
      { to: '/painel/totem/atributos', label: 'Atributos' },
      { to: '/painel/totem/config', label: 'Configuração' },
    ],
  },
  {
    id: 'presales',
    label: 'PDV',
    icon: 'cart',
    module: 'erp',
    children: [
      { to: '/caixa', label: 'Abrir caixa', openApp: true, accent: '#1d4ed8' },
      { to: '/painel/pdv', label: 'Fila do totem', end: true },
      { to: '/painel/pedidos', label: 'Consultar vendas' },
      { to: '/painel/pagamentos', label: 'Formas de pagamento' },
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
    ],
  },
  {
    id: 'erp',
    label: 'Retaguarda',
    icon: 'ops',
    module: 'erp',
    children: [
      { to: '/erp', label: 'Abrir Retaguarda', openApp: true, accent: '#0e7490' },
      { to: '/painel/erp', label: 'Visão e ajustes', end: true },
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
    id: 'crm',
    label: 'CRM',
    icon: 'people',
    module: null,
    children: [
      { to: '/crm', label: 'Abrir CRM', openApp: true, accent: '#0369a1' },
      { to: '/painel/crm', label: 'Visão no painel', end: true },
    ],
  },
];

export function navGroupForPath(pathname: string, search = '') {
  if (
    pathname.startsWith('/painel/operacoes') ||
    pathname.startsWith('/painel/ramo') ||
    pathname.startsWith('/painel/personalizacao')
  ) {
    return 'operacoes';
  }
  if (pathname.startsWith('/painel/totem')) return 'totem';
  if (
    pathname.startsWith('/painel/pdv') ||
    pathname.startsWith('/painel/pedidos') ||
    pathname.startsWith('/painel/pagamentos')
  ) {
    return 'presales';
  }
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
    pathname.startsWith('/painel/atributos') ||
    pathname.startsWith('/painel/kits') ||
    pathname.startsWith('/painel/lotes') ||
    pathname.startsWith('/painel/almoxarifado') ||
    pathname.startsWith('/painel/tabelas') ||
    pathname.startsWith('/painel/financeiro') ||
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
  if (pathname.startsWith('/painel/crm') || pathname.startsWith('/crm')) return 'crm';
  if (pathname.startsWith('/painel/ajuda')) return 'help';
  if (pathname === '/painel' && !search) return 'home';
  return null;
}

export function childIsActive(child: AdminNavChild, pathname: string, search: string) {
  const [path, query] = child.to.split('?');
  const cleanSearch = search.replace(/^\?/, '');
  if (query) {
    return pathname === path && cleanSearch === query;
  }
  if (pathname === path && cleanSearch) return false;
  if (child.end) return pathname === path && !cleanSearch;
  return pathname === path || pathname.startsWith(`${path}/`);
}
