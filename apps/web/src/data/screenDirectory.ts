import type { AdminIconName } from '../components/AdminIcons';
import type { PartnerModuleId } from './catalog';
import { ADMIN_NAV } from '../pages/admin/adminNav';

/**
 * Todas as telas que o menu do painel abre (módulos da barra lateral + atalhos do topo), num só lugar:
 * a busca do menu e as "Mais acessadas" usam esta lista. Os nomes vêm do próprio menu; `words` são
 * outros jeitos de procurar a mesma tela ("estoque", "nota", "comissão"…).
 */
export type Screen = {
  path: string;
  label: string;
  group: string;
  groupId: string;
  icon: AdminIconName;
  module: PartnerModuleId | null;
  end?: boolean;
  openApp?: boolean;
  /** Só para administradores da loja (atalhos do topo). */
  adminOnly?: boolean;
  words: string;
};

const WORDS: Record<string, string> = {
  '/totem': 'vitrine autoatendimento',
  '/painel/totem/produtos': 'vitrine produtos totem',
  '/caixa': 'pdv vender venda frente de caixa abrir caixa',
  '/painel/venda-externa': 'vender venda sem caixa fora da loja venda externa',
  '/painel/pdv': 'fila pedidos do totem',
  '/painel/orcamentos': 'proposta propostas orcamento',
  '/painel/pedidos': 'vendas historico consultar venda vendidos',
  '/painel/pagamentos': 'pix cartao dinheiro formas',
  '/painel/cotacao': 'cotacao preco rapido',
  '/painel/calculadora': 'parcelamento parcelas juros',
  '/painel/taxas-cartao': 'maquininha taxa cartao juros',
  '/painel/metas': 'comissao comissoes metas lucro',
  '/painel/relatorio-vendas': 'relatorio vendas metas lucro margem ticket vendedor',
  '/painel/relatorios': 'relatorios indicadores hub central dre imei estoque vendas aging lucro',
  '/painel/relatorio-estoque': 'relatorio estoque foto fotos aparelho inventario produto',
  '/painel/relatorio-imei': 'relatorio imei serial aparelho unidade baixado',
  '/os': 'ordem de servico conserto assistencia reparo oficina',
  '/painel/os': 'ordem de servico conserto assistencia',
  '/painel/os/agenda': 'agenda agendamento',
  '/painel/os/solicitacoes': 'orcamento manutencao conserto pedido cliente catalogo protocolo',
  '/painel/os/manutencoes': 'servicos manutencao tela bateria preco conserto catalogo',
  '/painel/os/pecas': 'pecas peca estoque minimo tela bateria conector manutencao custo relatorio',
  '/erp': 'retaguarda erp',
  // Hub Produtos & Estoque (abas): sinônimos cobrem entrada / balanço / movimentos.
  '/erp/produtos': 'produtos estoque cadastro produto aparelho celular imei entrada compra nota fornecedor balanco inventario contagem fisica minimo maximo markup margem movimentos movimentacao ajuste de estoque saida venda historico saldo',
  '/painel/produtos': 'produtos estoque cadastro produto aparelho celular imei entrada compra nota fornecedor balanco inventario',
  '/painel/catalogo': 'catalogo digital vitrine link pdf cliente pagina de venda sacola loja online',
  '/painel/solicitacoes-compra': 'solicitacao compra pedido cliente catalogo esgotado encomenda vendedor entrada venda leads lead',
  '/painel/especificacoes': 'marcas atributos cores capacidades grupos retirada',
  '/painel/pessoas': 'clientes fornecedores vendedores funcionarios cadastro relatorio cliente',
  '/erp/api-aparelhos': 'consulta aparelho modelo ficha',
  '/painel/financeiro': 'financeiro contas pagar receber caixa fluxo dre aging lucro a receber a pagar',
  '/erp/relatorios': 'relatorios indicadores dre vendas metas estoque imei pecas hub central',
  '/painel/financeiro?tab=dre': 'dre demonstrativo resultado livro receita despesa',
  '/painel/financeiro?tab=aging': 'aging vencimento a receber a pagar capital giro',
  '/painel/os/pecas?aba=relatorio': 'relatorio pecas os oficina consumo',
  '/painel/pessoas?aba=clientes': 'clientes cadastro ficha credito',
  '/painel/lojas': 'empresa lojas filiais licenca plano cnpj',
  '/painel/plano': 'plano faturamento assinatura pix fatura cobranca mensalidade',
  '/painel/faturamento': 'plano faturamento assinatura pix fatura cobranca mensalidade',
  '/painel/usuarios': 'usuarios equipe permissoes acesso',
  '/painel/operacoes': 'operacoes ramo comunicacao whatsapp email ajustes',
  '/painel/notas': 'nota fiscal nfe nfce notas emitidas',
  '/fiscal': 'nota fiscal emitir nfe nfce',
  '/painel/ads': 'anuncios ads marketing',
  '/painel/ajuda': 'ajuda suporte duvida tutorial',
  '/painel': 'inicio painel visao geral',
};

/** Atalhos do menu de grade do topo (também entram na busca). */
export const TOP_SHORTCUTS: Array<{ id: string; path: string; label: string; hint: string; icon: AdminIconName; adminOnly?: boolean }> = [
  { id: 'painel', path: '/painel', label: 'Painel', hint: 'Visão geral da loja', icon: 'home' },
  { id: 'usuarios', path: '/painel/usuarios', label: 'Usuários', hint: 'Equipe e permissões', icon: 'people', adminOnly: true },
  { id: 'operacoes', path: '/painel/operacoes', label: 'Operações', hint: 'Ramo, comunicação e ajustes', icon: 'ops', adminOnly: true },
  { id: 'lojas', path: '/painel/lojas', label: 'Lojas & Licenças', hint: 'Filiais e plano', icon: 'store', adminOnly: true },
  {
    id: 'faturamento',
    path: '/painel/plano',
    label: 'Planos & Faturamento',
    hint: 'Assinatura, faturas e Pix',
    icon: 'plan',
    adminOnly: true,
  },
  { id: 'ajuda', path: '/painel/ajuda', label: 'Central de ajuda', hint: 'Dúvidas e suporte', icon: 'help' },
];

function build(): Screen[] {
  const list: Screen[] = [];
  const seen = new Set<string>();
  const add = (screen: Omit<Screen, 'words'>) => {
    if (seen.has(screen.path)) return;
    seen.add(screen.path);
    list.push({ ...screen, words: WORDS[screen.path] ?? '' });
  };
  for (const group of ADMIN_NAV) {
    if (group.to) add({ path: group.to, label: group.label, group: 'Painel', groupId: group.id, icon: group.icon, module: group.module, end: group.end });
    for (const child of group.children ?? []) {
      add({ path: child.to, label: child.label, group: group.label, groupId: group.id, icon: group.icon, module: group.module, end: child.end, openApp: child.openApp });
    }
  }
  for (const item of TOP_SHORTCUTS) add({ path: item.path, label: item.label, group: 'Atalhos', groupId: item.id, icon: item.icon, module: null, end: item.path === '/painel', adminOnly: item.adminOnly });
  return list;
}

export const SCREENS: Screen[] = build();

/** Sem acento e minúsculo: "Catálogo" acha "catalogo". */
export function plain(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Endereços que abrem a mesma tela do menu (rotas legadas → hub Produtos & Estoque). */
const ALIASES: Record<string, string> = {
  // Dual path: rota real em /painel/produtos (AdminLayout); highlight do menu aponta ao item Retaguarda.
  '/painel/produtos': '/erp/produtos',
  '/erp/entrada-estoque': '/erp/produtos',
  '/erp/balanco': '/erp/produtos',
  '/erp/movimentos': '/erp/produtos',
  '/painel/estoque': '/erp/produtos',
  '/painel/balanco': '/erp/produtos',
  '/painel/movimentos': '/erp/produtos',
};

/** Tela aberta agora (o caminho mais específico do menu que combina com o endereço). */
export function screenForPath(pathname: string): Screen | null {
  const raw = pathname.replace(/\/+$/, '') || '/';
  const alias = Object.keys(ALIASES).find((from) => raw === from || raw.startsWith(`${from}/`));
  const clean = alias ? ALIASES[alias] : raw;
  let best: Screen | null = null;
  for (const screen of SCREENS) {
    // "Abrir caixa / oficina / Retaguarda…" só conta na tela inicial do app, não em cada tela dele.
    const exact = screen.end || screen.openApp || screen.path === '/painel';
    const hit = exact ? clean === screen.path : clean === screen.path || clean.startsWith(`${screen.path}/`);
    if (hit && (!best || screen.path.length > best.path.length)) best = screen;
  }
  return best;
}

/** Busca do menu: todas as palavras digitadas precisam aparecer no nome, no módulo ou nos sinônimos. */
export function searchScreens(term: string, screens: Screen[] = SCREENS, limit = 12): Screen[] {
  const words = plain(term).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: Array<{ screen: Screen; score: number }> = [];
  for (const screen of screens) {
    const label = plain(screen.label);
    const haystack = `${label} ${plain(screen.group)} ${screen.words}`;
    if (!words.every((word) => haystack.includes(word))) continue;
    let score = 0;
    for (const word of words) {
      if (label.startsWith(word)) score += 4;
      else if (label.split(/[\s/&-]+/).some((part) => part.startsWith(word))) score += 3;
      else if (label.includes(word)) score += 2;
      else score += 1;
    }
    if (screen.openApp) score += 0.5;
    scored.push({ screen, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.screen.label.localeCompare(b.screen.label)).slice(0, limit).map((row) => row.screen);
}
