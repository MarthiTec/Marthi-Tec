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

export function canSeeReports(access: AccessContext | null | undefined) {
  return hasArea(access, 'erp_audit') || hasArea(access, 'pdv');
}
