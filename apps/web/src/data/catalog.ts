export const PLANS = [
  {
    id: 'bronze',
    name: 'Bronze',
    price: 'R$ 197',
    period: '/mês',
    blurb: '1 módulo à escolha + painel da loja com orçamentos básicos. Ideal para começar enxuto.',
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
    period: '/mês',
    blurb: 'Até 2 módulos + Orçamentos em PDF, Campanhas Promocionais e PDV com persistência.',
    featured: true,
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
    period: '/mês',
    blurb: 'Ecossistema completo: Totem, Cardápio Digital & Food, OS, PDV, Retaguarda, Fiscal e E-commerce.',
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
] as const;

export type PlanId = (typeof PLANS)[number]['id'];

export const PARTNER_MODULES = [
  {
    id: 'totem',
    name: 'Totem & Cardápio Digital',
    blurb: 'Autoatendimento touch, cardápio digital via QR Code para mesas, lead no WhatsApp e KDS cozinha.',
  },
  {
    id: 'os',
    name: 'Ordem de serviço',
    blurb: 'Oficina: OS e termo de garantia em PDF via WhatsApp/E-mail, agenda da bancada e integração com PDV.',
  },
  {
    id: 'pdv',
    name: 'PDV / Caixa',
    blurb: 'Frente de caixa veloz, persistência contra queda de energia/F5, motor de campanhas e conversão de orçamentos.',
  },
  {
    id: 'erp',
    name: 'Retaguarda',
    blurb: 'Estoque completo (balanço/movimentos), orçamentos comerciais em PDF, motor de campanhas e financeiro.',
  },
  {
    id: 'fiscal',
    name: 'Emissor Fiscal',
    blurb: 'NF-e, NFS-e, CT-e, MDF-e; NFC-e no PDV; NCM/CFOP e preparação para reforma (IBS/CBS).',
  },
  {
    id: 'ecommerce',
    name: 'E-commerce',
    blurb: 'Mercado Livre, Shopee, iFood, Amazon e hubs (Tray) com sincronização de estoque em tempo real.',
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

import { getCommercialPlanById } from './plansStore';

export function getPlanById(planId: PlanId) {
  const id = normalizePlanId(planId) ?? 'bronze';
  const dynamic = getCommercialPlanById(id);
  if (dynamic) return dynamic;
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}

export function getPlanModuleLimit(planId: PlanId) {
  return getPlanById(planId).maxModules;
}

export function planIncludesAllModules(planId: PlanId) {
  const plan = getPlanById(planId);
  return 'allModules' in plan && plan.allModules === true;
}
