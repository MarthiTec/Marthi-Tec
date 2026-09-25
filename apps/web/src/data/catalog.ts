export const PLANS = [
  {
    id: 'bronze',
    name: 'Bronze',
    price: 'R$ 197',
    period: '/mês',
    blurb: '1 módulo + painel da loja. Ideal para começar enxuto.',
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
    period: '/mês',
    blurb: 'Até 2 módulos + time no painel e permissões.',
    featured: true,
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
    period: '/mês',
    blurb: 'Tudo liberado: Totem, OS, PDV, Retaguarda, Fiscal e E-commerce.',
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
] as const;

export type PlanId = (typeof PLANS)[number]['id'];

export const PARTNER_MODULES = [
  {
    id: 'totem',
    name: 'Totem',
    blurb: 'Autoatendimento touch na loja com lead no WhatsApp e insights no painel.',
  },
  {
    id: 'os',
    name: 'Ordem de serviço',
    blurb: 'Oficina: OS, orçamento, agenda da bancada, status e relatório.',
  },
  {
    id: 'pdv',
    name: 'PDV / Caixa',
    blurb: 'Frente de caixa rápido, recebimento de OS, sangria/aporte e múltiplos pagamentos.',
  },
  {
    id: 'erp',
    name: 'Retaguarda',
    blurb: 'Estoque completo (balanço/movimentos), compras, financeiro e gestão integrada.',
  },
  {
    id: 'fiscal',
    name: 'Emissor Fiscal',
    blurb: 'NF-e, NFS-e, CT-e, MDF-e; NFC-e no PDV; NCM/CFOP e reforma (IBS/CBS).',
  },
  {
    id: 'ecommerce',
    name: 'E-commerce',
    blurb: 'Mercado Livre, Shopee, iFood, Amazon e hubs (Tray) com sync de estoque.',
  },
] as const;

export type PartnerModuleId = (typeof PARTNER_MODULES)[number]['id'];

/** Incluso em todo plano — não consome vaga de módulo. */
export const PLATFORM_INCLUDES = [
  {
    id: 'painel',
    name: 'Painel da loja',
    blurb: 'Centro de comando, perfil do operador, plano, permissões e atalhos para cada app.',
  },
] as const;

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
