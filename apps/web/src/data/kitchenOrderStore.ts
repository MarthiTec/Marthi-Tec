/**
 * Fila unificada da cozinha — alimentada por mesa (garçom), totem e balcão.
 * Persistência local até o backend Nest ter o mesmo contrato.
 */

export type KitchenChannel = 'mesa' | 'totem' | 'balcao' | 'cardapio' | 'delivery' | 'retirada';
export type KitchenStatus = 'queued' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type TableFloorStatus = 'free' | 'occupied' | 'reserved' | 'closing';

export type KitchenLine = {
  id: string;
  name: string;
  qty: number;
  note: string;
  detail: string;
};

export type KitchenOrder = {
  id: string;
  /** Senha curta na tela da cozinha / ticket. */
  senha: string;
  channel: KitchenChannel;
  status: KitchenStatus;
  tableId: string | null;
  tableLabel: string | null;
  customerName: string;
  customerPhone?: string;
  deliveryAddress?: string;
  totalAmount?: number;
  lines: KitchenLine[];
  note: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  readyAt: string | null;
  sourceTicketId: string | null;
};

export type RestaurantTable = {
  id: string;
  number: number;
  label: string;
  seats: number;
  status: TableFloorStatus;
  openOrderId: string | null;
  guestName: string;
  reservationTime?: string;
  reservationParty?: number;
  reservationPhone?: string;
};

type KitchenState = {
  tables: RestaurantTable[];
  orders: KitchenOrder[];
  senhaSeq: number;
};

const STORAGE_KEY = 'marthi.kitchen.v1';
export const KITCHEN_EVENT = 'marthi-kitchen-updated';

export const CHANNEL_LABEL: Record<KitchenChannel, string> = {
  mesa: 'Mesa',
  totem: 'Totem',
  balcao: 'Balcão',
  cardapio: 'Cardápio Digital',
  delivery: 'Entrega (Delivery)',
  retirada: 'Retirada no Local',
};

export const STATUS_LABEL: Record<KitchenStatus, string> = {
  queued: 'Na fila',
  preparing: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
}

function seedTables(): RestaurantTable[] {
  return Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    return {
      id: `MESA-${String(number).padStart(2, '0')}`,
      number,
      label: `Mesa ${number}`,
      seats: number <= 4 ? 2 : number <= 8 ? 4 : 6,
      status: 'free' as const,
      openOrderId: null,
      guestName: '',
    };
  });
}

function emptyState(): KitchenState {
  return { tables: seedTables(), orders: [], senhaSeq: 100 };
}

function load(): KitchenState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<KitchenState>;
    const tables =
      Array.isArray(parsed.tables) && parsed.tables.length > 0 ? parsed.tables : seedTables();
    return {
      tables,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      senhaSeq: typeof parsed.senhaSeq === 'number' ? parsed.senhaSeq : 100,
    };
  } catch {
    return emptyState();
  }
}

function save(state: KitchenState) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...state,
      orders: state.orders.slice(0, 200),
    }),
  );
  window.dispatchEvent(new Event(KITCHEN_EVENT));
}

function nextSenha(state: KitchenState) {
  const senhaSeq = state.senhaSeq >= 999 ? 100 : state.senhaSeq + 1;
  return { senhaSeq, senha: String(senhaSeq) };
}

export function getKitchenState() {
  return load();
}

export function listRestaurantTables() {
  return load().tables.slice().sort((a, b) => a.number - b.number);
}

export function listKitchenOrders(filter?: { activeOnly?: boolean }) {
  const orders = load().orders.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (filter?.activeOnly) {
    return orders.filter((item) =>
      item.status === 'queued' || item.status === 'preparing' || item.status === 'ready',
    );
  }
  return orders;
}

export function getKitchenOrder(id: string) {
  return load().orders.find((item) => item.id === id) ?? null;
}

export function getTable(id: string) {
  return load().tables.find((item) => item.id === id) ?? null;
}

export type EnqueueKitchenInput = {
  channel: KitchenChannel;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  totalAmount?: number;
  tableId?: string | null;
  note?: string;
  lines: Array<{ name: string; qty?: number; note?: string; detail?: string }>;
  sourceTicketId?: string | null;
  /** Se true, marca a mesa como ocupada e vincula o pedido. */
  occupyTable?: boolean;
};

export function enqueueKitchenOrder(input: EnqueueKitchenInput) {
  const lines = input.lines
    .map((line) => ({
      id: uid('LN'),
      name: line.name.trim(),
      qty: Math.max(1, Math.floor(line.qty ?? 1)),
      note: (line.note ?? '').trim(),
      detail: (line.detail ?? '').trim(),
    }))
    .filter((line) => line.name);

  if (!lines.length) {
    throw new Error('Informe ao menos um item para a cozinha.');
  }

  const state = load();
  const { senha, senhaSeq } = nextSenha(state);
  const now = new Date().toISOString();
  const table = input.tableId ? state.tables.find((item) => item.id === input.tableId) : null;

  const order: KitchenOrder = {
    id: uid('KDS'),
    senha,
    channel: input.channel,
    status: 'queued',
    tableId: table?.id ?? null,
    tableLabel: table?.label ?? null,
    customerName: (input.customerName ?? table?.guestName ?? '').trim() || 'Cliente',
    customerPhone: input.customerPhone,
    deliveryAddress: input.deliveryAddress,
    totalAmount: input.totalAmount,
    lines,
    note: (input.note ?? '').trim(),
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    readyAt: null,
    sourceTicketId: input.sourceTicketId ?? null,
  };

  const tables = state.tables.map((item) => {
    if (!table || item.id !== table.id) return item;
    if (input.occupyTable === false) return item;
    return {
      ...item,
      status: 'occupied' as const,
      openOrderId: order.id,
      guestName: order.customerName === 'Cliente' ? item.guestName : order.customerName,
    };
  });

  save({
    tables,
    orders: [order, ...state.orders],
    senhaSeq,
  });

  return order;
}

export function updateKitchenStatus(id: string, status: KitchenStatus) {
  const state = load();
  const now = new Date().toISOString();
  const orders = state.orders.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      status,
      updatedAt: now,
      startedAt:
        status === 'preparing' ? item.startedAt ?? now : item.startedAt,
      readyAt: status === 'ready' ? now : item.readyAt,
    };
  });

  let tables = state.tables;
  const order = orders.find((item) => item.id === id);
  if (order?.tableId && (status === 'delivered' || status === 'cancelled')) {
    tables = tables.map((item) =>
      item.id === order.tableId && item.openOrderId === id
        ? { ...item, status: 'free' as const, openOrderId: null, guestName: '' }
        : item,
    );
  }

  save({ ...state, tables, orders });
  return orders.find((item) => item.id === id) ?? null;
}

export function seatTable(tableId: string, guestName = '') {
  const state = load();
  const tables = state.tables.map((item) =>
    item.id === tableId
      ? {
          ...item,
          status: item.status === 'free' ? ('occupied' as const) : item.status,
          guestName: guestName.trim() || item.guestName,
        }
      : item,
  );
  save({ ...state, tables });
  return tables.find((item) => item.id === tableId) ?? null;
}

export function reserveTable(
  tableId: string,
  input: { guestName: string; time: string; guests: number; phone?: string },
) {
  const state = load();
  const tables = state.tables.map((item) =>
    item.id === tableId
      ? {
          ...item,
          status: 'reserved' as const,
          guestName: input.guestName.trim() || item.guestName,
          reservationTime: input.time,
          reservationParty: input.guests,
          reservationPhone: input.phone,
        }
      : item,
  );
  save({ ...state, tables });
  return tables.find((item) => item.id === tableId) ?? null;
}

export function unreserveTable(tableId: string) {
  const state = load();
  const tables = state.tables.map((item) =>
    item.id === tableId && item.status === 'reserved'
      ? {
          ...item,
          status: 'free' as const,
          guestName: '',
          reservationTime: undefined,
          reservationParty: undefined,
          reservationPhone: undefined,
        }
      : item,
  );
  save({ ...state, tables });
  return tables.find((item) => item.id === tableId) ?? null;
}

export function clearTable(tableId: string) {
  const state = load();
  const table = state.tables.find((item) => item.id === tableId);
  const orders = state.orders.map((item) => {
    if (!table?.openOrderId || item.id !== table.openOrderId) return item;
    if (item.status === 'delivered' || item.status === 'cancelled') return item;
    return {
      ...item,
      status: 'delivered' as const,
      updatedAt: new Date().toISOString(),
      readyAt: item.readyAt ?? new Date().toISOString(),
    };
  });
  const tables = state.tables.map((item) =>
    item.id === tableId
      ? {
          ...item,
          status: 'free' as const,
          openOrderId: null,
          guestName: '',
          reservationTime: undefined,
          reservationParty: undefined,
          reservationPhone: undefined,
        }
      : item,
  );
  save({ ...state, tables, orders });
  return tables.find((item) => item.id === tableId) ?? null;
}

export function resetKitchenDemo() {
  save(emptyState());
}

export function kitchenOrderElapsed(order: KitchenOrder) {
  const start = new Date(order.createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - start) / 1000));
}

export function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
