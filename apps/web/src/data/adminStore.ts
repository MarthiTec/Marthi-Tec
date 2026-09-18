import { ATTR_CAP, ATTR_COR } from './attributeStore';

const STORAGE_KEY = 'marthi.admin.v1';

export type Customer = {
  id: string;
  name: string;
  phone: string;
  document: string;
  email: string;
  city: string;
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
  productName: string;
  amount: number;
  status: 'open' | 'sold' | 'cancelled';
  payment: string;
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
  item: Omit<StockItem, 'attrs' | 'kind' | 'condition' | 'sourceWorkOrderId'> &
    Partial<Pick<StockItem, 'kind' | 'condition' | 'sourceWorkOrderId'>>,
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
        createdAt: new Date().toISOString(),
      },
      {
        id: uid('CLI'),
        name: 'Carlos Lima',
        phone: '(24) 99200-1188',
        document: '987.654.321-00',
        email: 'carlos@email.com',
        city: 'Três Rios',
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
  };
}

function normalizeFinance(entry: FinanceEntry): FinanceEntry {
  return {
    ...entry,
    source: entry.source ?? 'manual',
    refId: entry.refId,
  };
}

function hydrate(parsed: Partial<AdminState>): AdminState {
  const base = seed();
  return {
    customers: parsed.customers ?? base.customers,
    stock: (parsed.stock ?? base.stock).map(normalizeStock),
    orders: parsed.orders ?? [],
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

export function upsertCustomer(input: Omit<Customer, 'id' | 'createdAt'> & { id?: string }) {
  const state = load();
  if (input.id) {
    state.customers = state.customers.map((item) =>
      item.id === input.id ? { ...item, ...input } : item,
    );
  } else {
    const existing = state.customers.find(
      (item) => item.phone.replace(/\D/g, '') === input.phone.replace(/\D/g, ''),
    );
    if (existing) {
      Object.assign(existing, input);
    } else {
      state.customers.unshift({
        ...input,
        id: uid('CLI'),
        createdAt: new Date().toISOString(),
      });
    }
  }
  save(state);
  return state;
}

export function saveStock(items: StockItem[]) {
  const state = load();
  state.stock = items.map(normalizeStock);
  save(state);
  return state;
}

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
  paymentName: string;
  priceTableName: string;
  discount: number;
  surcharge: number;
  lines: PosLineInput[];
}) {
  const state = load();
  const subtotal = input.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const amount = Math.max(0, subtotal - input.discount + input.surcharge);
  const summary = input.lines.map((line) => `${line.qty}x ${line.name}`).join(', ');
  const order: SalesOrder = {
    id: uid('PED'),
    ticketId: input.ticketId,
    customerName: input.customerName || 'Consumidor',
    productName: summary,
    amount,
    status: 'sold',
    payment: `${input.paymentName} · ${input.priceTableName}`,
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
