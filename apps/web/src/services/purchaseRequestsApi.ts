import { nestDelete, nestGet, nestPatch, nestPost } from './nestClient';

export type PurchaseStatus = 'open' | 'in_progress' | 'fulfilled' | 'cancelled';

export const PURCHASE_STATUS: Array<{ value: PurchaseStatus; label: string; tone: string }> = [
  { value: 'open', label: 'Aberta', tone: '#0284c7' },
  { value: 'in_progress', label: 'Em atendimento', tone: '#d97706' },
  { value: 'fulfilled', label: 'Atendida', tone: '#059669' },
  { value: 'cancelled', label: 'Cancelada', tone: '#94a3b8' },
];

export type PurchaseRequest = {
  id: string;
  protocol: string;
  seq: number;
  catalogId: string | null;
  status: PurchaseStatus;
  statusLabel: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  productId: string | null;
  productName: string;
  brand: string;
  variantLabel: string;
  attributes: Array<{ id?: string; name?: string; value: string }>;
  qty: number;
  notes: string;
  desiredOptions: string;
  history: Array<{ at: string; by?: string; action?: string; from?: string; to?: string; note?: string }>;
  stockEntryId: string | null;
  saleId: string | null;
  handledBy: string;
  cancelReason: string;
  fulfilledAt: string | null;
  fulfilledBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseRequestInput = {
  requestKey: string;
  productId: string | null;
  productName: string;
  brand: string;
  variantLabel: string;
  attributes: Array<{ id?: string; name?: string; value: string }>;
  qty: number;
  desiredOptions: string;
  notes: string;
  customer: { name: string; phone: string };
  website: string;
};

export const apiListPurchaseRequests = (params: { status?: string; q?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.q) query.set('q', params.q);
  return nestGet<PurchaseRequest[]>(`/purchase-requests${query.toString() ? `?${query}` : ''}`);
};

export const apiPurchaseRequestsSummary = () =>
  nestGet<{ counts: Record<PurchaseStatus, number>; open: number }>('/purchase-requests/summary');

export const apiGetPurchaseRequest = (id: string) => nestGet<PurchaseRequest>(`/purchase-requests/${encodeURIComponent(id)}`);

export const apiUpdatePurchaseRequest = (
  id: string,
  body: {
    status?: PurchaseStatus;
    note?: string;
    cancelReason?: string;
    productId?: string | null;
    productName?: string;
    qty?: number;
    notes?: string;
    desiredOptions?: string;
    stockEntryId?: string | null;
    saleId?: string | null;
  },
) => nestPatch<PurchaseRequest>(`/purchase-requests/${encodeURIComponent(id)}`, body);

export const apiDuplicatePurchaseRequest = (id: string) =>
  nestPost<PurchaseRequest>(`/purchase-requests/${encodeURIComponent(id)}/duplicate`, {});

export const apiDeletePurchaseRequest = (id: string) =>
  nestDelete<PurchaseRequest | { ok: true }>(`/purchase-requests/${encodeURIComponent(id)}`);

export const apiSubmitPurchaseRequest = (token: string, body: PurchaseRequestInput) =>
  nestPost<{ id: string; protocol: string }>(`/public/sales-catalogs/${encodeURIComponent(token)}/purchase-requests`, body);
