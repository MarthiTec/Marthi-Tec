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

export type StockItem = {
  id: string;
  name: string;
  sku: string;
  color: string;
  capacity: string;
  qty: number;
  minQty: number;
  cost: number;
  price: number;
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

export type FinanceEntry = {
  id: string;
  type: 'in' | 'out';
  label: string;
  amount: number;
  createdAt: string;
};

type AdminState = {
  customers: Customer[];
  stock: StockItem[];
  orders: SalesOrder[];
  finance: FinanceEntry[];
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
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
    stock: [
      {
        id: 'STK-16PM',
        name: 'iPhone 16 Pro Max',
        sku: 'APL-16PM-256',
        color: 'Desert',
        capacity: '256 GB',
        qty: 4,
        minQty: 2,
        cost: 6200,
        price: 6990,
      },
      {
        id: 'STK-16P',
        name: 'iPhone 16 Pro',
        sku: 'APL-16P-128',
        color: 'Preto',
        capacity: '128 GB',
        qty: 6,
        minQty: 2,
        cost: 5400,
        price: 6290,
      },
      {
        id: 'STK-15',
        name: 'iPhone 15',
        sku: 'APL-15-128',
        color: 'Preto',
        capacity: '128 GB',
        qty: 8,
        minQty: 3,
        cost: 3800,
        price: 4499,
      },
      {
        id: 'STK-RN13',
        name: 'Redmi Note 13 Pro',
        sku: 'XIA-RN13-256',
        color: 'Preto',
        capacity: '256 GB',
        qty: 12,
        minQty: 4,
        cost: 1650,
        price: 2199,
      },
    ],
    orders: [],
    finance: [
      {
        id: uid('FIN'),
        type: 'in',
        label: 'Saldo inicial de caixa',
        amount: 2500,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function load(): AdminState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as AdminState;
    if (!parsed.customers || !parsed.stock) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

function save(state: AdminState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getAdminState() {
  return load();
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
  state.stock = items;
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
  const state = load();
  const order: SalesOrder = {
    id: uid('PED'),
    ticketId: input.ticketId,
    customerName: input.customerName,
    productName: input.productName,
    amount: input.amount,
    status: 'sold',
    payment: input.payment,
    createdAt: new Date().toISOString(),
  };
  state.orders.unshift(order);
  state.finance.unshift({
    id: uid('FIN'),
    type: 'in',
    label: `Venda ${order.id} · ${input.productName}`,
    amount: input.amount,
    createdAt: order.createdAt,
  });

  const stock = state.stock.find((item) =>
    input.productName.toLowerCase().includes(item.name.toLowerCase()),
  );
  if (stock && stock.qty > 0) stock.qty -= 1;

  const phoneKey = input.customerPhone.replace(/\D/g, '');
  const existing = state.customers.find((item) => item.phone.replace(/\D/g, '') === phoneKey);
  if (existing) {
    existing.name = input.customerName;
    existing.phone = input.customerPhone;
  } else {
    state.customers.unshift({
      id: uid('CLI'),
      name: input.customerName,
      phone: input.customerPhone,
      document: '',
      email: '',
      city: '',
      createdAt: order.createdAt,
    });
  }

  save(state);
  return state;
}

export function addFinance(entry: Omit<FinanceEntry, 'id' | 'createdAt'>) {
  const state = load();
  state.finance.unshift({
    ...entry,
    id: uid('FIN'),
    createdAt: new Date().toISOString(),
  });
  save(state);
  return state;
}

export function parsePriceLabel(label: string) {
  const cleaned = label.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}
