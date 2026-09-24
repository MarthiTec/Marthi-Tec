/** Analytics do totem: cliques locais + ranking/stats do Nest quando autenticado. */

import { listQueueTickets, type QueueTicket } from './posQueueStore';
import {
  apiGetTotemAnalyticsSummary,
  apiTrackTotemClick,
  type ApiTotemAnalyticsSummary,
} from '../services/erpApi';
import { isNestAuthed } from '../services/nestClient';

const STORAGE_KEY = 'marthi.totem.analytics.v1';
export const TOTEM_ANALYTICS_EVENT = 'marthi-totem-analytics';

export type TotemClickEvent = {
  id: string;
  productId: string;
  productName: string;
  createdAt: string;
};

type AnalyticsState = {
  clicks: TotemClickEvent[];
};

let summaryCache: ApiTotemAnalyticsSummary | null = null;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5)}`;
}

function load(): AnalyticsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { clicks: [] };
    const parsed = JSON.parse(raw) as Partial<AnalyticsState>;
    return { clicks: Array.isArray(parsed.clicks) ? parsed.clicks : [] };
  } catch {
    return { clicks: [] };
  }
}

function save(state: AnalyticsState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ clicks: state.clicks.slice(0, 2000) }));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TOTEM_ANALYTICS_EVENT));
  }
}

function dayKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayKey() {
  return dayKey(new Date().toISOString());
}

function phoneKey(phone: string) {
  return phone.replace(/\D/g, '');
}

function emitAnalytics() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TOTEM_ANALYTICS_EVENT));
  }
}

export function replaceTotemAnalyticsSummary(summary: ApiTotemAnalyticsSummary | null) {
  summaryCache = summary;
  emitAnalytics();
}

export async function hydrateTotemAnalyticsFromApi() {
  if (!isNestAuthed()) return;
  const summary = await apiGetTotemAnalyticsSummary();
  replaceTotemAnalyticsSummary(summary);
}

export function trackTotemProductClick(input: { productId: string | number; productName: string }) {
  const productId = String(input.productId);
  const productName = input.productName.trim() || 'Produto';
  const state = load();
  state.clicks.unshift({
    id: uid('CLK'),
    productId,
    productName,
    createdAt: new Date().toISOString(),
  });
  save(state);

  void apiTrackTotemClick({ productId, productName }).catch(() => {
    /* offline / API down — mantém local */
  });
}

export function listTotemClicks() {
  return load().clicks;
}

export type TotemProductRank = {
  productId: string;
  productName: string;
  clicks: number;
  clicksToday: number;
};

export function getTotemClickRanking(limit = 10): TotemProductRank[] {
  if (summaryCache?.ranking?.length) {
    return summaryCache.ranking.slice(0, limit);
  }
  const today = todayKey();
  const map = new Map<string, TotemProductRank>();
  for (const click of load().clicks) {
    const key = click.productId || click.productName;
    const current = map.get(key) ?? {
      productId: click.productId,
      productName: click.productName,
      clicks: 0,
      clicksToday: 0,
    };
    current.clicks += 1;
    if (dayKey(click.createdAt) === today) current.clicksToday += 1;
    if (click.productName) current.productName = click.productName;
    map.set(key, current);
  }
  return Array.from(map.values())
    .sort((a, b) => b.clicks - a.clicks || b.clicksToday - a.clicksToday)
    .slice(0, limit);
}

export type TotemBuyerRow = {
  customerName: string;
  customerPhone: string;
  purchasesToday: number;
  purchasesTotal: number;
  lastPurchaseAt: string;
  productsToday: string[];
};

function isTotemTicket(ticket: QueueTicket) {
  return ticket.source === 'totem';
}

export function getTotemBuyersToday(): TotemBuyerRow[] {
  if (summaryCache?.buyersToday) {
    return summaryCache.buyersToday;
  }
  const today = todayKey();
  const tickets = listQueueTickets().filter(isTotemTicket);
  const sold = tickets.filter((item) => item.status === 'sold');
  const byPhone = new Map<string, TotemBuyerRow>();

  for (const ticket of sold) {
    const key = phoneKey(ticket.customerPhone) || ticket.customerName.toLowerCase();
    if (!key) continue;
    const closedAt = ticket.closedAt || ticket.createdAt;
    const isToday = dayKey(closedAt) === today;
    const current = byPhone.get(key) ?? {
      customerName: ticket.customerName,
      customerPhone: ticket.customerPhone,
      purchasesToday: 0,
      purchasesTotal: 0,
      lastPurchaseAt: closedAt,
      productsToday: [],
    };
    current.purchasesTotal += 1;
    if (isToday) {
      current.purchasesToday += 1;
      if (!current.productsToday.includes(ticket.productName)) {
        current.productsToday.push(ticket.productName);
      }
    }
    if (closedAt > current.lastPurchaseAt) {
      current.lastPurchaseAt = closedAt;
      current.customerName = ticket.customerName || current.customerName;
      current.customerPhone = ticket.customerPhone || current.customerPhone;
    }
    byPhone.set(key, current);
  }

  return Array.from(byPhone.values())
    .filter((item) => item.purchasesToday > 0)
    .sort((a, b) => b.purchasesToday - a.purchasesToday || b.lastPurchaseAt.localeCompare(a.lastPurchaseAt));
}

export type TotemDayStats = {
  clicksToday: number;
  proposalsToday: number;
  soldToday: number;
  openToday: number;
  uniqueBuyersToday: number;
};

export function getTotemDayStats(): TotemDayStats {
  if (summaryCache) {
    return {
      clicksToday: summaryCache.clicksToday,
      proposalsToday: summaryCache.proposalsToday,
      soldToday: summaryCache.soldToday,
      openToday: summaryCache.openToday,
      uniqueBuyersToday: summaryCache.uniqueBuyersToday,
    };
  }
  const today = todayKey();
  const clicksToday = load().clicks.filter((item) => dayKey(item.createdAt) === today).length;
  const tickets = listQueueTickets().filter(isTotemTicket);
  const proposalsToday = tickets.filter((item) => dayKey(item.createdAt) === today).length;
  const soldToday = tickets.filter(
    (item) => item.status === 'sold' && dayKey(item.closedAt || item.createdAt) === today,
  ).length;
  const openToday = tickets.filter(
    (item) => item.status === 'open' && dayKey(item.createdAt) === today,
  ).length;
  return {
    clicksToday,
    proposalsToday,
    soldToday,
    openToday,
    uniqueBuyersToday: getTotemBuyersToday().length,
  };
}
