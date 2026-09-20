import type { PartnerModuleId } from '../../data/catalog';
import type { AdminIconName } from '../../components/AdminIcons';

export type AdminNavChild = {
  to: string;
  label: string;
  end?: boolean;
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

export const ADMIN_NAV: AdminNavGroup[] = [
  { id: 'home', label: 'Painel', icon: 'home', to: '/painel', end: true, module: null },
  {
    id: 'totem',
    label: 'Totem',
    icon: 'totem',
    module: 'totem',
    children: [
      { to: '/totem', label: 'Abrir totem' },
      { to: '/painel/totem', label: 'Dados do totem', end: true },
      { to: '/painel/totem/config', label: 'Configuração' },
    ],
  },
  {
    id: 'presales',
    label: 'PDV',
    icon: 'cart',
    module: 'erp',
    children: [
      { to: '/caixa', label: 'Abrir caixa (PDV + NFC-e)' },
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
      { to: '/os', label: 'Abrir oficina (OS)' },
      { to: '/painel/os', label: 'Quadro no painel', end: true },
      { to: '/painel/os/nova', label: 'Nova OS' },
      { to: '/painel/os/agenda', label: 'Agenda' },
      { to: '/painel/os?quote=sent', label: 'Orçamentos' },
      { to: '/painel/os?status=progress', label: 'Em serviço' },
      { to: '/painel/os?status=ready', label: 'Prontas' },
    ],
  },
  {
    id: 'people',
    label: 'Pessoas',
    icon: 'people',
    module: 'erp',
    children: [
      { to: '/painel/clientes', label: 'Clientes' },
      { to: '/painel/funcionarios', label: 'Funcionários' },
      { to: '/painel/permissoes', label: 'Permissões de acesso' },
      { to: '/painel/vendedores', label: 'Vendedores' },
      { to: '/painel/fornecedores', label: 'Fornecedores' },
    ],
  },
  {
    id: 'products',
    label: 'Produtos',
    icon: 'box',
    module: 'erp',
    children: [
      { to: '/painel/produtos', label: 'Cadastro', end: true },
      { to: '/painel/atributos', label: 'Atributos' },
      { to: '/painel/kits', label: 'Kits' },
      { to: '/painel/lotes', label: 'Lotes / Rastro' },
      { to: '/painel/almoxarifado', label: 'Almoxarifado' },
      { to: '/painel/tabelas', label: 'Tabelas de preço' },
    ],
  },
  {
    id: 'fiscal',
    label: 'Emissor Fiscal',
    icon: 'fiscal',
    module: 'fiscal',
    children: [
      { to: '/fiscal', label: 'Abrir emissor fiscal' },
      { to: '/painel/classificacao-fiscal', label: 'Classificação fiscal' },
      { to: '/painel/cfop', label: 'CFOP e FECP' },
    ],
  },
  {
    id: 'erp',
    label: 'Operações',
    icon: 'ops',
    module: 'erp',
    children: [
      { to: '/painel/financeiro', label: 'Financeiro' },
      { to: '/painel/auditoria', label: 'Auditoria' },
    ],
  },
];

export function navGroupForPath(pathname: string, search = '') {
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
    pathname.startsWith('/painel/clientes') ||
    pathname.startsWith('/painel/funcionarios') ||
    pathname.startsWith('/painel/permissoes') ||
    pathname.startsWith('/painel/vendedores') ||
    pathname.startsWith('/painel/fornecedores') ||
    pathname.startsWith('/painel/condutores')
  ) {
    return 'people';
  }
  if (
    pathname.startsWith('/painel/produtos') ||
    pathname.startsWith('/painel/estoque') ||
    pathname.startsWith('/painel/atributos') ||
    pathname.startsWith('/painel/kits') ||
    pathname.startsWith('/painel/lotes') ||
    pathname.startsWith('/painel/almoxarifado') ||
    pathname.startsWith('/painel/tabelas')
  ) {
    return 'products';
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
  if (pathname.startsWith('/painel/financeiro') || pathname.startsWith('/painel/auditoria')) {
    return 'erp';
  }
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
