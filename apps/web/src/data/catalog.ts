export const PLANS = [
  {
    id: 'start',
    name: 'Start',
    price: 'R$ 297',
    period: '/mês',
    blurb: 'Plano básico: escolha 1 módulo para começar.',
    maxModules: 1,
    features: [
      '1 módulo liberado (Totem, Pré-vendas, OS ou ERP)',
      'Painel web da loja',
      '1 unidade / operação enxuta',
      'Suporte em horário comercial',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 'R$ 597',
    period: '/mês',
    blurb: 'Plano intermediário: combine até 2 módulos.',
    featured: true,
    maxModules: 2,
    features: [
      'Até 2 módulos à sua escolha',
      'Multi-usuário no painel',
      'Relatórios de interesse',
      'Personalização de marca da loja',
      'Prioridade no suporte',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 'Sob consulta',
    period: '',
    blurb: 'Plano completo: tudo integrado (Totem + Pré-vendas + OS + ERP).',
    maxModules: 4,
    allModules: true,
    features: [
      'Todos os módulos liberados',
      'Totem + Pré-vendas + OS + ERP integrados',
      'Ambiente dedicado',
      'Integrações sob demanda',
      'Acompanhamento comercial',
    ],
  },
] as const;

export type PlanId = (typeof PLANS)[number]['id'];

export const PARTNER_MODULES = [
  {
    id: 'totem',
    name: 'Totem',
    blurb: 'Autoatendimento na loja com lead no WhatsApp.',
  },
  {
    id: 'presales',
    name: 'Pré-vendas',
    blurb: 'Captura de interesse e acompanhamento comercial.',
  },
  {
    id: 'os',
    name: 'Ordem de serviço',
    blurb: 'OS online ligada à operação da loja.',
  },
  {
    id: 'erp',
    name: 'ERP',
    blurb: 'Gestão e estoque no mesmo ecossistema.',
  },
] as const;

export type PartnerModuleId = (typeof PARTNER_MODULES)[number]['id'];

export const BRAZIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export function isPlanId(value: string | null): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}

export function getPlanById(planId: PlanId) {
  return PLANS.find((plan) => plan.id === planId) ?? PLANS[0];
}

export function getPlanModuleLimit(planId: PlanId) {
  const plan = getPlanById(planId);
  return plan.maxModules;
}

export function planIncludesAllModules(planId: PlanId) {
  const plan = getPlanById(planId);
  return 'allModules' in plan && plan.allModules === true;
}
