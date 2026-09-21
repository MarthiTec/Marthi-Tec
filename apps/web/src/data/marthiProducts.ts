/**
 * Catálogo público Marthi — o que oferecemos e para quem.
 */

export type MarthiProductId =
  | 'totem'
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
    id: 'totem',
    name: 'Totem de autoatendimento',
    tagline: 'Vitrine digital na loja',
    summary:
      'Touch grande, fluxo guiado e lead no WhatsApp da loja. O cliente escolhe; a equipe atende sem fila no balcão.',
    audience: 'Varejo, showroom, assistência e qualquer loja com fluxo de atendimento.',
    features: [
      'Catálogo touch com fotos e opções',
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
    id: 'pdv',
    name: 'PDV / Caixa',
    tagline: 'Venda rápida no balcão',
    summary:
      'Caixa completo: venda, troca, vale-compra, sangria, aporte e fechamento. Pensado para o ritmo da loja.',
    audience: 'Lojas físicas que precisam de caixa estável e integrado ao estoque.',
    features: [
      'Venda e troca no mesmo fluxo',
      'Sangria, aporte e fechamento de caixa',
      'Vale-compra e formas de pagamento',
      'NFC-e no PDV quando o fiscal está liberado',
    ],
    href: '/caixa',
    cta: 'Ver demo do caixa',
    demo: 'caixa',
    accent: '#1d4ed8',
  },
  {
    id: 'os',
    name: 'Ordem de serviço',
    tagline: 'Oficina e bancada sob controle',
    summary:
      'Orçamento, oficina, agenda e entrega — app próprio para o operador da bancada acompanhar cada OS.',
    audience: 'Assistências, oficinas, serviços técnicos e lojas com pós-venda.',
    features: [
      'Abertura de OS e orçamento',
      'Agenda da bancada',
      'Status até a entrega',
      'Relatório por ordem de serviço',
    ],
    href: '/os',
    cta: 'Ver demo da OS',
    demo: 'os',
    accent: '#b45309',
  },
  {
    id: 'erp',
    name: 'ERP da loja',
    tagline: 'Estoque, pessoas e financeiro',
    summary:
      'Produtos, PDV, estoque com balanço e movimentos, pessoas, boletos e financeiro — o núcleo da operação.',
    audience: 'Lojas que cresceram além da planilha e precisam de um único painel.',
    features: [
      'Estoque com balanço, movimentos, mín/máx e custo',
      'PDV/caixa no mesmo contrato do ERP',
      'Clientes, fornecedores, funcionários e permissões',
      'Tabelas de preço, boletos e financeiro',
    ],
    href: '/erp',
    cta: 'Abrir ERP',
    accent: '#0e7490',
  },
  {
    id: 'fiscal',
    name: 'Emissor Fiscal',
    tagline: 'Notas no ritmo da reforma',
    summary:
      'NF-e, NFS-e, CT-e e MDF-e em app próprio. NFC-e no PDV. NCM, CFOP, CST e preparação para IBS/CBS.',
    audience: 'Empresas que emitem documento fiscal e querem centralizar no Marthi.',
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
    tagline: 'Venda online conectada ao estoque',
    summary:
      'Hub de canais: Mercado Livre, Shopee, iFood, Amazon e Tray. Anúncios, pedidos e sincronização de estoque.',
    audience: 'Lojas omnichannel que vendem no físico e nos marketplaces.',
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
    tagline: 'Uso interno da equipe Marthi',
    summary:
      'Kanban, conversas e perfil do vendedor Marthi. Ferramenta interna do time comercial — não faz parte do plano da loja.',
    audience: 'Vendedores e comercial Marthi.',
    features: [
      'Funil: primeiro contato → pagamento → fechamento',
      'Conversas com leads e entre a equipe',
      'Perfil do vendedor na rede interna',
      'Claim exclusivo de lead',
    ],
    href: '/crm',
    cta: 'Abrir CRM',
    accent: '#0369a1',
  },
  {
    id: 'painel',
    name: 'Painel da loja',
    tagline: 'O centro de comando',
    summary:
      'Atalhos para PDV, totem, OS, ERP, plano e ajuda. É de onde a gestão acompanha a operação.',
    audience: 'Gestores e equipe operacional da loja.',
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

export const MARTHI_SEGMENTS = [
  {
    id: 'varejo',
    name: 'Varejo e loja física',
    text: 'Totem na vitrine, PDV no balcão, estoque e clientes no mesmo painel.',
  },
  {
    id: 'oficina',
    name: 'Oficina e assistência',
    text: 'OS com agenda, orçamento e entrega — do atendimento à bancada.',
  },
  {
    id: 'omni',
    name: 'Omnichannel',
    text: 'Marketplaces + estoque único + fiscal quando a operação pede nota.',
  },
  {
    id: 'comercial',
    name: 'Time comercial',
    text: 'CRM interno Marthi — funil e rede da equipe comercial.',
  },
] as const;

export function getMarthiProduct(id: MarthiProductId) {
  return MARTHI_PRODUCTS.find((item) => item.id === id) ?? null;
}
