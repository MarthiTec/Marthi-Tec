import type { PartnerModuleId } from '../data/catalog';

export type AdminNavChild = {
  to: string;
  label: string;
  end?: boolean;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  module: PartnerModuleId | null;
  to?: string;
  end?: boolean;
  children?: AdminNavChild[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  { id: 'home', label: 'Painel', to: '/painel', end: true, module: null },
  {
    id: 'totem',
    label: 'Totem',
    module: 'totem',
    children: [{ to: '/painel/totem', label: 'Configuração' }],
  },
  {
    id: 'presales',
    label: 'PDV',
    module: 'presales',
    children: [
      { to: '/painel/pdv/venda', label: 'Lançar venda' },
      { to: '/painel/pdv', label: 'Fila do totem', end: true },
      { to: '/painel/pedidos', label: 'Pedidos' },
    ],
  },
  {
    id: 'os',
    label: 'OS',
    module: 'os',
    children: [
      { to: '/painel/os', label: 'Quadro da oficina', end: true },
      { to: '/painel/os/nova', label: 'Nova OS' },
      { to: '/painel/os?status=progress', label: 'Em serviço' },
      { to: '/painel/os?status=ready', label: 'Prontas' },
    ],
  },
  {
    id: 'erp',
    label: 'ERP',
    module: 'erp',
    children: [
      { to: '/painel/clientes', label: 'Clientes' },
      { to: '/painel/estoque', label: 'Estoque' },
      { to: '/painel/atributos', label: 'Atributos' },
      { to: '/painel/tabelas', label: 'Tabelas de preço' },
      { to: '/painel/pagamentos', label: 'Formas de pagamento' },
      { to: '/painel/financeiro', label: 'Financeiro' },
    ],
  },
];

export function navGroupForPath(pathname: string, search = '') {
  if (pathname.startsWith('/painel/totem')) return 'totem';
  if (pathname.startsWith('/painel/pdv') || pathname.startsWith('/painel/pedidos')) return 'presales';
  if (pathname.startsWith('/painel/os')) return 'os';
  if (
    pathname.startsWith('/painel/clientes') ||
    pathname.startsWith('/painel/estoque') ||
    pathname.startsWith('/painel/atributos') ||
    pathname.startsWith('/painel/tabelas') ||
    pathname.startsWith('/painel/pagamentos') ||
    pathname.startsWith('/painel/financeiro')
  ) {
    return 'erp';
  }
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
  if (child.end) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}
