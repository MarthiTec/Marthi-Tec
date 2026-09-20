import { ATTR_CAP, ATTR_COR } from './attributeStore';

const STORAGE_KEY = 'marthi.admin.v1';

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
  cost: number;
  price: number;
  kind: StockKind;
  condition: StockCondition;
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
  ];
}

function variantSku(
  item: Omit<StockItem, 'attrs' | 'kind' | 'condition' | 'sourceWorkOrderId' | 'showOnTotem' | 'images'> &
    Partial<Pick<StockItem, 'kind' | 'condition' | 'sourceWorkOrderId' | 'showOnTotem' | 'images'>>,
): StockItem {
  return normalizeStock({ ...item, attrs: {} } as StockItem);
}

function seedStock(): StockItem[] {
  return [
    variantSku({
      id: 'STK-16PM',
      name: 'iPhone 16 Pro Max',
      sku: 'APL-16PM-256',
      barcode: '7891000160256',
      imei: '353456789012345',
      color: 'Desert',
      capacity: '256 GB',
      qty: 4,
      minQty: 2,
      cost: 6200,
      price: 6990,
    }),
    variantSku({
      id: 'STK-16PM-512',
      name: 'iPhone 16 Pro Max',
      sku: 'APL-16PM-512',
      barcode: '7891000160512',
      imei: '',
      color: 'Desert',
      capacity: '512 GB',
      qty: 2,
      minQty: 1,
      cost: 7300,
      price: 8290,
    }),
    variantSku({
      id: 'STK-16P',
      name: 'iPhone 16 Pro',
      sku: 'APL-16P-128',
      barcode: '7891000160128',
      imei: '353456789012346',
      color: 'Preto',
      capacity: '128 GB',
      qty: 6,
      minQty: 2,
      cost: 5400,
      price: 6290,
    }),
    variantSku({
      id: 'STK-16P-256',
      name: 'iPhone 16 Pro',
      sku: 'APL-16P-256',
      barcode: '7891000160257',
      imei: '',
      color: 'Preto',
      capacity: '256 GB',
      qty: 3,
      minQty: 1,
      cost: 6100,
      price: 7190,
    }),
    variantSku({
      id: 'STK-15',
      name: 'iPhone 15',
      sku: 'APL-15-128',
      barcode: '7891000150128',
      imei: '359844120000001',
      color: 'Preto',
      capacity: '128 GB',
      qty: 8,
      minQty: 3,
      cost: 3800,
      price: 4499,
    }),
    variantSku({
      id: 'STK-15-256',
      name: 'iPhone 15',
      sku: 'APL-15-256',
      barcode: '7891000150256',
      imei: '',
      color: 'Preto',
      capacity: '256 GB',
      qty: 4,
      minQty: 2,
      cost: 4400,
      price: 5199,
    }),
    variantSku({
      id: 'STK-14-128',
      name: 'iPhone 14',
      sku: 'APL-14-128',
      barcode: '7891000140128',
      imei: '',
      color: 'Preto',
      capacity: '128 GB',
      qty: 5,
      minQty: 2,
      cost: 3200,
      price: 3899,
    }),
    variantSku({
      id: 'STK-14-256',
      name: 'iPhone 14',
      sku: 'APL-14-256',
      barcode: '7891000140256',
      imei: '',
      color: 'Preto',
      capacity: '256 GB',
      qty: 3,
      minQty: 1,
      cost: 3700,
      price: 4499,
    }),
    variantSku({
      id: 'STK-13-128',
      name: 'iPhone 13',
      sku: 'APL-13-128',
      barcode: '7891000130128',
      imei: '',
      color: 'Preto',
      capacity: '128 GB',
      qty: 4,
      minQty: 2,
      cost: 2800,
      price: 3400,
    }),
    variantSku({
      id: 'STK-13-256',
      name: 'iPhone 13',
      sku: 'APL-13-256',
      barcode: '7891000130256',
      imei: '',
      color: 'Preto',
      capacity: '256 GB',
      qty: 2,
      minQty: 1,
      cost: 3200,
      price: 3899,
    }),
    variantSku({
      id: 'STK-12-64',
      name: 'iPhone 12',
      sku: 'APL-12-64',
      barcode: '7891000120064',
      imei: '',
      color: 'Preto',
      capacity: '64 GB',
      qty: 3,
      minQty: 1,
      cost: 2100,
      price: 2799,
    }),
    variantSku({
      id: 'STK-12-128',
      name: 'iPhone 12',
      sku: 'APL-12-128',
      barcode: '7891000120128',
      imei: '',
      color: 'Preto',
      capacity: '128 GB',
      qty: 3,
      minQty: 1,
      cost: 2400,
      price: 3199,
    }),
    variantSku({
      id: 'STK-11-64',
      name: 'iPhone 11',
      sku: 'APL-11-64',
      barcode: '7891000110064',
      imei: '',
      color: 'Preto',
      capacity: '64 GB',
      qty: 4,
      minQty: 1,
      cost: 1700,
      price: 2299,
    }),
    variantSku({
      id: 'STK-11-128',
      name: 'iPhone 11',
      sku: 'APL-11-128',
      barcode: '7891000110128',
      imei: '',
      color: 'Preto',
      capacity: '128 GB',
      qty: 3,
      minQty: 1,
      cost: 2000,
      price: 2699,
    }),
    variantSku({
      id: 'STK-RN13',
      name: 'Redmi Note 13 Pro',
      sku: 'XIA-RN13-256',
      barcode: '7892000130256',
      imei: '',
      color: 'Preto',
      capacity: '256 GB',
      qty: 12,
      minQty: 4,
      cost: 1650,
      price: 2199,
    }),
    variantSku({
      id: 'STK-RN13-512',
      name: 'Redmi Note 13 Pro',
      sku: 'XIA-RN13-512',
      barcode: '7892000130512',
      imei: '',
      color: 'Preto',
      capacity: '512 GB',
      qty: 5,
      minQty: 2,
      cost: 1950,
      price: 2599,
    }),
  ];
}

function mergeVariantStock(stock: StockItem[]) {
  const ids = new Set(stock.map((item) => item.id));
  const missing = seedStock().filter((item) => !ids.has(item.id));
  if (!missing.length) return stock.map(normalizeStock);
  return [...stock.map(normalizeStock), ...missing];
}

function seed(): AdminState {
  return {
    customers: [
      {
        id: uid('CLI'),
        name: 'Ana Souza',
        phone: '(24) 99811-2200',
        document: '123.456.789-00',
        email: 'ana@email.com',
        city: 'Três Rios',
        zipCode: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        state: 'RJ',
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: uid('CLI'),
        name: 'Carlos Lima',
        phone: '(24) 99200-1188',
        document: '987.654.321-00',
        email: 'carlos@email.com',
        city: 'Três Rios',
        zipCode: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        state: 'RJ',
        active: true,
        createdAt: new Date().toISOString(),
      },
    ],
    stock: seedStock(),
    orders: [],
    finance: [
      {
        id: uid('FIN'),
        type: 'in',
        label: 'Saldo inicial de caixa',
        amount: 2500,
        createdAt: new Date().toISOString(),
        source: 'manual',
      },
    ],
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
    ? item.images.map((url) => String(url).trim()).filter(Boolean)
    : [];
  return {
    ...item,
    barcode: item.barcode ?? '',
    imei: item.imei ?? '',
    attrs,
    color: attrs[ATTR_COR] ?? item.color ?? '',
    capacity: attrs[ATTR_CAP] ?? item.capacity ?? '',
    kind: item.kind ?? (looksLikeDevice ? 'device' : 'part'),
    condition: item.condition ?? 'new',
    sourceWorkOrderId: item.sourceWorkOrderId,
    showOnTotem: item.showOnTotem ?? looksLikeDevice,
    images: images.length ? images : defaultImagesForName(item.name),
    supplierId: item.supplierId ?? '',
    fiscalClassificationId: item.fiscalClassificationId ?? '',
    warehouseId: item.warehouseId ?? '',
    trackLot: item.trackLot ?? false,
    isKit: item.isKit ?? false,
  };
}

function defaultImagesForName(name: string): string[] {
  const slug = name.toLowerCase();
  const map: { test: RegExp; folder: string; count: number }[] = [
    { test: /16 pro max/, folder: 'iphone-16-pro-max', count: 5 },
    { test: /16 pro/, folder: 'iphone-16-pro', count: 4 },
    { test: /iphone 15/, folder: 'iphone-15', count: 4 },
    { test: /iphone 14/, folder: 'iphone-14', count: 4 },
    { test: /iphone 13/, folder: 'iphone-13', count: 4 },
    { test: /iphone 12/, folder: 'iphone-12', count: 3 },
    { test: /iphone 11/, folder: 'iphone-11', count: 3 },
    { test: /redmi|note 13/, folder: 'redmi-note-13', count: 4 },
  ];
  const hit = map.find((item) => item.test.test(slug));
  if (!hit) return [];
  return Array.from({ length: hit.count }, (_, index) => `/totem/${hit.folder}/${index + 1}.svg`);
}

export function stockItemImages(item: Pick<StockItem, 'name' | 'images'> | null | undefined) {
  if (!item) return [] as string[];
  if (item.images?.length) return item.images;
  return defaultImagesForName(item.name);
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
    stock: (parsed.stock ?? base.stock).map(normalizeStock),
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
  try {
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
    const shouldMergeVariants = !localStorage.getItem('marthi.admin.variants.v2');
    if (shouldMergeVariants) {
      next.stock = mergeVariantStock(next.stock);
      localStorage.setItem('marthi.admin.variants.v2', '1');
    }
    if (!parsed.priceTables?.length || !parsed.payments?.length || stockNeedsCodes || shouldMergeVariants) {
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getAdminState() {
  return load();
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
  item.qty = Math.max(0, item.qty + delta);
  save(state);
  window.dispatchEvent(new Event(STOCK_EVENT));
  return { ok: true as const, item };
}

export function searchOrders(query: string, limit = 12) {
  const needle = query.trim().toLowerCase();
  const orders = load().orders.filter((item) => item.status === 'sold' || item.status === 'cancelled');
  if (!needle) return orders.slice(0, limit);
  return orders
    .filter((item) => {
      const blob = `${item.id} ${item.customerName} ${item.customerDocument ?? ''} ${item.productName} ${item.payment} ${item.status}`.toLowerCase();
      return blob.includes(needle);
    })
    .slice(0, limit);
}

export function getOrderById(id: string) {
  return load().orders.find((item) => item.id === id) ?? null;
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

export function upsertCustomer(input: Omit<Customer, 'id' | 'createdAt'> & { id?: string }) {
  const state = load();
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

export function removeCustomer(id: string) {
  const state = load();
  state.customers = state.customers.filter((item) => item.id !== id);
  save(state);
  return state;
}

export function removeStockItem(id: string) {
  const state = load();
  state.stock = state.stock.filter((item) => item.id !== id);
  save(state);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('marthi-stock'));
  }
  return state;
}

export function removePriceTable(id: string) {
  const state = load();
  state.priceTables = state.priceTables.filter((item) => item.id !== id);
  save(state);
  return state;
}

export function removePayment(id: string) {
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
    window.dispatchEvent(new Event('marthi-stock'));
  }
  return state;
}

export const STOCK_EVENT = 'marthi-stock';

export function savePriceTables(items: PriceTable[]) {
  const state = load();
  state.priceTables = items;
  save(state);
  return state;
}

export function savePayments(items: PaymentMethod[]) {
  const state = load();
  state.payments = items;
  save(state);
  return state;
}

export function closeSale(input: {
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

export function closePosSale(input: {
  ticketId: string | null;
  customerName: string;
  customerPhone: string;
  customerDocument?: string;
  paymentName: string;
  priceTableName: string;
  discount: number;
  surcharge: number;
  sellerId?: string;
  sellerName?: string;
  lines: PosLineInput[];
}) {
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

  for (const line of input.lines) {
    const stock = line.stockId
      ? state.stock.find((item) => item.id === line.stockId)
      : state.stock.find((item) => line.name.toLowerCase().includes(item.name.toLowerCase()));
    if (stock) {
      stock.qty = Math.max(0, stock.qty - line.qty);
      if (line.imei && stock.imei === line.imei) stock.imei = '';
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
  return state;
}

export function addFinance(entry: Omit<FinanceEntry, 'id' | 'createdAt'>) {
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
