/** Painel da operação: números calculados no banco pela API (/dashboard/summary). */
export type DayPoint = {
  key: string;
  label: string;
  inflow: number;
  outflow: number;
  sales: number;
};

export type TechnicianRank = {
  name: string;
  closedCount: number;
  revenue: number;
  returns: number;
  inProgress: number;
  avgTicket: number;
};

export type DashboardSnapshot = {
  cashBalance: number;
  treasury: number;
  payablesOpen: number;
  receivablesOpen: number;
  advancesOpen: number;
  soldCount: number;
  revenuePeriod: number;
  expensePeriod: number;
  resultPeriod: number;
  openOs: number;
  lowStock: number;
  series: DayPoint[];
  mix: { label: string; value: number; tone: string }[];
  technicians: TechnicianRank[];
  topCloser: TechnicianRank | null;
  topEarner: TechnicianRank | null;
  topReturns: TechnicianRank | null;
  deliveredCount: number;
  returnRate: number;
  openPosTickets?: number;
  skuCount?: number;
  stockUnits?: number;
};

let nestSnapshot: DashboardSnapshot | null = null;

export function getCachedDashboardSnapshot() {
  return nestSnapshot;
}

export function replaceDashboardSnapshot(snapshot: DashboardSnapshot | null) {
  nestSnapshot = snapshot;
}

/** Painel sem dados ainda (antes da resposta do banco ou se ela falhar). */
const EMPTY_SNAPSHOT: DashboardSnapshot = {
  cashBalance: 0, treasury: 0, payablesOpen: 0, receivablesOpen: 0, advancesOpen: 0, soldCount: 0,
  revenuePeriod: 0, expensePeriod: 0, resultPeriod: 0, openOs: 0, lowStock: 0, series: [], mix: [],
  technicians: [], topCloser: null, topEarner: null, topReturns: null, deliveredCount: 0, returnRate: 0,
};

/** Último resumo lido do banco; zerado até a primeira resposta da API. */
export function getDashboardSnapshot(): DashboardSnapshot {
  return nestSnapshot ?? EMPTY_SNAPSHOT;
}

export async function hydrateDashboardFromApi(days = 7) {
  const { isNestAuthed } = await import('../services/nestClient');
  if (!isNestAuthed()) {
    nestSnapshot = null;
    return getDashboardSnapshot();
  }
  const { apiGetDashboardSummary } = await import('../services/erpApi');
  const remote = await apiGetDashboardSummary(days);
  nestSnapshot = {
    cashBalance: remote.cashBalance,
    treasury: remote.treasury,
    payablesOpen: remote.payablesOpen,
    receivablesOpen: remote.receivablesOpen,
    advancesOpen: remote.advancesOpen,
    soldCount: remote.soldCount,
    revenuePeriod: remote.revenuePeriod,
    expensePeriod: remote.expensePeriod,
    resultPeriod: remote.resultPeriod,
    openOs: remote.openOs,
    lowStock: remote.lowStock,
    series: remote.series ?? [],
    mix: remote.mix ?? [],
    technicians: remote.technicians ?? [],
    topCloser: remote.topCloser ?? null,
    topEarner: remote.topEarner ?? null,
    topReturns: remote.topReturns ?? null,
    deliveredCount: remote.deliveredCount ?? 0,
    returnRate: remote.returnRate ?? 0,
    openPosTickets: remote.openPosTickets,
    skuCount: remote.skuCount,
    stockUnits: remote.stockUnits,
  };
  return nestSnapshot;
}
