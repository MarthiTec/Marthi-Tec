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

const STORAGE_KEY = 'marthi.commercial.plans.v1';
export const PLANS_UPDATED_EVENT = 'marthi-plans-updated';

export const INITIAL_COMMERCIAL_PLANS: CommercialPlan[] = [
  {
    id: 'bronze',
    name: 'Bronze',
    price: 'R$ 197',
    priceNumeric: 197,
    period: '/mês',
    blurb: '1 módulo + painel da loja. Ideal para começar enxuto.',
    fullDescription: 'Plano inicial para empresas e lojas que precisam de uma operação ágil e focada em um módulo essencial, mantendo controle total no painel web.',
    commercialCallout: 'Ideal para começar enxuto',
    homeSummary: '1 módulo à sua escolha com painel completo da loja e perfil de operador.',
    featured: false,
    displayOrder: 1,
    active: true,
    maxModules: 1,
    features: [
      '1 módulo à escolha (Totem, OS, PDV, Retaguarda, Fiscal ou E-commerce)',
      'Painel web da loja com perfil do operador',
      'Central com casinha em cada app (mesma experiência)',
      '1 unidade / operação enxuta',
      'Suporte em horário comercial',
      'Atualizações da plataforma',
    ],
  },
  {
    id: 'silver',
    name: 'Silver',
    price: 'R$ 497',
    priceNumeric: 497,
    period: '/mês',
    blurb: 'Até 2 módulos + time no painel e permissões.',
    fullDescription: 'O plano mais equilibrado para empresas em crescimento, combinando frente de caixa ou ordem de serviço com gestão de estoque e múltiplos operadores.',
    commercialCallout: 'Mais escolhido por oficinas e comércios',
    homeSummary: 'Até 2 módulos liberados com equipe multi-usuário e relatórios detalhados.',
    featured: true,
    displayOrder: 2,
    active: true,
    maxModules: 2,
    features: [
      'Até 2 módulos liberados (ex: OS + PDV, ou Retaguarda + PDV)',
      'Multi-usuário no painel com permissões por funcionário',
      'Perfil operacional unificado (foto, contato) em todos os apps',
      'Relatórios da operação',
      'Personalização de marca da loja',
      'Prioridade no suporte',
    ],
  },
  {
    id: 'golden',
    name: 'Golden',
    price: 'R$ 597',
    priceNumeric: 597,
    period: '/mês',
    blurb: 'Tudo liberado: Totem, OS, PDV, Retaguarda, Fiscal e E-commerce.',
    fullDescription: 'Solução completa all-in-one para máxima eficiência operacional, unindo autoatendimento no totem, retaguarda completa com balanço fiscal, múltiplos caixas e vendas online.',
    commercialCallout: 'Ecossistema completo sem limitações',
    homeSummary: 'Todos os módulos liberados com retaguarda avançada, fiscal e suporte VIP contínuo.',
    featured: false,
    displayOrder: 3,
    active: true,
    maxModules: 6,
    allModules: true,
    features: [
      'Todos os módulos: Totem + OS + PDV + Retaguarda + Fiscal + E-commerce',
      'Retaguarda com balanço, movimentos, boletos e financeiro',
      'PDV/caixa rápido com recebimento de OS e multi-pagamentos',
      'Emissor fiscal e canais de marketplace',
      'Ambiente dedicado e integrações sob demanda',
      'Acompanhamento comercial',
      'Suporte prioritário contínuo',
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
