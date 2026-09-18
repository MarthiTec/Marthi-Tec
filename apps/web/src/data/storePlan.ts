import {
  getPlanById,
  getPlanModuleLimit,
  isPlanId,
  PARTNER_MODULES,
  planIncludesAllModules,
  type PartnerModuleId,
  type PlanId,
} from './catalog';

const STORAGE_KEY = 'marthi.store.plan';

export type StoreEntitlement = {
  planId: PlanId;
  modules: PartnerModuleId[];
};

const ALL_MODULES = PARTNER_MODULES.map((item) => item.id);

function allModules(): PartnerModuleId[] {
  return [...ALL_MODULES];
}

export function clampModulesForPlan(planId: PlanId, modules: PartnerModuleId[]) {
  if (planIncludesAllModules(planId)) return allModules();
  const unique = modules.filter((id, index) => modules.indexOf(id) === index);
  return unique.slice(0, getPlanModuleLimit(planId));
}

export function defaultEntitlement(): StoreEntitlement {
  return { planId: 'scale', modules: allModules() };
}

function read(): StoreEntitlement {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultEntitlement();
    const parsed = JSON.parse(raw) as Partial<StoreEntitlement>;
    const planId: PlanId =
      parsed.planId && isPlanId(parsed.planId) ? parsed.planId : 'scale';
    const modules = Array.isArray(parsed.modules)
      ? parsed.modules.filter((item): item is PartnerModuleId =>
          ALL_MODULES.includes(item as PartnerModuleId),
        )
      : [];
    return { planId, modules: clampModulesForPlan(planId, modules) };
  } catch {
    return defaultEntitlement();
  }
}

export function getStoreEntitlement() {
  return read();
}

export function saveStoreEntitlement(input: StoreEntitlement) {
  const next = {
    planId: input.planId,
    modules: clampModulesForPlan(input.planId, input.modules),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('marthi-plan-updated'));
  return next;
}

export function hasModule(id: PartnerModuleId) {
  const entitlement = read();
  if (planIncludesAllModules(entitlement.planId)) return true;
  return entitlement.modules.includes(id);
}

export function moduleForPath(pathname: string): PartnerModuleId | null {
  if (pathname.startsWith('/totem') || pathname.startsWith('/painel/totem')) return 'totem';
  if (pathname.startsWith('/painel/pdv') || pathname.startsWith('/painel/pedidos')) return 'presales';
  if (pathname.startsWith('/painel/os')) return 'os';
  if (
    pathname.startsWith('/painel/clientes') ||
    pathname.startsWith('/painel/estoque') ||
    pathname.startsWith('/painel/atributos') ||
    pathname.startsWith('/painel/tabelas') ||
    pathname.startsWith('/painel/pagamentos') ||
    pathname.startsWith('/painel/financeiro')
  ) {
    return 'erp';
  }
  return null;
}

export function planLabel(planId: PlanId) {
  return getPlanById(planId).name;
}
