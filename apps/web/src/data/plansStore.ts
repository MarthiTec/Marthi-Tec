import { logAudit } from './auditLog';
import { type PlanId } from './catalog';

export type CommercialPlan = {
  id: PlanId;
  name: string;
  price: string;
  priceNumeric: number;
  promotionalPrice?: string;
  period: string;
  blurb: string;
  fullDescription?: string;
  commercialCallout?: string;
  homeSummary?: string;
  featured: boolean;
  displayOrder: number;
  active: boolean;
  maxModules: number;
  allModules?: boolean;
  features: string[];
};

const STORAGE_KEY = 'marthi.commercial.plans.v2';
export const PLANS_UPDATED_EVENT = 'marthi-plans-updated';

export const INITIAL_COMMERCIAL_PLANS: CommercialPlan[] = [
  {
    id: 'bronze',
    name: 'Bronze',
    price: 'R$ 197',
    priceNumeric: 197,
    period: '/mês',
    blurb: '1 módulo à escolha + painel da loja com orçamentos básicos. Ideal para começar enxuto.',
    fullDescription: 'Plano inicial para empresas e lojas que precisam de uma operação ágil e focada em um módulo essencial (Totem, Cardápio Digital, OS, PDV, Retaguarda, Fiscal ou E-commerce), mantendo controle total no painel web.',
    commercialCallout: 'Ideal para começar enxuto',
    homeSummary: '1 módulo à sua escolha com painel completo da loja, orçamentos e perfil de operador.',
    featured: false,
    displayOrder: 1,
    active: true,
    maxModules: 1,
    features: [
      '1 módulo à escolha (Totem, Cardápio Digital, OS, PDV, Retaguarda, Fiscal ou E-commerce)',
      'Painel web da loja com perfil de operador e gestão central',
      'Orçamentos comerciais e emissão de propostas básicas',
      'Central com casinha em cada app (mesma experiência integrada)',
      '1 unidade / operação enxuta com retaguarda leve',
      'Suporte em horário comercial e atualizações contínuas',
    ],
  },
  {
    id: 'silver',
    name: 'Silver',
    price: 'R$ 497',
    priceNumeric: 497,
    period: '/mês',
    blurb: 'Até 2 módulos + Orçamentos em PDF, Campanhas Promocionais e PDV com persistência.',
    fullDescription: 'O plano mais equilibrado para empresas em crescimento, combinando frente de caixa blindada ou ordem de serviço com gestão de estoque, orçamentos em PDF por WhatsApp/E-mail e motor de campanhas promocionais.',
    commercialCallout: 'Mais escolhido por comércios e restaurantes',
    homeSummary: 'Até 2 módulos liberados com motor de campanhas, orçamentos em PDF e equipe multi-usuário.',
    featured: true,
    displayOrder: 2,
    active: true,
    maxModules: 2,
    features: [
      'Até 2 módulos liberados (ex: Retaguarda com Orçamentos + PDV com Campanhas, ou Cardápio Digital + PDV)',
      'Motor de Campanhas Promocionais (Leve X Pague Y, Faixas de Preço por Volume, Brindes)',
      'Orçamentos Comerciais em PDF com envio direto por WhatsApp e E-mail',
      'PDV com persistência blindada contra queda de energia e F5 (recuperação automática)',
      'Multi-usuário no painel com permissões detalhadas por funcionário',
      'Personalização com a marca da sua loja e prioridade no suporte',
    ],
  },
  {
    id: 'golden',
    name: 'Golden',
    price: 'R$ 597',
    priceNumeric: 597,
    period: '/mês',
    blurb: 'Ecossistema completo: Totem, Cardápio Digital & Food, OS, PDV, Retaguarda, Fiscal e E-commerce.',
    fullDescription: 'Solução completa all-in-one para máxima eficiência operacional, unindo autoatendimento no totem, cardápio digital com QR code e KDS cozinha, retaguarda completa com orçamentos e campanhas, PDV blindado, emissor fiscal e vendas online.',
    commercialCallout: 'Ecossistema completo sem limitações',
    homeSummary: 'Todos os módulos liberados: Cardápio Digital, Campanhas, Orçamentos, Fiscal e Suporte VIP.',
    featured: false,
    displayOrder: 3,
    active: true,
    maxModules: 7,
    allModules: true,
    features: [
      'Todos os módulos liberados: Totem + Cardápio Digital & KDS + OS + PDV + Retaguarda + Fiscal + E-commerce',
      'Cardápio digital via QR Code nas mesas, gestão de comandas e KDS na TV da cozinha',
      'Motor avançado de Campanhas Promocionais com validação e proteção de margem de lucro',
      'Orçamentos Comerciais em PDF com conversão em 1 clique para venda no caixa',
      'PDV veloz com recuperação offline/queda de energia, estorno seguro e conciliação financeira',
      'Emissor fiscal completo (NF-e, NFC-e, NFS-e, CT-e, MDF-e) e integração com marketplaces',
      'Acompanhamento comercial dedicado e suporte VIP prioritário contínuo',
    ],
  },
];

let memoryPlans: CommercialPlan[] | null = null;

function load(): CommercialPlan[] {
  if (memoryPlans) return memoryPlans;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memoryPlans = [...INITIAL_COMMERCIAL_PLANS];
      return memoryPlans;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      memoryPlans = parsed;
      return memoryPlans!;
    }
  } catch {
    /* fallback */
  }
  memoryPlans = [...INITIAL_COMMERCIAL_PLANS];
  return memoryPlans;
}

function persist(plans: CommercialPlan[]) {
  memoryPlans = [...plans];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    /* ignore storage quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PLANS_UPDATED_EVENT, { detail: plans }));
  }
}

export function getCommercialPlans(includeInactive = false): CommercialPlan[] {
  const all = load();
  const sorted = [...all].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  if (includeInactive) return sorted;
  return sorted.filter((p) => p.active !== false);
}

export function getCommercialPlanById(id: PlanId): CommercialPlan | undefined {
  const all = load();
  return all.find((p) => p.id === id);
}

export function updateCommercialPlan(
  planId: PlanId,
  changes: Partial<CommercialPlan>,
  actor?: { name: string; email: string },
): CommercialPlan {
  const plans = load();
  const index = plans.findIndex((p) => p.id === planId);
  if (index === -1) {
    throw new Error(`Plano "${planId}" não encontrado.`);
  }

  const prev = plans[index];
  const next: CommercialPlan = {
    ...prev,
    ...changes,
    id: planId, // id é imutável
  };

  // Se o preço numérico mudar ou o preço texto mudar, manter sincronizado se possível
  if (changes.priceNumeric !== undefined && changes.price === undefined) {
    next.price = changes.priceNumeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  plans[index] = next;
  persist(plans);

  // Registro de Auditoria detalhado
  const changesList: string[] = [];
  if (changes.name !== undefined && changes.name !== prev.name) {
    changesList.push(`Nome: de "${prev.name}" para "${changes.name}"`);
  }
  if (changes.price !== undefined && changes.price !== prev.price) {
    changesList.push(`Preço: de "${prev.price}" para "${changes.price}"`);
  }
  if (changes.promotionalPrice !== undefined && changes.promotionalPrice !== prev.promotionalPrice) {
    changesList.push(`Preço promocional: de "${prev.promotionalPrice || 'Nenhum'}" para "${changes.promotionalPrice || 'Nenhum'}"`);
  }
  if (changes.blurb !== undefined && changes.blurb !== prev.blurb) {
    changesList.push(`Descrição: "${changes.blurb}"`);
  }
  if (changes.commercialCallout !== undefined && changes.commercialCallout !== prev.commercialCallout) {
    changesList.push(`Chamada comercial: "${changes.commercialCallout}"`);
  }
  if (changes.featured !== undefined && changes.featured !== prev.featured) {
    changesList.push(`Destaque: ${changes.featured ? 'Ativado' : 'Desativado'}`);
  }
  if (changes.active !== undefined && changes.active !== prev.active) {
    changesList.push(`Status: ${changes.active ? 'Ativo' : 'Inativo'}`);
  }
  if (changes.features !== undefined) {
    changesList.push(`Funcionalidades (${changes.features.length} itens configurados)`);
  }

  logAudit({
    kind: 'action',
    actorName: actor?.name || 'Administrador Marthi',
    actorEmail: actor?.email || 'admin@marthi.com.br',
    action: `Alteração no plano ${prev.name}`,
    detail: changesList.length > 0 ? changesList.join('; ') : 'Configurações do plano atualizadas',
    path: '/admin/planos',
  });

  return next;
}

export function resetCommercialPlansToDefault(actor?: { name: string; email: string }) {
  persist(INITIAL_COMMERCIAL_PLANS);
  logAudit({
    kind: 'action',
    actorName: actor?.name || 'Administrador Marthi',
    actorEmail: actor?.email || 'admin@marthi.com.br',
    action: 'Restauração dos planos comerciais para padrão',
    detail: 'Todos os planos foram restaurados para os valores e descrições de fábrica.',
    path: '/admin/planos',
  });
  return [...INITIAL_COMMERCIAL_PLANS];
}
