import { apiRequest } from './client';

export type StockVariation = {
  id: string;
  attrs: Record<string, unknown>;
  price: number;
  cost: number;
  qty: number;
  minQty: number;
  condition: string;
  barcode?: string;
  imei?: string;
};

export type StockItem = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  imei: string;
  unit: string;
  qty: number;
  minQty: number;
  cost: number;
  avgCost?: number;
  price: number;
  kind: string;
  condition: string;
  category: string;
  brand: string;
  active: boolean;
  color?: string;
  capacity?: string;
  variations: StockVariation[];
  scope?: string;
  updatedAt?: string;
};

export type StockMovement = {
  id: string;
  direction: 'in' | 'out' | 'adjustment';
  type: string;
  origin: string;
  qty: number;
  unitCost: number;
  at: string;
  operator: string;
  notes: string;
  supplier?: { id: string; name: string } | null;
  customer?: { id: string | null; name: string } | null;
  saleId?: string | null;
};

type AuthOpts = { token: string; storeId: string };

export async function listStock(
  opts: AuthOpts & { q?: string; low?: boolean; signal?: AbortSignal },
): Promise<StockItem[]> {
  const params = new URLSearchParams();
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  if (opts.low) params.set('low', '1');
  const qs = params.toString();
  return apiRequest<StockItem[]>(`/stock${qs ? `?${qs}` : ''}`, {
    token: opts.token,
    storeId: opts.storeId,
    signal: opts.signal,
  });
}

export async function getStock(opts: AuthOpts & { id: string }): Promise<StockItem> {
  return apiRequest<StockItem>(`/stock/${encodeURIComponent(opts.id)}`, {
    token: opts.token,
    storeId: opts.storeId,
  });
}

export async function lookupStock(opts: AuthOpts & { code: string }): Promise<StockItem | null> {
  return apiRequest<StockItem | null>(`/stock/lookup?code=${encodeURIComponent(opts.code)}`, {
    token: opts.token,
    storeId: opts.storeId,
  });
}

export async function listStockMovements(
  opts: AuthOpts & { id: string; limit?: number },
): Promise<StockMovement[]> {
  const limit = opts.limit ?? 30;
  return apiRequest<StockMovement[]>(
    `/stock/${encodeURIComponent(opts.id)}/movements?limit=${limit}`,
    { token: opts.token, storeId: opts.storeId },
  );
}

export async function adjustStock(
  opts: AuthOpts & { id: string; qty: number; reason: string },
): Promise<{ product: StockItem; previousQty: number; newQty: number; delta: number; reason: string }> {
  return apiRequest(`/stock/${encodeURIComponent(opts.id)}/adjust`, {
    method: 'POST',
    token: opts.token,
    storeId: opts.storeId,
    body: { qty: opts.qty, reason: opts.reason },
  });
}

export async function changeStockPrice(
  opts: AuthOpts & { id: string; price?: number; cost?: number; reason?: string },
): Promise<{
  product: StockItem;
  before: { price: number; cost: number };
  after: { price: number; cost: number };
  auditId: string;
}> {
  return apiRequest(`/stock/${encodeURIComponent(opts.id)}/price-change`, {
    method: 'POST',
    token: opts.token,
    storeId: opts.storeId,
    body: { price: opts.price, cost: opts.cost, reason: opts.reason ?? '' },
  });
}

export async function createStockEntry(
  opts: AuthOpts & {
    id: string;
    qty: number;
    unitCost: number;
    notes?: string;
    imeis?: string[];
    payment?: 'paid' | 'pending' | 'none';
  },
): Promise<{ product: StockItem; entryId: string }> {
  return apiRequest(`/stock/${encodeURIComponent(opts.id)}/entries`, {
    method: 'POST',
    token: opts.token,
    storeId: opts.storeId,
    body: {
      entry: {
        qty: opts.qty,
        unitCost: opts.unitCost,
        imeis: opts.imeis ?? [],
        notes: opts.notes ?? '',
        payment: opts.payment ?? 'none',
      },
    },
  });
}
