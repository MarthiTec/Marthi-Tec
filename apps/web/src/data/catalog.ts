export const PLANS = [
  {
    id: 'bronze',
    name: 'Bronze',
    price: 'R$ 297',
    period: '/mês',
    blurb: 'Comece com 1 módulo e opere enxuto.',
    maxModules: 1,
    features: [
      '1 módulo liberado à sua escolha',
      'Totem, OS, ERP ou Emissor Fiscal',
      'Painel web da loja',
      '1 unidade / operação enxuta',
      'Suporte em horário comercial',
      'Atualizações da plataforma',
    ],
  },
  {
    id: 'silver',
    name: 'Silver',
    price: 'R$ 597',
    period: '/mês',
    blurb: 'Combine 2 módulos e conecte a operação.',
    featured: true,
    maxModules: 2,
    features: [
      'Até 2 módulos liberados',
      'Multi-usuário no painel',
      'Permissões por funcionário',
      'Relatórios da operação',
      'Personalização de marca da loja',
      'Prioridade no suporte',
    ],
  },
  {
    id: 'golden',
    name: 'Golden',
    price: 'Sob consulta',
    period: '',
    blurb: 'Tudo liberado: Totem + OS + ERP + Emissor Fiscal.',
    maxModules: 4,
    allModules: true,
    features: [
      'Todos os módulos liberados',
      'Totem + OS + ERP + Emissor Fiscal',
      'Ambiente dedicado',
      'Integrações sob demanda',
      'Acompanhamento comercial',
      'Suporte prioritário contínuo',
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
    id: 'os',
    name: 'Ordem de serviço',
    blurb: 'OS online: orçamento, oficina, agenda e entrega.',
  },
  {
    id: 'erp',
    name: 'ERP',
    blurb: 'Produtos, PDV, pessoas, financeiro e estoque.',
  },
  {
    id: 'fiscal',
    name: 'Emissor Fiscal',
    blurb: 'Notas, NCM/CFOP, classificação e reforma (IBS/CBS).',
  },
] as const;

export type PartnerModuleId = (typeof PARTNER_MODULES)[number]['id'];

export const BRAZIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

/** Migra IDs antigos (Start/Growth/Scale) para Bronze/Silver/Golden. */
export function normalizePlanId(value: string | null | undefined): PlanId | null {
  if (!value) return null;
  if (value === 'start') return 'bronze';
  if (value === 'growth') return 'silver';
  if (value === 'scale') return 'golden';
  return PLANS.some((plan) => plan.id === value) ? (value as PlanId) : null;
}

/** Migra módulo antigo `presales` → `erp` (PDV passa a fazer parte do ERP). */
export function normalizeModuleId(value: string): PartnerModuleId | null {
  if (value === 'presales') return 'erp';
  return PARTNER_MODULES.some((module) => module.id === value)
    ? (value as PartnerModuleId)
    : null;
}

export function isPlanId(value: string | null): value is PlanId {
  return normalizePlanId(value) !== null;
}

export function getPlanById(planId: PlanId) {
  const id = normalizePlanId(planId) ?? 'bronze';
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}

export function getPlanModuleLimit(planId: PlanId) {
  return getPlanById(planId).maxModules;
}

export function planIncludesAllModules(planId: PlanId) {
  const plan = getPlanById(planId);
  return 'allModules' in plan && plan.allModules === true;
}
