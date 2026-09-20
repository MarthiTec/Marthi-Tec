import {
  getPlanById,
  getPlanModuleLimit,
  normalizeModuleId,
  normalizePlanId,
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
  return { planId: 'golden', modules: allModules() };
}

function read(): StoreEntitlement {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultEntitlement();
    const parsed = JSON.parse(raw) as Partial<StoreEntitlement>;
    const planId = normalizePlanId(parsed.planId ?? null) ?? 'golden';
    const modules = Array.isArray(parsed.modules)
      ? parsed.modules
          .map((item) => normalizeModuleId(String(item)))
          .filter((item): item is PartnerModuleId => Boolean(item))
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
  const planId = normalizePlanId(input.planId) ?? 'bronze';
  const next = {
    planId,
    modules: clampModulesForPlan(planId, input.modules),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  try {
    localStorage.setItem('marthi.store.contracted', '1');
  } catch {
    /* ignore */
  }
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
  if (pathname.startsWith('/caixa')) return 'erp';
  if (pathname.startsWith('/painel/os') || pathname.startsWith('/os')) return 'os';
  if (
    pathname.startsWith('/fiscal') ||
    pathname.startsWith('/painel/notas') ||
    pathname.startsWith('/painel/fiscal') ||
    pathname.startsWith('/painel/classificacao-fiscal') ||
    pathname.startsWith('/painel/cfop')
  ) {
    return 'fiscal';
  }
  if (pathname.startsWith('/ecommerce')) return 'ecommerce';
  if (
    pathname.startsWith('/painel/pdv') ||
    pathname.startsWith('/painel/pedidos') ||
    pathname.startsWith('/painel/pagamentos') ||
    pathname.startsWith('/painel/clientes') ||
    pathname.startsWith('/painel/produtos') ||
    pathname.startsWith('/painel/estoque') ||
    pathname.startsWith('/painel/atributos') ||
    pathname.startsWith('/painel/kits') ||
    pathname.startsWith('/painel/lotes') ||
    pathname.startsWith('/painel/almoxarifado') ||
    pathname.startsWith('/painel/tabelas') ||
    pathname.startsWith('/painel/financeiro') ||
    pathname.startsWith('/painel/vendedores') ||
    pathname.startsWith('/painel/fornecedores') ||
    pathname.startsWith('/painel/funcionarios') ||
    pathname.startsWith('/painel/permissoes') ||
    pathname.startsWith('/painel/auditoria')
  ) {
    return 'erp';
  }
  return null;
}

export function planLabel(planId: PlanId) {
  return getPlanById(planId).name;
}
