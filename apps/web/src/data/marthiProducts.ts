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
      'Produtos, clientes, fornecedores, vendedores, tabelas de preço, lotes, kits e financeiro — o núcleo da operação.',
    audience: 'Lojas que cresceram além da planilha e precisam de um único painel.',
    features: [
      'Estoque, atributos, kits e lotes',
      'Clientes, fornecedores e funcionários',
      'Tabelas de preço e pagamentos',
      'Financeiro e permissões por usuário',
    ],
    href: '/painel',
    cta: 'Conhecer o painel',
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
    tagline: 'Funil, WhatsApp e rede de vendedores',
    summary:
      'Kanban de negócios, claim exclusivo de leads, chat e perfil do vendedor. Cliente Marthi só após fechar e pagar.',
    audience: 'Times comerciais e parceiros que captam lead na homepage e no parceiro.',
    features: [
      'Funil: primeiro contato → pagamento → fechamento',
      'Puxar lead = atendimento exclusivo',
      'WhatsApp e timeline no negócio',
      'Vira cliente Marthi só depois de pagar',
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
      'Atalhos para PDV, totem, OS, clientes, estoque, plano e ajuda. É de onde a operação diária acontece.',
    audience: 'Gestores e equipe operacional da loja.',
    features: [
      'Dashboard e atalhos por módulo',
      'Clientes e pedidos',
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
    text: 'CRM com funil, WhatsApp e rede de vendedores Marthi.',
  },
] as const;

export function getMarthiProduct(id: MarthiProductId) {
  return MARTHI_PRODUCTS.find((item) => item.id === id) ?? null;
}
