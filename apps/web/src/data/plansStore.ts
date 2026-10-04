import { nestGet, nestPut, nestPost } from '../services/nestClient';
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

let memoryPlans: CommercialPlan[] | null = null;

function load(): CommercialPlan[] {
  if (memoryPlans) return memoryPlans;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memoryPlans = [];
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
  memoryPlans = [];
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

export async function updateCommercialPlan(
  planId: PlanId,
  changes: Partial<CommercialPlan>,
  actor?: { name: string; email: string },
): Promise<CommercialPlan> {
  const plans = load().map(plan => ({ ...plan }));
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

  const saved = await nestPut<CommercialPlan>('/admin/commercial-plans/' + encodeURIComponent(planId), next);
  plans[index] = saved;
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

  return saved;
}

export async function resetCommercialPlansToDefault(actor?: { name: string; email: string }) {
  const saved = await nestPost<CommercialPlan[]>('/admin/commercial-plans/reset');
  persist(saved);
  logAudit({
    kind: 'action',
    actorName: actor?.name || 'Administrador Marthi',
    actorEmail: actor?.email || 'admin@marthi.com.br',
    action: 'Restauração dos planos comerciais para padrão',
    detail: 'Todos os planos foram restaurados para os valores e descrições de fábrica.',
    path: '/admin/planos',
  });
  return saved;
}

export async function hydrateCommercialPlans(all = false) {
  const rows = await nestGet<CommercialPlan[]>(all ? '/admin/commercial-plans' : '/commercial-plans');
  persist(rows);
  return rows;
}
