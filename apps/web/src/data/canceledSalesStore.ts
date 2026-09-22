import type { SalesOrder } from './adminStore';

const STORAGE_KEY = 'marthi.pdv.canceled.v1';
export const CANCELED_SALES_EVENT = 'marthi-canceled-sales-updated';
export const CANCELED_SALE_TTL_MS = 24 * 60 * 60 * 1000;

export type CanceledSaleEntry = {
  id: string;
  orderId: string;
  snapshot: SalesOrder;
  canceledAt: string;
  expiresAt: string;
  canceledByName: string;
  canceledByEmail: string;
  restoredAt?: string;
};

type State = {
  entries: CanceledSaleEntry[];
};

function uid() {
  return `CXL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as Partial<State>;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

function save(state: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(CANCELED_SALES_EVENT));
}

export function purgeExpiredCanceledSales(nowMs = Date.now()) {
  const state = load();
  const next = state.entries.filter((entry) => {
    if (entry.restoredAt) return false;
    return Date.parse(entry.expiresAt) > nowMs;
  });
  if (next.length !== state.entries.length) {
    save({ entries: next });
  }
  return next;
}

export function registerCanceledSale(input: {
  order: SalesOrder;
  actorName: string;
  actorEmail: string;
}): CanceledSaleEntry {
  const state = load();
  const canceledAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(canceledAt) + CANCELED_SALE_TTL_MS).toISOString();
  const entry: CanceledSaleEntry = {
    id: uid(),
    orderId: input.order.id,
    snapshot: { ...input.order, status: 'cancelled' },
    canceledAt,
    expiresAt,
    canceledByName: input.actorName.trim() || 'Operador',
    canceledByEmail: input.actorEmail.trim().toLowerCase(),
  };
  state.entries = [entry, ...state.entries.filter((item) => item.orderId !== input.order.id)];
  save(state);
  return entry;
}

export function listCanceledSalesWithinWindow() {
  return purgeExpiredCanceledSales().sort((a, b) => b.canceledAt.localeCompare(a.canceledAt));
}

export function getCanceledSale(entryId: string) {
  return listCanceledSalesWithinWindow().find((item) => item.id === entryId) ?? null;
}

export function removeCanceledSaleEntry(entryId: string) {
  const state = load();
  state.entries = state.entries.filter((item) => item.id !== entryId);
  save(state);
}

export function markCanceledSaleRestored(entryId: string) {
  const state = load();
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) return null;
  entry.restoredAt = new Date().toISOString();
  state.entries = state.entries.filter((item) => item.id !== entryId);
  save(state);
  return entry;
}

export function hoursLeftLabel(expiresAt: string) {
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'expirado';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours <= 0) return `${mins} min`;
  return `${hours}h ${mins}m`;
}
