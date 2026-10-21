import type { AdminIconName } from '../components/AdminIcons';

/**
 * Catálogo da Central de Relatórios — só links com tela/API reais.
 * Segmentos sem dado (ex.: funil de cotações SQL) ficam em `unavailable`.
 */

export type ReportHubLink = {
  to: string;
  title: string;
  text: string;
  icon: AdminIconName;
  /** Operação (não relatório gerencial). */
  kind?: 'ops';
};

export type ReportHubSegment = {
  id: string;
  title: string;
  blurb: string;
  links: ReportHubLink[];
  /** Honest empty: sem mock / sem KPI inventado. */
  unavailable?: string;
};

/** Prefixo conforme o shell (Painel vs Retaguarda). */
export function reportsPathPrefix(pathname: string): '/painel' | '/erp' {
  return pathname.startsWith('/erp') ? '/erp' : '/painel';
}

/**
 * Segmentos do hub. Preferir `/painel/...` (AdminLayout); dual path só quando
 * o usuário já está na Retaguarda (`/erp`).
 */
export function reportsHubSegments(prefix: '/painel' | '/erp'): ReportHubSegment[] {
  const stockReport = (slug: 'relatorio-estoque' | 'relatorio-imei') =>
    prefix === '/erp' ? `/erp/${slug}` : `/painel/${slug}`;
  const finance = (tab: 'dre' | 'aging') =>
    prefix === '/erp' ? `/erp/financeiro?tab=${tab}` : `/painel/financeiro?tab=${tab}`;
  // Hub Produtos & Estoque: painel-native (#60); Retaguarda mantém dual path.
  const productsOps = (aba: 'movimentacoes' | 'ajustes') =>
    prefix === '/erp' ? `/erp/produtos?aba=${aba}` : `/painel/produtos?aba=${aba}`;

  return [
    {
      id: 'vendas',
      title: 'Vendas',
      blurb: 'Receita faturada, metas e comissões — distinto de dinheiro recebido no caixa.',
      links: [
        {
          to: '/painel/relatorio-vendas',
          icon: 'chart',
          title: 'Vendas & Metas',
          text: 'Vendas concluídas, ticket, meta e lucro (quando permitido). Filtros, PDF e Excel autenticado.',
        },
        {
          to: '/painel/metas',
          icon: 'chart',
          title: 'Metas & Comissões',
          text: 'Cadastro e acompanhamento de metas por vendedor.',
        },
        {
          to: '/painel/pedidos',
          icon: 'cart',
          title: 'Consultar vendas',
          text: 'Lookup operacional (cancelar, NF, IMEI) — não é consolidado gerencial.',
          kind: 'ops',
        },
      ],
    },
    {
      id: 'financeiro',
      title: 'Financeiro & Lucros',
      blurb: 'Livro (DRE) e capital de giro. Receita de vendas ≠ entradas do livro ≠ recebido.',
      links: [
        {
          to: finance('dre'),
          icon: 'wallet',
          title: 'Financeiro / DRE',
          text: 'Receitas e despesas do livro no período.',
        },
        {
          to: finance('aging'),
          icon: 'chart',
          title: 'Aging a receber / a pagar',
          text: 'Saldo em aberto por vencimento (due_date real).',
        },
      ],
    },
    {
      id: 'produtos',
      title: 'Produtos & Estoque',
      blurb: 'Inventário com fotos, IMEI e operação de movimentos/balanço.',
      links: [
        {
          to: stockReport('relatorio-estoque'),
          icon: 'box',
          title: 'Estoque (com fotos)',
          text: 'Aparelhos e variações com fotos, custo, venda e entrada. Impressão e compartilhar.',
        },
        {
          to: stockReport('relatorio-imei'),
          icon: 'barcode',
          title: 'Estoque por IMEI',
          text: 'Cada IMEI com custo, venda, entrada/saída e situação.',
        },
        {
          to: productsOps('movimentacoes'),
          icon: 'swap',
          title: 'Movimentação de estoque',
          text: 'Operação: entradas, vendas, ajustes e baixas.',
          kind: 'ops',
        },
        {
          to: productsOps('ajustes'),
          icon: 'clipboard',
          title: 'Balanço e alertas',
          text: 'Operação: saldo, mínimo/máximo, markup e margem.',
          kind: 'ops',
        },
      ],
    },
    {
      id: 'os',
      title: 'Oficina (OS)',
      blurb: 'Consumo de peças — margem de OS fechada ainda não é KPI confiável no schema.',
      links: [
        {
          to: '/painel/os/pecas?aba=relatorio',
          icon: 'wrench',
          title: 'Peças de manutenção',
          text: 'Consumo, estoque baixo e encomendas — CSV e impressão.',
        },
      ],
    },
    {
      id: 'catalogo',
      title: 'Catálogo digital',
      blurb: 'Pedidos reais de clientes quando o produto/opção não está disponível.',
      links: [
        {
          to: '/painel/solicitacoes-compra',
          icon: 'store',
          title: 'Leads / solicitações de compra',
          text: 'Lista operacional das solicitações do catálogo — sem funil BI inventado.',
        },
      ],
    },
    {
      id: 'clientes',
      title: 'Clientes',
      blurb: 'Cadastro e recorte de vendas por cliente no relatório de vendas.',
      links: [
        {
          to: '/painel/relatorio-vendas',
          icon: 'people',
          title: 'Vendas por cliente',
          text: 'Use o filtro de cliente em Vendas & Metas (dados de sales_orders).',
        },
        {
          to: '/painel/pessoas?aba=clientes',
          icon: 'people',
          title: 'Cadastro de clientes',
          text: 'Operação: ficha, crédito e contatos.',
          kind: 'ops',
        },
      ],
    },
    {
      id: 'cotacoes',
      title: 'Cotações',
      blurb: 'Cotação rápida e orçamentos existem como operação; funil SQL ainda não.',
      links: [
        {
          to: '/painel/cotacao',
          icon: 'cart',
          title: 'Cotação rápida',
          text: 'Ferramenta de preço — não é relatório consolidado.',
          kind: 'ops',
        },
        {
          to: '/painel/orcamentos',
          icon: 'clipboard',
          title: 'Orçamentos / propostas',
          text: 'Gestão de propostas — estado em módulo; sem relatório SQL de conversão.',
          kind: 'ops',
        },
      ],
      unavailable:
        'Funil/conversão de orçamentos PDV em relatório gerencial: indisponível — a API não grava pos_quotes de forma consultável (estado em JSON de módulo). Sem gráficos mock.',
    },
  ];
}
