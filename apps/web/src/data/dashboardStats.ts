import { getAdminState, type FinanceEntry } from './adminStore';
import {
  advancesOpenTotal,
  payablesOpenTotal,
  receivablesOpenTotal,
  totalTreasury,
} from './financeBook';
import {
  listWorkOrders,
  normalizeItemRefKey,
  workOrderTotal,
  type WorkOrder,
  type WorkOrderStatus,
} from './osStore';

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

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function startOfDay(offset: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function labelDay(date: Date) {
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
}

function sumEntries(entries: FinanceEntry[], type: 'in' | 'out', from: Date, to: Date) {
  return entries
    .filter((item) => {
      if (item.type !== type) return false;
      const at = new Date(item.createdAt).getTime();
      return at >= from.getTime() && at <= to.getTime();
    })
    .reduce((sum, item) => sum + item.amount, 0);
}

const OPEN_OS: WorkOrderStatus[] = [
  'backlog',
  'open',
  'diagnosis',
  'waiting',
  'progress',
  'reproved',
  'ready',
];

function techName(order: WorkOrder) {
  return order.technician.trim() || 'Sem técnico';
}

function buildTechnicianRanks(orders: WorkOrder[]): TechnicianRank[] {
  const map = new Map<string, TechnicianRank>();

  function ensure(name: string) {
    let row = map.get(name);
    if (!row) {
      row = { name, closedCount: 0, revenue: 0, returns: 0, inProgress: 0, avgTicket: 0 };
      map.set(name, row);
    }
    return row;
  }

  for (const order of orders) {
    const name = techName(order);
    const row = ensure(name);
    if (order.status === 'delivered') {
      row.closedCount += 1;
      row.revenue += workOrderTotal(order);
    }
    if (OPEN_OS.includes(order.status)) {
      row.inProgress += 1;
    }
  }

  const byItem = new Map<string, WorkOrder[]>();
  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    const key = normalizeItemRefKey(order.itemRef);
    if (key.length < 4) continue;
    const list = byItem.get(key) ?? [];
    list.push(order);
    byItem.set(key, list);
  }

  for (const list of byItem.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (let i = 1; i < list.length; i += 1) {
      const priorDelivered = list
        .slice(0, i)
        .reverse()
        .find((item) => item.status === 'delivered' || Boolean(item.deliveredAt));
      if (!priorDelivered) continue;
      ensure(techName(priorDelivered)).returns += 1;
    }
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      avgTicket: row.closedCount > 0 ? row.revenue / row.closedCount : 0,
    }))
    .sort((a, b) => b.closedCount - a.closedCount || b.revenue - a.revenue);
}

function buildLocalDashboardSnapshot(days = 7): DashboardSnapshot {
  const admin = getAdminState();
  const orders = listWorkOrders();
  const from = startOfDay(-(days - 1));
  const to = new Date();
  to.setHours(23, 59, 59, 999);

  const series: DayPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = startOfDay(-(days - 1 - i));
    const key = dayKey(day.toISOString());
    const dayEntries = admin.finance.filter((item) => dayKey(item.createdAt) === key);
    const inflow = dayEntries
      .filter((item) => item.type === 'in')
      .reduce((sum, item) => sum + item.amount, 0);
    const outflow = dayEntries
      .filter((item) => item.type === 'out')
      .reduce((sum, item) => sum + item.amount, 0);
    const sales = admin.orders
      .filter((item) => item.status === 'sold' && dayKey(item.createdAt) === key)
      .reduce((sum, item) => sum + item.amount, 0);
    series.push({
      key,
      label: labelDay(day),
      inflow,
      outflow,
      sales: sales || inflow,
    });
  }

  const revenuePeriod = sumEntries(admin.finance, 'in', from, to);
  const expensePeriod = sumEntries(admin.finance, 'out', from, to);
  const cashBalance = admin.finance.reduce(
    (sum, item) => sum + (item.type === 'in' ? item.amount : -item.amount),
    0,
  );

  const bySource = new Map<string, number>();
  for (const item of admin.finance) {
    if (item.type !== 'in') continue;
    const at = new Date(item.createdAt).getTime();
    if (at < from.getTime() || at > to.getTime()) continue;
    bySource.set(item.source, (bySource.get(item.source) ?? 0) + item.amount);
  }

  const toneBySource: Record<string, string> = {
    pos: '#0f766e',
    os_revenue: '#2563eb',
    manual: '#ca8a04',
    os_part: '#7c3aed',
    os_purchase: '#dc2626',
    os_reversal: '#64748b',
  };

  const mix = [...bySource.entries()]
    .map(([source, value]) => ({
      label:
        source === 'pos'
          ? 'PDV'
          : source === 'os_revenue'
            ? 'OS'
            : source === 'manual'
              ? 'Manual'
              : source,
      value,
      tone: toneBySource[source] ?? '#64748b',
    }))
    .sort((a, b) => b.value - a.value);

  const openOs = orders.filter((item) => OPEN_OS.includes(item.status)).length;
  const technicians = buildTechnicianRanks(orders);
  const deliveredCount = technicians.reduce((sum, row) => sum + row.closedCount, 0);
  const returnCount = technicians.reduce((sum, row) => sum + row.returns, 0);
  const topCloser =
    [...technicians].sort((a, b) => b.closedCount - a.closedCount || b.revenue - a.revenue)[0] ??
    null;
  const topEarner =
    [...technicians].sort((a, b) => b.revenue - a.revenue || b.closedCount - a.closedCount)[0] ??
    null;
  const topReturns =
    [...technicians]
      .filter((row) => row.returns > 0)
      .sort((a, b) => b.returns - a.returns || b.closedCount - a.closedCount)[0] ?? null;

  return {
    cashBalance,
    treasury: totalTreasury(),
    payablesOpen: payablesOpenTotal(),
    receivablesOpen: receivablesOpenTotal(),
    advancesOpen: advancesOpenTotal(),
    soldCount: admin.orders.filter((item) => item.status === 'sold').length,
    revenuePeriod,
    expensePeriod,
    resultPeriod: revenuePeriod - expensePeriod,
    openOs,
    lowStock: admin.stock.filter((item) => item.qty <= item.minQty).length,
    series,
    mix: mix.slice(0, 5),
    technicians,
    topCloser,
    topEarner,
    topReturns,
    deliveredCount,
    returnRate: deliveredCount > 0 ? returnCount / deliveredCount : 0,
    skuCount: admin.stock.length,
    stockUnits: admin.stock.reduce((sum, item) => sum + item.qty, 0),
  };
}

/** Preferência: cache Nest → agregação local (após bootstrap). */
export function getDashboardSnapshot(days = 7): DashboardSnapshot {
  if (nestSnapshot) return nestSnapshot;
  return buildLocalDashboardSnapshot(days);
}

export async function hydrateDashboardFromApi(days = 7) {
  const { isNestAuthed } = await import('../services/nestClient');
  if (!isNestAuthed()) {
    nestSnapshot = null;
    return getDashboardSnapshot(days);
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
