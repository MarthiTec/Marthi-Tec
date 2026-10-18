/**
 * Catálogo público Marthi — o que oferecemos e para quem.
 */

export type MarthiProductId =
  | 'catalogo'
  | 'cotacao'
  | 'ads'
  | 'totem'
  | 'cardapio'
  | 'pdv'
  | 'os'
  | 'erp'
  | 'fiscal'
  | 'ecommerce'
  | 'crm'
  | 'painel';

export type MarthiProduct = {
  id: MarthiProductId;
  name: string;
  tagline: string;
  summary: string;
  audience: string;
  features: string[];
  href?: string;
  cta?: string;
  demo?: 'totem' | 'caixa' | 'os';
  accent: string;
};

export const MARTHI_PRODUCTS: MarthiProduct[] = [
  {
    id: 'catalogo',
    name: 'Catálogo digital',
    tagline: 'Vitrine de aparelhos com link ou PDF',
    summary:
      'Monte a vitrine com celulares e acessórios do estoque, escolha capa e cor, e compartilhe o link ou o PDF. O cliente vê preços e chama no WhatsApp — ou compra na página de venda.',
    audience: 'Lojas de celular que precisam mostrar aparelhos novos e usados sem depender de planilha ou Instagram.',
    features: [
      'Vitrine com aparelhos do estoque (filtro, capa e cor da loja)',
      'Modo catálogo (interesse no WhatsApp) ou página de venda com sacola',
      'Link público e PDF para enviar ao cliente',
      'Solicitação de manutenção integrada à oficina',
    ],
    href: '/painel/catalogo',
    cta: 'Abrir catálogo digital',
    accent: '#e4572e',
  },
  {
    id: 'cotacao',
    name: 'Cotação de preços',
    tagline: 'Preço certo na frente do cliente',
    summary:
      'Custo do fornecedor muda o dia todo: calcule à vista e no cartão com margem e taxa da maquininha, troque aparelho na conta e formalize em orçamento válido no dia.',
    audience: 'Lojas de celular e assistência que cotam aparelhos na hora no balcão.',
    features: [
      'Custo + margem (% ou R$) → preço à vista',
      'Parcelas com taxa da maquininha da loja',
      'Troca (trade-in) de aparelho descontada no valor final',
      'Comparativo por fornecedor e formalização em orçamento',
    ],
    href: '/painel/cotacao',
    cta: 'Abrir cotação rápida',
    accent: '#0f766e',
  },
  {
    id: 'ads',
    name: 'Marthi ADS',
    tagline: 'Anúncios dos seus aparelhos no Facebook',
    summary:
      'Anuncie celulares e acessórios do cadastro na Meta: conecte a conta, crie campanha, acompanhe status e pause pelo painel — sem sair da operação Marthi.',
    audience: 'Lojas de celular que querem impulsionar o estoque com anúncios pagos.',
    features: [
      'Criar anúncio a partir do produto cadastrado',
      'Conexão Meta (Página e conta de anúncios)',
      'Campanhas, mídias e calendário de publicações',
      'Acompanhar, pausar e tratar pendências no painel',
    ],
    href: '/painel/ads',
    cta: 'Abrir Marthi ADS',
    accent: '#0369a1',
  },
  {
    id: 'totem',
    name: 'Totem de autoatendimento',
    tagline: 'Vitrine digital na loja de celular',
    summary:
      'Touch grande, fluxo guiado e lead no WhatsApp da loja. O cliente escolhe aparelhos e serviços; a equipe atende sem fila no balcão.',
    audience: 'Lojas de celular, showroom e assistência com fluxo de atendimento.',
    features: [
      'Catálogo touch de aparelhos e acessórios',
      'Lead automático no WhatsApp da loja',
      'Insights no painel (interesses e conversão)',
      'Marca da loja personalizável',
    ],
    href: '/totem',
    cta: 'Ver demo do totem',
    demo: 'totem',
    accent: '#0f766e',
  },
  {
    id: 'cardapio',
    name: 'Cardápio Digital & Food',
    tagline: 'QR Code nas mesas, KDS e comandas',
    summary:
      'Cardápio interativo via QR Code para mesas e comandas, tela KDS na cozinha e pedidos integrados diretamente ao caixa e ao estoque.',
    audience: 'Restaurantes, lanchonetes, bares, cafeterias, hamburguerias e delivery.',
    features: [
      'Cardápio interativo via QR Code para mesas e salão',
      'Emissão e impressão de displays de mesa com QR Code',
      'KDS (Fila de pedidos em tempo real na TV da cozinha)',
      'Lançamento de pedidos para garçons em celulares e tablets',
      'Integração imediata com fechamento no PDV e conciliação',
    ],
    href: '/cardapio',
    cta: 'Abrir cardápio digital',
    accent: '#ea580c',
  },
  {
    id: 'pdv',
    name: 'PDV / Caixa',
    tagline: 'Caixa para venda de aparelhos',
    summary:
      'Caixa rápido para celulares e acessórios, com persistência contra queda de energia ou F5, campanhas promocionais e conversão direta de orçamentos e trocas.',
    audience: 'Lojas de celular que precisam de caixa estável e integrado ao estoque e à OS.',
    features: [
      'Persistência local blindada: nunca perca itens por F5 ou falta de energia',
      'Motor de campanhas promocionais: Leve X Pague Y e faixas de volume',
      'Importação e conversão de orçamentos comerciais com 1 clique',
      'Cancelamento e estorno seguro com reposição de estoque e conciliação',
      'NFC-e integrada, controle de sangria/aporte e múltiplos pagamentos',
    ],
    href: '/caixa',
    cta: 'Ver demo do caixa',
    demo: 'caixa',
    accent: '#1d4ed8',
  },
  {
    id: 'os',
    name: 'Ordem de serviço',
    tagline: 'Manutenção de celular sob controle',
    summary:
      'Abertura de OS para aparelhos, agenda de bancada, proposta e garantia em PDF via WhatsApp e E-mail, peças no estoque e recebimento no PDV.',
    audience: 'Assistências técnicas de celular e lojas com pós-venda e garantia.',
    features: [
      'Abertura de OS, checklist técnico e agenda de bancada',
      'Envio de Termo de Garantia e OS em PDF via WhatsApp e E-mail',
      'Integração direta de peças com o estoque e fechamento no caixa',
      'Quadro Kanban de status operacional até a entrega ao cliente',
    ],
    href: '/os',
    cta: 'Ver demo da OS',
    demo: 'os',
    accent: '#b45309',
  },
  {
    id: 'erp',
    name: 'Retaguarda da loja',
    tagline: 'Estoque, orçamentos e financeiro',
    summary:
      'Gestão da loja de celular: propostas em PDF via WhatsApp e E-mail, campanhas, estoque com custo médio (incluindo IMEI) e financeiro.',
    audience: 'Lojas de celular que cresceram além da planilha e precisam de um centro de comando.',
    features: [
      'Orçamentos comerciais em PDF com envio por WhatsApp e E-mail',
      'Motor de campanhas promocionais com regras e proteção de margem',
      'Estoque completo com balanço, inventário, custo médio e movimentações',
      'Financeiro: boletos, conciliação bancária, contas a pagar/receber e DRE',
      'Gestão de clientes, fornecedores e equipe com controle de permissões',
    ],
    href: '/erp',
    cta: 'Abrir Retaguarda',
    accent: '#0e7490',
  },
  {
    id: 'fiscal',
    name: 'Emissor Fiscal',
    tagline: 'Notas no ritmo da reforma',
    summary:
      'NF-e e NFC-e no ritmo da venda de aparelhos. NFS-e, CT-e e MDF-e em app próprio. NCM, CFOP, CST e preparação para IBS/CBS.',
    audience: 'Lojas de celular que emitem documento fiscal e querem centralizar no Marthi.',
    features: [
      'NF-e, NFS-e, CT-e e MDF-e',
      'Cadastro de emitente e CST',
      'Classificação fiscal (NCM/CFOP)',
      'NFC-e integrada ao caixa',
    ],
    href: '/fiscal',
    cta: 'Abrir emissor',
    accent: '#7c3aed',
  },
  {
    id: 'ecommerce',
    name: 'E-commerce e marketplaces',
    tagline: 'Canais online conectados ao estoque',
    summary:
      'Hub de canais para anunciar aparelhos online: Mercado Livre, Shopee, Amazon e Tray. Anúncios, pedidos e sincronização de estoque.',
    audience: 'Lojas de celular que vendem no físico e nos marketplaces.',
    features: [
      'Conexões por marketplace e hub',
      'Pedidos e anúncios no mesmo lugar',
      'Sync de estoque e imagens',
      'Credenciais e status por canal',
    ],
    href: '/ecommerce',
    cta: 'Abrir e-commerce',
    accent: '#db2777',
  },
  {
    id: 'crm',
    name: 'CRM Marthi',
    tagline: 'Leads e funil comercial',
    summary:
      'Kanban, conversas e perfil do vendedor. Funil de leads da homepage e demos — uso interno da equipe Marthi e acompanhamento comercial.',
    audience: 'Vendedores e comercial Marthi; lojas que acompanham leads de interesse.',
    features: [
      'Funil: primeiro contato → pagamento → fechamento',
      'Conversas com leads e entre a equipe',
      'Perfil do vendedor na rede interna',
      'Claim exclusivo de lead',
    ],
    href: '/admin/crm',
    cta: 'Abrir CRM',
    accent: '#0369a1',
  },
  {
    id: 'painel',
    name: 'Painel da loja',
    tagline: 'O centro de comando',
    summary:
      'Atalhos para PDV, totem, OS, Retaguarda, plano e ajuda. É de onde a gestão acompanha a operação da loja de celular.',
    audience: 'Gestores e equipe operacional da loja de celular.',
    features: [
      'Dashboard e atalhos por módulo',
      'Perfil do operador unificado (foto e contato)',
      'Configuração de plano e permissões',
      'Ajuda e suporte Marthi',
    ],
    href: '/painel',
    cta: 'Entrar no painel',
    accent: '#334155',
  },
];

/** Segmentos em evidência no site público (foco comercial atual: celular). */
export const MARTHI_SEGMENTS = [
  {
    id: 'varejo-celular',
    name: 'Loja de celular',
    text: 'Venda de aparelhos novos e usados: catálogo digital, cotação no balcão, totem, PDV e estoque no mesmo painel.',
  },
  {
    id: 'assistencia',
    name: 'Assistência técnica de celular',
    text: 'OS com agenda de bancada, propostas e garantia em PDF via WhatsApp — do atendimento à entrega do aparelho.',
  },
  {
    id: 'ads-vitrine',
    name: 'Vitrine e anúncios',
    text: 'Marthi ADS e catálogo público para impulsionar o estoque de celulares sem sair da operação.',
  },
  {
    id: 'comercial',
    name: 'Time comercial',
    text: 'CRM interno Marthi — funil e rede da equipe comercial.',
  },
] as const;

/** IDs promovidos no marketing público (home / produtos). Módulos food/ecom permanecem no app. */
export const MARTHI_PUBLIC_PRODUCT_IDS: MarthiProductId[] = [
  'catalogo',
  'cotacao',
  'ads',
  'totem',
  'pdv',
  'os',
  'erp',
  'fiscal',
  'crm',
  'painel',
];

export function getMarthiProduct(id: MarthiProductId) {
  return MARTHI_PRODUCTS.find((item) => item.id === id) ?? null;
}
