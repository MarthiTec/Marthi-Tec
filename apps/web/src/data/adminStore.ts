import { ATTR_CAP, ATTR_COR } from './attributeStore';
import {
  apiClosePosSale,
  apiCreateCustomer,
  apiCreateFinanceManual,
  apiCreatePayment,
  apiCreatePriceTable,
  apiCreateStock,
  apiDeleteCustomer,
  apiDeletePayment,
  apiDeletePriceTable,
  apiDeleteStock,
  apiUpdateCustomer,
  apiUpdatePayment,
  apiUpdatePriceTable,
  apiUpdateStock,
} from '../services/erpApi';
import { isNestAuthed, NestApiError } from '../services/nestClient';

export const ADMIN_STATE_EVENT = 'marthi-admin-state';
export const STOCK_EVENT = 'marthi-stock';
const STORAGE_KEY = 'marthi.admin.v2';

export type Customer = {
  id: string;
  name: string;
  phone: string;
  document: string;
  email: string;
  city: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  state: string;
  active: boolean;
  createdAt: string;
};

export type StockKind = 'part' | 'device' | 'supply';
export type StockCondition = 'new' | 'used' | 'refurbished';
/** UN = inteiro; KG = pesado (aceita qty fracionada / balança). */
export type StockUnit = 'UN' | 'KG';

export type StockItem = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  imei: string;
  color: string;
  capacity: string;
  attrs: Record<string, string>;
  qty: number;
  minQty: number;
  /** Estoque máximo sugerido (alerta de excesso). */
  maxQty: number;
  /** Custo da última compra / referência. */
  cost: number;
  /** Custo médio ponderado. */
  avgCost: number;
  /** Preço de venda base (vista / tabela 0%). */
  price: number;
  /** Data ISO da última compra/entrada com custo. */
  lastPurchaseAt: string;
  /** Custo unitário da última compra. */
  lastPurchaseCost: number;
  kind: StockKind;
  condition: StockCondition;
  /** Unidade de medida: UN (inteiro) ou KG (pesado). */
  unit: StockUnit;
  sourceWorkOrderId?: string;
  /** Se o item aparece no catálogo do totem quando o estoque é compartilhado. */
  showOnTotem: boolean;
  /** URLs de imagem compartilhadas (totem, PDV, OS). */
  images: string[];
  /** Fornecedor habitual deste produto. */
  supplierId?: string;
  /** Classificação fiscal vinculada (NCM, CST, IBS/CBS…). */
  fiscalClassificationId?: string;
  /** Almoxarifado padrão. */
  warehouseId?: string;
  /** Controla lote / Grupo Rastro NF-e. */
  trackLot?: boolean;
  /** Produto é kit (composições em /kits). */
  isKit?: boolean;
};

export function isWeighedUnit(unit: StockUnit | undefined) {
  return unit === 'KG';
}

export function normalizeSaleQty(qty: number, unit: StockUnit | undefined) {
  const raw = Number(qty);
  if (!Number.isFinite(raw) || raw <= 0) return isWeighedUnit(unit) ? 0.001 : 1;
  if (isWeighedUnit(unit)) return Math.round(raw * 1000) / 1000;
  return Math.max(1, Math.round(raw));
}

export type PriceTable = {
  id: string;
  name: string;
  percent: number;
  active: boolean;
};

export type PaymentMethod = {
  id: string;
  name: string;
  type: 'cash' | 'pix' | 'debit' | 'credit' | 'other';
  priceTableId: string;
  maxInstallments: number;
  active: boolean;
};

export type SalesOrder = {
  id: string;
  ticketId: string | null;
  customerName: string;
  customerDocument?: string;
  productName: string;
  amount: number;
  status: 'open' | 'sold' | 'cancelled';
  payment: string;
  sellerId: string;
  sellerName: string;
  createdAt: string;
  /** Sessão de caixa em que a venda foi registrada. */
  cashSessionId?: string;
};

export type FinanceSource = 'manual' | 'pos' | 'os_part' | 'os_purchase' | 'os_revenue' | 'os_reversal';

export type FinanceEntry = {
  id: string;
  type: 'in' | 'out';
  label: string;
  amount: number;
  createdAt: string;
  source: FinanceSource;
  refId?: string;
};

export type PosLineInput = {
  stockId: string;
  name: string;
  qty: number;
  unitPrice: number;
  imei: string;
};

type AdminState = {
  customers: Customer[];
  stock: StockItem[];
  orders: SalesOrder[];
  finance: FinanceEntry[];
  priceTables: PriceTable[];
  payments: PaymentMethod[];
};

let memoryState: AdminState | null = null;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function seedPriceTables(): PriceTable[] {
  return [
    { id: 'TAB-VISTA', name: 'Vista', percent: 0, active: true },
    { id: 'TAB-ATACADO', name: 'Atacado', percent: -8, active: true },
    { id: 'TAB-CARTAO', name: 'Cartão', percent: 5, active: true },
  ];
}

function seedPayments(): PaymentMethod[] {
  return [
    {
      id: 'PAY-DIN',
      name: 'Dinheiro',
      type: 'cash',
      priceTableId: 'TAB-VISTA',
      maxInstallments: 1,
      active: true,
    },
    {
      id: 'PAY-PIX',
      name: 'Pix',
      type: 'pix',
      priceTableId: 'TAB-VISTA',
      maxInstallments: 1,
      active: true,
    },
    {
      id: 'PAY-DEB',
      name: 'Cartão de débito',
      type: 'debit',
      priceTableId: 'TAB-VISTA',
      maxInstallments: 1,
      active: true,
    },
    {
      id: 'PAY-CRE',
      name: 'Cartão de crédito',
      type: 'credit',
      priceTableId: 'TAB-CARTAO',
      maxInstallments: 12,
      active: true,
    },
    {
      id: 'PAY-VR',
      name: 'Vale Refeição',
      type: 'other',
      priceTableId: 'TAB-VISTA',
      maxInstallments: 1,
      active: true,
    },
    {
      id: 'PAY-VC',
      name: 'Vale Crédito',
      type: 'other',
      priceTableId: 'TAB-VISTA',
      maxInstallments: 1,
      active: true,
    },
  ];
}

function seed(): AdminState {
  return {
    customers: [],
    stock: [],
    orders: [],
    finance: [],
    priceTables: seedPriceTables(),
    payments: seedPayments(),
  };
}

function normalizeStock(item: StockItem): StockItem {
  const attrs = { ...(item.attrs ?? {}) };
  if (!attrs[ATTR_COR] && item.color) attrs[ATTR_COR] = item.color;
  if (!attrs[ATTR_CAP] && item.capacity) attrs[ATTR_CAP] = item.capacity;
  const looksLikeDevice = Boolean(item.imei || item.capacity || /iphone|redmi|galaxy|notebook/i.test(item.name));
  const images = Array.isArray(item.images)
    ? item.images
        .map((url) => String(url).trim())
        .filter((url) => Boolean(url) && !url.startsWith('/totem/'))
    : [];
  const cost = Number(item.cost) || 0;
  const qty = Math.max(0, Number(item.qty) || 0);
  const minQty = Math.max(0, Number(item.minQty) || 0);
  const maxQtyRaw = Number(item.maxQty);
  const maxQty =
    Number.isFinite(maxQtyRaw) && maxQtyRaw > 0
      ? maxQtyRaw
      : Math.max(minQty * 5, qty || minQty || 10, 10);
  const avgCost = Number(item.avgCost);
  return {
    ...item,
    barcode: item.barcode ?? '',
    imei: item.imei ?? '',
    attrs,
    color: attrs[ATTR_COR] ?? item.color ?? '',
    capacity: attrs[ATTR_CAP] ?? item.capacity ?? '',
    qty,
    minQty,
    maxQty,
    cost,
    avgCost: Number.isFinite(avgCost) && avgCost > 0 ? avgCost : cost,
    price: Number(item.price) || 0,
    lastPurchaseAt: item.lastPurchaseAt ?? '',
    lastPurchaseCost:
      Number(item.lastPurchaseCost) > 0 ? Number(item.lastPurchaseCost) : cost,
    kind: item.kind ?? (looksLikeDevice ? 'device' : 'part'),
    condition: item.condition ?? 'new',
    unit: item.unit === 'KG' ? 'KG' : 'UN',
    sourceWorkOrderId: item.sourceWorkOrderId,
    showOnTotem: item.showOnTotem ?? looksLikeDevice,
    images,
    supplierId: item.supplierId ?? '',
    fiscalClassificationId: item.fiscalClassificationId ?? '',
    warehouseId: item.warehouseId ?? '',
    trackLot: item.trackLot ?? false,
    isKit: item.isKit ?? false,
  };
}

export function stockItemImages(item: Pick<StockItem, 'name' | 'images'> | null | undefined) {
  if (!item?.images?.length) return [] as string[];
  return item.images;
}

function normalizeFinance(entry: FinanceEntry): FinanceEntry {
  return {
    ...entry,
    source: entry.source ?? 'manual',
    refId: entry.refId,
  };
}

function normalizeCustomer(item: Partial<Customer> & Pick<Customer, 'id' | 'name'>): Customer {
  return {
    id: item.id,
    name: item.name ?? '',
    phone: item.phone ?? '',
    document: item.document ?? '',
    email: item.email ?? '',
    city: item.city ?? '',
    zipCode: item.zipCode ?? '',
    street: item.street ?? '',
    number: item.number ?? '',
    complement: item.complement ?? '',
    neighborhood: item.neighborhood ?? '',
    state: item.state ?? '',
    active: item.active !== false,
    createdAt: item.createdAt ?? new Date().toISOString(),
  };
}

function hydrate(parsed: Partial<AdminState>): AdminState {
  const base = seed();
  return {
    customers: (parsed.customers ?? base.customers).map(normalizeCustomer),
    stock: (parsed.stock ?? []).map(normalizeStock),
    orders: (parsed.orders ?? []).map((order) => ({
      ...order,
      sellerId: order.sellerId ?? '',
      sellerName: order.sellerName ?? '',
    })),
    finance: (parsed.finance ?? base.finance).map(normalizeFinance),
    priceTables: parsed.priceTables?.length ? parsed.priceTables : base.priceTables,
    payments: parsed.payments?.length ? parsed.payments : base.payments,
  };
}

function load(): AdminState {
  if (memoryState) {
    return {
      customers: memoryState.customers.map((item) => ({ ...item })),
      stock: memoryState.stock.map((item) => ({ ...item, attrs: { ...item.attrs }, images: [...item.images] })),
      orders: memoryState.orders.map((item) => ({ ...item })),
      finance: memoryState.finance.map((item) => ({ ...item })),
      priceTables: memoryState.priceTables.map((item) => ({ ...item })),
      payments: memoryState.payments.map((item) => ({ ...item })),
    };
  }
  try {
    localStorage.removeItem('marthi.admin.v1');
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = seed();
      save(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<AdminState>;
    if (!parsed.customers || !parsed.stock) {
      const fresh = seed();
      save(fresh);
      return fresh;
    }
    const next = hydrate(parsed);
    const stockNeedsCodes = (parsed.stock ?? []).some(
      (item) => item.barcode === undefined || item.imei === undefined,
    );
    if (!parsed.priceTables?.length || !parsed.payments?.length || stockNeedsCodes) {
      save(next);
    }
    return next;
  } catch {
    const fresh = seed();
    save(fresh);
    return fresh;
  }
}

function save(state: AdminState) {
  memoryState = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_STATE_EVENT));
    try {
      const channel = new BroadcastChannel('marthi-totem-live');
      channel.postMessage({ at: Date.now() });
      channel.close();
    } catch {
      /* ignore */
    }
  }
}

/** Substitui o estado do ERP (bootstrap Nest). */
export function replaceAdminState(state: AdminState) {
  save({
    customers: state.customers.map(normalizeCustomer),
    stock: state.stock.map(normalizeStock),
    orders: state.orders.map((order) => ({
      ...order,
      sellerId: order.sellerId ?? '',
      sellerName: order.sellerName ?? '',
    })),
    finance: state.finance.map(normalizeFinance),
    priceTables: state.priceTables,
    payments: state.payments,
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STOCK_EVENT));
  }
}

export function getAdminState() {
  return load();
}

/** Força o totem (outra aba) a reler o estoque do localStorage. */
export function invalidateAdminMemory() {
  memoryState = null;
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof NestApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Payload Nest Create/UpdateStockDto — sem maxQty/avgCost/unit etc. (forbidNonWhitelisted). */
function toNestStockBody(item: StockItem) {
  return {
    name: item.name,
    kind: item.kind,
    sku: item.sku || undefined,
    barcode: item.barcode || undefined,
    imei: item.imei || undefined,
    color: item.color || undefined,
    capacity: item.capacity || undefined,
    attrs: item.attrs && Object.keys(item.attrs).length ? item.attrs : undefined,
    qty: item.qty,
    minQty: item.minQty,
    cost: item.cost,
    price: item.price,
    condition: item.condition,
    showOnTotem: item.showOnTotem,
    images: item.images?.length ? item.images : undefined,
    supplierId: item.supplierId || undefined,
    fiscalClassificationId: item.fiscalClassificationId || undefined,
    warehouseId: item.warehouseId || undefined,
    trackLot: item.trackLot,
    isKit: item.isKit,
  };
}

export function applyPriceTable(basePrice: number, table: PriceTable | undefined) {
  const percent = table?.percent ?? 0;
  return Math.round(basePrice * (1 + percent / 100) * 100) / 100;
}

export function findStockByCode(code: string) {
  const needle = code.trim().toLowerCase().replace(/\s+/g, '');
  if (!needle) return null;
  const stock = load().stock;
  const exact = stock.find((item) => {
    const sku = item.sku.toLowerCase().replace(/\s+/g, '');
    const barcode = item.barcode.toLowerCase().replace(/\s+/g, '');
    const imei = item.imei.toLowerCase().replace(/\s+/g, '');
    const id = item.id.toLowerCase();
    return needle === sku || needle === barcode || needle === imei || needle === id;
  });
  if (exact) return exact;
  const named = stock.filter((item) => item.name.toLowerCase().includes(needle));
  return named.length === 1 ? named[0] : null;
}

export function adjustStockQty(stockId: string, delta: number) {
  const state = load();
  const item = state.stock.find((entry) => entry.id === stockId);
  if (!item) return { ok: false as const, error: 'Produto não encontrado no estoque.' };
  const qty = Math.abs(Math.floor(delta) || 0);
  if (qty === 0) return { ok: true as const, item };
  item.qty = Math.max(0, item.qty + delta);
  save(state);
  window.dispatchEvent(new Event(STOCK_EVENT));
  void import('./stockLedger').then(({ logStockMovements }) => {
    logStockMovements([
      {
        stockId: item.id,
        stockName: item.name,
        sku: item.sku,
        type: 'adjust',
        qty,
        direction: delta >= 0 ? 1 : -1,
        unitCost: item.avgCost || item.cost || 0,
        balanceAfter: item.qty,
        note: 'Ajuste rápido de quantidade',
        warehouseId: item.warehouseId,
      },
    ]);
  });
  return { ok: true as const, item };
}

export type OrderSearchFilters = {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  cashSessionId?: string;
  limit?: number;
};

function parseFilterBound(value: string, endOfDay: boolean) {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).getTime();
  }
  const stamp = new Date(raw).getTime();
  return Number.isNaN(stamp) ? null : stamp;
}

export function searchOrders(queryOrFilters: string | OrderSearchFilters = '', limit = 12) {
  const filters: OrderSearchFilters =
    typeof queryOrFilters === 'string'
      ? { query: queryOrFilters, limit }
      : { ...queryOrFilters, limit: queryOrFilters.limit ?? limit };
  const needle = (filters.query ?? '').trim().toLowerCase();
  const fromTs = filters.dateFrom ? parseFilterBound(filters.dateFrom, false) : null;
  const toTs = filters.dateTo ? parseFilterBound(filters.dateTo, true) : null;
  const sessionId = (filters.cashSessionId ?? '').trim();
  const cap = filters.limit ?? limit;

  return load()
    .orders.filter((item) => item.status === 'sold' || item.status === 'cancelled')
    .filter((item) => {
      if (sessionId && item.cashSessionId !== sessionId) return false;
      const created = new Date(item.createdAt).getTime();
      if (fromTs != null && !Number.isNaN(created) && created < fromTs) return false;
      if (toTs != null && !Number.isNaN(created) && created > toTs) return false;
      if (!needle) return true;
      const blob =
        `${item.id} ${item.customerName} ${item.customerDocument ?? ''} ${item.productName} ${item.payment} ${item.status} ${item.cashSessionId ?? ''}`.toLowerCase();
      return blob.includes(needle);
    })
    .slice(0, cap);
}

export function getOrderById(id: string) {
  return load().orders.find((item) => item.id === id) ?? null;
}

export function attachOrderCashSession(orderId: string, cashSessionId: string) {
  const state = load();
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return { ok: false as const, error: 'Venda não encontrada.' };
  order.cashSessionId = cashSessionId;
  save(state);
  return { ok: true as const, order };
}

export function updatePosSaleOrder(input: {
  orderId: string;
  customerName?: string;
  customerDocument?: string;
  payment?: string;
  amount?: number;
  productName?: string;
  createdAt?: string;
}): { ok: true; order: SalesOrder } | { ok: false; error: string } {
  const state = load();
  const order = state.orders.find((item) => item.id === input.orderId);
  if (!order) return { ok: false, error: 'Venda não encontrada.' };
  if (order.status !== 'sold') return { ok: false, error: 'Só é possível editar vendas finalizadas.' };

  if (input.customerName !== undefined) {
    const name = input.customerName.trim();
    if (!name) return { ok: false, error: 'Informe o nome do cliente.' };
    order.customerName = name;
  }
  if (input.customerDocument !== undefined) {
    order.customerDocument = input.customerDocument.replace(/\D/g, '');
  }
  if (input.payment !== undefined) {
    const payment = input.payment.trim();
    if (!payment) return { ok: false, error: 'Informe a forma de pagamento.' };
    order.payment = payment;
  }
  if (input.productName !== undefined) {
    const productName = input.productName.trim();
    if (!productName) return { ok: false, error: 'Informe os itens da venda.' };
    order.productName = productName;
  }
  if (input.amount !== undefined) {
    const amount = Math.max(0, Number(input.amount) || 0);
    if (amount <= 0) return { ok: false, error: 'Informe um valor válido.' };
    order.amount = amount;
  }
  if (input.createdAt !== undefined) {
    const stamp = new Date(input.createdAt).getTime();
    if (Number.isNaN(stamp)) return { ok: false, error: 'Data/hora inválida.' };
    order.createdAt = new Date(stamp).toISOString();
  }

  save(state);
  return { ok: true, order };
}

export function cancelPosSaleOrder(orderId: string): { ok: true; order: SalesOrder } | { ok: false; error: string } {
  const state = load();
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return { ok: false, error: 'Venda não encontrada.' };
  if (order.status === 'cancelled') return { ok: false, error: 'Venda já cancelada.' };
  if (order.status !== 'sold') return { ok: false, error: 'Só é possível cancelar vendas fechadas.' };
  order.status = 'cancelled';
  state.finance.unshift({
    id: uid('FIN'),
    type: 'out',
    label: `Cancelamento venda ${order.id}`,
    amount: order.amount,
    createdAt: new Date().toISOString(),
    source: 'pos',
    refId: order.id,
  });
  save(state);
  return { ok: true, order };
}

/** Reverte cancelamento (estorno) — restaura status `sold` e remove lançamento de cancelamento. */
export function restorePosSaleOrder(
  orderId: string,
  snapshot?: SalesOrder,
): { ok: true; order: SalesOrder } | { ok: false; error: string } {
  const state = load();
  let order = state.orders.find((item) => item.id === orderId);
  if (!order && snapshot) {
    order = { ...snapshot, status: 'sold' };
    state.orders.unshift(order);
  }
  if (!order) return { ok: false, error: 'Venda não encontrada para restaurar.' };
  if (order.status !== 'cancelled' && order.status !== 'sold') {
    return { ok: false, error: 'Só é possível restaurar vendas canceladas.' };
  }
  order.status = 'sold';
  state.finance = state.finance.filter(
    (item) => !(item.source === 'pos' && item.refId === orderId && item.type === 'out' && item.label.includes('Cancelamento')),
  );
  save(state);
  return { ok: true, order };
}

export async function upsertCustomer(
  input: Omit<Customer, 'id' | 'createdAt'> & { id?: string },
): Promise<AdminState> {
  const payload = {
    name: input.name.trim(),
    phone: (input.phone ?? '').trim(),
    document: (input.document ?? '').trim(),
    email: (input.email ?? '').trim(),
    city: (input.city ?? '').trim(),
    zipCode: (input.zipCode ?? '').trim(),
    street: (input.street ?? '').trim(),
    number: (input.number ?? '').trim(),
    complement: (input.complement ?? '').trim(),
    neighborhood: (input.neighborhood ?? '').trim(),
    state: (input.state ?? '').trim().toUpperCase(),
    active: input.active ?? true,
  };

  if (isNestAuthed()) {
    try {
      const saved = input.id
        ? await apiUpdateCustomer(input.id, payload)
        : await apiCreateCustomer(payload);
      const state = load();
      if (input.id) {
        state.customers = state.customers.map((item) =>
          item.id === input.id ? normalizeCustomer(saved) : item,
        );
      } else {
        const existing = state.customers.find((item) => item.id === saved.id);
        if (existing) Object.assign(existing, normalizeCustomer(saved));
        else state.customers.unshift(normalizeCustomer(saved));
      }
      save(state);
      return state;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Falha ao salvar cliente.'));
    }
  }

  const state = load();
  const docKey = payload.document.replace(/\D/g, '');
  const phoneKey = payload.phone.replace(/\D/g, '');

  if (input.id) {
    state.customers = state.customers.map((item) =>
      item.id === input.id ? { ...item, ...payload } : item,
    );
  } else {
    const existing =
      (docKey.length >= 11
        ? state.customers.find((item) => item.document.replace(/\D/g, '') === docKey)
        : undefined) ??
      (phoneKey.length >= 8
        ? state.customers.find((item) => item.phone.replace(/\D/g, '') === phoneKey)
        : undefined);
    if (existing) {
      Object.assign(existing, payload);
    } else {
      state.customers.unshift({
        ...payload,
        id: uid('CLI'),
        createdAt: new Date().toISOString(),
      });
    }
  }
  save(state);
  return state;
}

export async function removeCustomer(id: string): Promise<AdminState> {
  if (isNestAuthed()) {
    try {
      await apiDeleteCustomer(id);
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Falha ao remover cliente.'));
    }
  }
  const state = load();
  state.customers = state.customers.filter((item) => item.id !== id);
  save(state);
  return state;
}

export async function removeStockItem(id: string): Promise<AdminState> {
  if (isNestAuthed()) {
    try {
      await apiDeleteStock(id);
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Falha ao remover estoque.'));
    }
  }
  const state = load();
  state.stock = state.stock.filter((item) => item.id !== id);
  save(state);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STOCK_EVENT));
  }
  return state;
}

export async function removePriceTable(id: string): Promise<AdminState> {
  if (isNestAuthed()) {
    try {
      await apiDeletePriceTable(id);
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Falha ao remover tabela.'));
    }
  }
  const state = load();
  state.priceTables = state.priceTables.filter((item) => item.id !== id);
  save(state);
  return state;
}

export async function removePayment(id: string): Promise<AdminState> {
  if (isNestAuthed()) {
    try {
      await apiDeletePayment(id);
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Falha ao remover pagamento.'));
    }
  }
  const state = load();
  state.payments = state.payments.filter((item) => item.id !== id);
  save(state);
  return state;
}

export function saveStock(items: StockItem[]) {
  const state = load();
  state.stock = items.map(normalizeStock);
  save(state);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STOCK_EVENT));
  }
  return state;
}

export async function upsertStockItem(
  item: Omit<StockItem, 'id'> & { id?: string },
): Promise<AdminState> {
  if (isNestAuthed()) {
    try {
      const payload = normalizeStock({
        ...item,
        id: item.id ?? 'STK-TEMP',
      } as StockItem);
      const body = toNestStockBody(payload);
      const saved = item.id
        ? await apiUpdateStock(item.id, body)
        : await apiCreateStock(body);
      const state = load();
      if (item.id) {
        state.stock = state.stock.map((row) =>
          row.id === item.id
            ? normalizeStock({ ...row, ...saved, id: item.id, maxQty: row.maxQty || payload.maxQty })
            : row,
        );
      } else {
        state.stock = [
          normalizeStock({ ...payload, ...saved, id: saved.id, maxQty: payload.maxQty }),
          ...state.stock,
        ];
      }
      save(state);
      window.dispatchEvent(new Event(STOCK_EVENT));
      void import('./totemLiveSync').then(({ notifyTotemLive }) => notifyTotemLive());
      return state;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Falha ao salvar estoque.'));
    }
  }

  const state = load();
  if (item.id) {
    state.stock = state.stock.map((row) =>
      row.id === item.id ? normalizeStock({ ...row, ...item, id: item.id }) : row,
    );
  } else {
    state.stock = [
      normalizeStock({ ...item, id: uid('STK') } as StockItem),
      ...state.stock,
    ];
  }
  save(state);
  window.dispatchEvent(new Event(STOCK_EVENT));
  void import('./totemLiveSync').then(({ notifyTotemLive }) => notifyTotemLive());
  return state;
}

export async function savePriceTables(items: PriceTable[]): Promise<AdminState> {
  if (isNestAuthed()) {
    try {
      const current = load().priceTables;
      const nextIds = new Set(items.map((item) => item.id).filter(Boolean));
      for (const old of current) {
        if (!nextIds.has(old.id)) await apiDeletePriceTable(old.id);
      }
      const saved: PriceTable[] = [];
      for (const item of items) {
        const body = { name: item.name, percent: item.percent, active: item.active };
        if (current.some((row) => row.id === item.id)) {
          saved.push(await apiUpdatePriceTable(item.id, body));
        } else {
          saved.push(await apiCreatePriceTable(body));
        }
      }
      const state = load();
      state.priceTables = saved;
      save(state);
      return state;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Falha ao salvar tabelas.'));
    }
  }
  const state = load();
  state.priceTables = items;
  save(state);
  return state;
}

export async function savePayments(items: PaymentMethod[]): Promise<AdminState> {
  if (isNestAuthed()) {
    try {
      const current = load().payments;
      const nextIds = new Set(items.map((item) => item.id).filter(Boolean));
      for (const old of current) {
        if (!nextIds.has(old.id)) await apiDeletePayment(old.id);
      }
      const saved: PaymentMethod[] = [];
      for (const item of items) {
        const body = {
          name: item.name,
          type: item.type,
          priceTableId: item.priceTableId,
          maxInstallments: item.maxInstallments,
          active: item.active,
        };
        if (current.some((row) => row.id === item.id)) {
          saved.push(await apiUpdatePayment(item.id, body));
        } else {
          saved.push(await apiCreatePayment(body));
        }
      }
      const state = load();
      state.payments = saved;
      save(state);
      return state;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Falha ao salvar pagamentos.'));
    }
  }
  const state = load();
  state.payments = items;
  save(state);
  return state;
}

export async function closeSale(input: {
  ticketId: string | null;
  customerName: string;
  customerPhone: string;
  productName: string;
  amount: number;
  payment: string;
}) {
  return closePosSale({
    ticketId: input.ticketId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    paymentName: input.payment,
    priceTableName: 'Vista',
    discount: 0,
    surcharge: 0,
    lines: [{ stockId: '', name: input.productName, qty: 1, unitPrice: input.amount, imei: '' }],
  });
}

export async function closePosSale(input: {
  ticketId: string | null;
  customerName: string;
  customerPhone: string;
  customerDocument?: string;
  paymentName: string;
  priceTableName: string;
  paymentMethodId?: string;
  priceTableId?: string;
  discount: number;
  surcharge: number;
  sellerId?: string;
  sellerName?: string;
  lines: PosLineInput[];
}): Promise<AdminState> {
  if (isNestAuthed()) {
    try {
      const order = await apiClosePosSale({
        ticketId: input.ticketId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerDocument: input.customerDocument,
        paymentName: input.paymentName,
        priceTableName: input.priceTableName,
        paymentMethodId: input.paymentMethodId,
        priceTableId: input.priceTableId,
        discount: input.discount,
        surcharge: input.surcharge,
        sellerId: input.sellerId,
        sellerName: input.sellerName,
        lines: input.lines.filter((line) => line.stockId),
      });
      const state = load();
      state.orders = [
        {
          id: order.id,
          ticketId: order.ticketId,
          customerName: order.customerName,
          customerDocument: order.customerDocument,
          productName: order.productName,
          amount: order.amount,
          status: order.status,
          payment: order.payment,
          sellerId: order.sellerId,
          sellerName: order.sellerName,
          createdAt: order.createdAt,
        },
        ...state.orders.filter((item) => item.id !== order.id),
      ];
      for (const line of input.lines) {
        const stock = state.stock.find((item) => item.id === line.stockId);
        if (stock) {
          stock.qty = Math.max(0, stock.qty - line.qty);
          if (line.imei && stock.imei === line.imei) stock.imei = '';
        }
      }
      state.finance.unshift({
        id: uid('FIN'),
        type: 'in',
        label: `Venda ${order.id} · ${order.productName}`,
        amount: order.amount,
        createdAt: order.createdAt,
        source: 'pos',
        refId: order.id,
      });
      if (input.customerPhone.replace(/\D/g, '').length >= 8) {
        const phoneKey = input.customerPhone.replace(/\D/g, '');
        const existing = state.customers.find(
          (item) => item.phone.replace(/\D/g, '') === phoneKey,
        );
        if (existing) {
          existing.name = input.customerName || existing.name;
          existing.phone = input.customerPhone;
        }
      }
      save(state);
      window.dispatchEvent(new Event(STOCK_EVENT));
      return state;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Falha ao fechar venda.'));
    }
  }

  const state = load();
  const subtotal = input.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const amount = Math.max(0, subtotal - input.discount + input.surcharge);
  const summary = input.lines.map((line) => `${line.qty}x ${line.name}`).join(', ');
  const order: SalesOrder = {
    id: uid('PED'),
    ticketId: input.ticketId,
    customerName: input.customerName || 'Consumidor Final',
    customerDocument: (input.customerDocument ?? '').replace(/\D/g, ''),
    productName: summary,
    amount,
    status: 'sold',
    payment: `${input.paymentName} · ${input.priceTableName}`,
    sellerId: input.sellerId ?? '',
    sellerName: input.sellerName ?? '',
    createdAt: new Date().toISOString(),
  };
  state.orders.unshift(order);
  state.finance.unshift({
    id: uid('FIN'),
    type: 'in',
    label: `Venda ${order.id} · ${summary}`,
    amount,
    createdAt: order.createdAt,
    source: 'pos',
    refId: order.id,
  });

  const saleMoves: Array<{
    stockId: string;
    stockName: string;
    sku: string;
    type: 'sale';
    qty: number;
    direction: -1;
    unitCost: number;
    balanceAfter: number;
    note: string;
    refId: string;
    warehouseId?: string;
  }> = [];

  for (const line of input.lines) {
    const stock = line.stockId
      ? state.stock.find((item) => item.id === line.stockId)
      : state.stock.find((item) => line.name.toLowerCase().includes(item.name.toLowerCase()));
    if (stock) {
      stock.qty = Math.max(0, stock.qty - line.qty);
      if (line.imei && stock.imei === line.imei) stock.imei = '';
      saleMoves.push({
        stockId: stock.id,
        stockName: stock.name,
        sku: stock.sku,
        type: 'sale',
        qty: line.qty,
        direction: -1,
        unitCost: stock.avgCost || stock.cost || 0,
        balanceAfter: stock.qty,
        note: `PDV ${order.id}`,
        refId: order.id,
        warehouseId: stock.warehouseId,
      });
    }
  }

  if (input.customerPhone.replace(/\D/g, '').length >= 8) {
    const phoneKey = input.customerPhone.replace(/\D/g, '');
    const existing = state.customers.find((item) => item.phone.replace(/\D/g, '') === phoneKey);
    if (existing) {
      existing.name = input.customerName || existing.name;
      existing.phone = input.customerPhone;
    } else {
      state.customers.unshift({
        id: uid('CLI'),
        name: input.customerName || 'Cliente PDV',
        phone: input.customerPhone,
        document: '',
        email: '',
        city: '',
        zipCode: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        state: '',
        active: true,
        createdAt: order.createdAt,
      });
    }
  }

  save(state);
  if (saleMoves.length) {
    void import('./stockLedger').then(({ logStockMovements }) => {
      logStockMovements(saleMoves);
    });
  }
  return state;
}

export async function addFinance(
  entry: Omit<FinanceEntry, 'id' | 'createdAt'>,
): Promise<AdminState> {
  if (isNestAuthed() && (entry.source ?? 'manual') === 'manual') {
    try {
      const saved = await apiCreateFinanceManual({
        type: entry.type,
        amount: entry.amount,
        label: entry.label,
      });
      const state = load();
      state.finance.unshift(normalizeFinance(saved));
      save(state);
      return state;
    } catch (error) {
      throw new Error(apiErrorMessage(error, 'Falha ao lançar financeiro.'));
    }
  }

  const state = load();
  state.finance.unshift({
    ...entry,
    source: entry.source ?? 'manual',
    id: uid('FIN'),
    createdAt: new Date().toISOString(),
  });
  save(state);
  return state;
}

export function findStockMatches(query: string, limit = 8) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [] as StockItem[];
  return load()
    .stock.filter((item) => {
      const hay = `${item.name} ${item.sku} ${item.barcode} ${item.imei}`.toLowerCase();
      return hay.includes(needle);
    })
    .slice(0, limit);
}

export function getStockItem(id: string) {
  return load().stock.find((item) => item.id === id) ?? null;
}

export const STOCK_KIND_LABEL: Record<StockKind, string> = {
  part: 'Peça',
  device: 'Aparelho',
  supply: 'Insumo',
};

export const STOCK_CONDITION_LABEL: Record<StockCondition, string> = {
  new: 'Novo',
  used: 'Usado',
  refurbished: 'Recondicionado',
};

export const FINANCE_SOURCE_LABEL: Record<FinanceSource, string> = {
  manual: 'Manual',
  pos: 'PDV',
  os_part: 'OS · peça',
  os_purchase: 'OS · compra',
  os_revenue: 'OS · receita',
  os_reversal: 'OS · estorno',
};

export function parsePriceLabel(label: string) {
  const cleaned = label.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}
