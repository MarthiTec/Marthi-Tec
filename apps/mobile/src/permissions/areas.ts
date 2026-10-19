import type { AccessContext } from '../api/types';

/** Espelho da lógica de employeeAccess / erpRegistry (UI only — API enforce). */
export function hasArea(access: AccessContext | null | undefined, area: string): boolean {
  if (!access) return false;
  if (access.fullAccess) return true;
  const areas = access.accessAreas ?? [];
  if (areas.includes(area)) return true;
  if (areas.includes('erp') && area.startsWith('erp_')) return true;
  if (areas.includes('fiscal') && (area === 'erp_fiscal' || area === 'erp_invoices')) return true;
  return false;
}

export function canSeeStock(access: AccessContext | null | undefined) {
  return hasArea(access, 'erp_stock') || hasArea(access, 'totem');
}

export function canSeeSales(access: AccessContext | null | undefined) {
  return hasArea(access, 'pdv');
}

export function canSeeOs(access: AccessContext | null | undefined) {
  return hasArea(access, 'os');
}

export function canSeeFinance(access: AccessContext | null | undefined) {
  return hasArea(access, 'erp_finance');
}

/** Assinatura Marthi / Planos & Faturamento (admin da loja). */
export function canSeeBilling(access: AccessContext | null | undefined) {
  if (!access) return false;
  if (access.fullAccess) return true;
  if (hasArea(access, 'erp_plan')) return true;
  const role = String(access.role || '').toLowerCase();
  return role === 'admin' || role === 'owner' || role === 'manager' || role === 'superadmin';
}

export function canSeeReports(access: AccessContext | null | undefined) {
  return hasArea(access, 'erp_audit') || hasArea(access, 'pdv');
}

/** Preço de venda: área de estoque. Custo: financeiro/preços ou gestão. */
export function canSeeSalePrice(access: AccessContext | null | undefined) {
  return canSeeStock(access) || hasArea(access, 'erp_prices') || hasArea(access, 'pdv');
}

export function canSeeCost(access: AccessContext | null | undefined) {
  if (!access) return false;
  if (access.fullAccess) return true;
  return hasArea(access, 'erp_finance') || hasArea(access, 'erp_prices') || hasArea(access, 'erp_stock');
}

/** Espelho de canManageArea + canEdit do funcionário (UI). API enforce de verdade. */
export function canManageStock(access: AccessContext | null | undefined) {
  if (!access) return false;
  if (access.fullAccess) return true;
  if (!canSeeStock(access)) return false;
  const role = String(access.role || '').toLowerCase();
  if (role === 'admin' || role === 'manager' || role === 'owner' || role === 'superadmin') return true;
  const perms = access.permissions ?? {};
  if (role === 'seller') return perms.canEdit === true;
  return perms.canEdit !== false;
}
