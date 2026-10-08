/**
 * Catálogo público Marthi — o que oferecemos e para quem.
 */

export type MarthiProductId =
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
    tagline: 'Caixa veloz com persistência blindada',
    summary:
      'Caixa rápido com persistência contra queda de energia ou F5, recuperação com 1 clique, motor de campanhas promocionais e conversão direta de orçamentos.',
    audience: 'Lojas físicas, mercados e comércios que precisam de caixa ultra-estável e integrado.',
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
    tagline: 'Oficina técnica e bancada sob controle',
    summary:
      'Abertura de OS, agenda de bancada, envio de proposta e garantia em PDF via WhatsApp e E-mail, integração direta de peças com o estoque e recebimento no PDV.',
    audience: 'Assistências técnicas, oficinas mecânicas, serviços especializados e lojas com pós-venda.',
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
    tagline: 'Orçamentos, Campanhas, Estoque e Financeiro',
    summary:
      'Gestão integrada completa com geração de propostas comerciais em PDF via WhatsApp e E-mail, motor de campanhas de desconto, estoque com custo médio e financeiro.',
    audience: 'Lojas e comércios que cresceram além da planilha e precisam de um centro de comando unificado.',
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
    href: '/admin/crm',
    cta: 'Abrir CRM',
    accent: '#0369a1',
  },
  {
    id: 'painel',
    name: 'Painel da loja',
    tagline: 'O centro de comando',
    summary:
      'Atalhos para PDV, totem, OS, Retaguarda, plano e ajuda. É de onde a gestão acompanha a operação.',
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
    text: 'Totem na vitrine, PDV no balcão com campanhas e persistência, estoque e clientes no mesmo painel.',
  },
  {
    id: 'food',
    name: 'Restaurantes e Food Service',
    text: 'Cardápio digital via QR Code, mesas e comandas, tela KDS na cozinha e caixa ágil.',
  },
  {
    id: 'oficina',
    name: 'Oficina e assistência',
    text: 'OS com agenda, propostas e garantia em PDF via WhatsApp/E-mail — do atendimento à bancada.',
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
