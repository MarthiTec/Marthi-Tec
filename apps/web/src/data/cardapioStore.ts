import { getAdminState } from './adminStore';
import {
  enqueueKitchenOrder,
  reserveTable as reserveKitchenTable,
  type KitchenOrder,
} from './kitchenOrderStore';

export type CardapioItem = {
  id: string;
  stockId?: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
  available: boolean;
  order: number;
  isPromotion?: boolean;
  badge?: string;
  availableTimeStart?: string;
  availableTimeEnd?: string;
};

export type CardapioConfig = {
  restaurantName: string;
  slogan: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string;
  accentColor: string;
  instagram: string;
  whatsapp: string;
  address: string;
  paymentMethods: string[];
  displayPrintTitle: string;
  displayPrintSubtitle: string;
  enableDineIn: boolean;
  enableDelivery: boolean;
  enableTakeout: boolean;
  enableReservation: boolean;
  deliveryFee: number;
  estimatedDeliveryMinutes: number;
  published: boolean;
  updatedAt: string;
};

export type TableReservation = {
  id: string;
  tableId: string;
  tableLabel: string;
  guestName: string;
  guestPhone: string;
  date: string;
  time: string;
  guests: number;
  notes?: string;
  status: 'confirmed' | 'cancelled' | 'seated';
  createdAt: string;
};

export type CardapioOrderType = 'local' | 'delivery' | 'retirada' | 'reserva';

export type CardapioClientOrder = {
  id: string;
  orderNumber: string;
  kitchenOrderId?: string;
  orderType: CardapioOrderType;
  tableId?: string | null;
  tableLabel?: string | null;
  customerName: string;
  customerPhone?: string;
  deliveryAddress?: string;
  items: Array<{
    itemId: string;
    name: string;
    price: number;
    qty: number;
    note?: string;
  }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes?: string;
  status: 'received' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  createdAt: string;
};

type CardapioState = {
  config: CardapioConfig;
  items: CardapioItem[];
  categories: string[];
  reservations: TableReservation[];
  orders: CardapioClientOrder[];
};

const CONFIG_KEY = 'marthi.cardapio.config.v1';
const ITEMS_KEY = 'marthi.cardapio.items.v1';
const RESERVATIONS_KEY = 'marthi.cardapio.reservations.v1';
const ORDERS_KEY = 'marthi.cardapio.orders.v1';
export const CARDAPIO_EVENT = 'marthi-cardapio-updated';

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
}

export const DEFAULT_CATEGORIES = [
  'Promoção do Dia',
  'Pratos do Dia',
  'Cafés & Bebidas',
  'Sobremesas',
  'Lanches & Entradas',
];

export const DEFAULT_CONFIG: CardapioConfig = {
  restaurantName: 'Café Escondido',
  slogan: 'Cafeteria & Gastronomia',
  logoUrl:
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200&auto=format&fit=crop&q=80',
  bannerUrl:
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1200&auto=format&fit=crop&q=80',
  primaryColor: '#3c2415',
  accentColor: '#c48a39',
  instagram: '@novocafeescondido',
  whatsapp: '5511999999999',
  address: 'Rua das Flores, 120 - Centro Histórico',
  paymentMethods: [
    'Pix com Chave / QR Code',
    'Cartão de Débito',
    'Cartão de Crédito (Visa, Master, Elo)',
    'Dinheiro',
    'Vale Refeição (VR, Sodexo, Ticket)',
  ],
  displayPrintTitle: 'APONTE A CÂMERA E ACESSE NOSSO CARDÁPIO',
  displayPrintSubtitle: 'Confira pratos, cafés, sobremesas, combos e promoções.',
  enableDineIn: true,
  enableDelivery: true,
  enableTakeout: true,
  enableReservation: true,
  deliveryFee: 5.0,
  estimatedDeliveryMinutes: 35,
  published: true,
  updatedAt: new Date().toISOString(),
};

export const SEED_ITEMS: CardapioItem[] = [
  {
    id: 'ITEM-FEIJOADA',
    name: 'Feijoada Especial',
    description:
      'Feijoada clássica preparada com tempero da casa, servida com arroz soltinho, couve fininha, farofa na manteiga e ovo frito.',
    price: 32.0,
    imageUrl:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80',
    category: 'Promoção do Dia',
    available: true,
    order: 1,
    isPromotion: true,
    badge: 'Mais Pedido',
  },
  {
    id: 'ITEM-CAMARAO',
    name: 'Camarão Escondido',
    description:
      'Camarões ao molho cremoso com catupiry artesanal e camada generosa de purê de aipim gratinado. Acompanha arroz e fritas.',
    price: 42.0,
    imageUrl:
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&auto=format&fit=crop&q=80',
    category: 'Pratos do Dia',
    available: true,
    order: 2,
    badge: 'Especial do Chef',
  },
  {
    id: 'ITEM-EXECUTIVO',
    name: 'Prato Executivo Bife Acebolado',
    description:
      'Bife macio de alcatra com cebolas douradas na chapa, arroz branco, feijão carioca bem temperado e salada fresca.',
    price: 29.9,
    imageUrl:
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&auto=format&fit=crop&q=80',
    category: 'Pratos do Dia',
    available: true,
    order: 3,
  },
  {
    id: 'ITEM-LASANHA',
    name: 'Lasanha à Bolonhesa Gratinada',
    description:
      'Massa artesanal intercalada com molho bolonhesa encorpado, queijo muçarela derretido e parmesão dourado no forno.',
    price: 34.9,
    imageUrl:
      'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=400&auto=format&fit=crop&q=80',
    category: 'Pratos do Dia',
    available: true,
    order: 4,
  },
  {
    id: 'ITEM-CAPPUCCINO',
    name: 'Cappuccino Italiano com Canela',
    description:
      'Espresso tirado na hora com leite vaporizado sedoso, espuma densa e toque suave de cacau e canela em pó.',
    price: 14.5,
    imageUrl:
      'https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&auto=format&fit=crop&q=80',
    category: 'Cafés & Bebidas',
    available: true,
    order: 5,
  },
  {
    id: 'ITEM-SUCO',
    name: 'Suco Natural da Fruta 400ml',
    description: 'Suco natural feito na hora. Opções: Laranja, Maracujá, Limonada Suíça ou Abacaxi com Hortelã.',
    price: 9.9,
    imageUrl:
      'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400&auto=format&fit=crop&q=80',
    category: 'Cafés & Bebidas',
    available: true,
    order: 6,
  },
  {
    id: 'ITEM-PUDIM',
    name: 'Pudim de Leite da Vovó',
    description:
      'Pudim tradicional de leite condensado sem furinhos, extremamente lisinho, com calda generosa de caramelo dourado.',
    price: 12.0,
    imageUrl:
      'https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?w=400&auto=format&fit=crop&q=80',
    category: 'Sobremesas',
    available: true,
    order: 7,
  },
];

function loadState(): CardapioState {
  try {
    const rawCfg = localStorage.getItem(CONFIG_KEY);
    const config: CardapioConfig = rawCfg ? { ...DEFAULT_CONFIG, ...JSON.parse(rawCfg) } : DEFAULT_CONFIG;

    const rawItems = localStorage.getItem(ITEMS_KEY);
    const items: CardapioItem[] = rawItems ? JSON.parse(rawItems) : SEED_ITEMS;

    const rawRes = localStorage.getItem(RESERVATIONS_KEY);
    const reservations: TableReservation[] = rawRes ? JSON.parse(rawRes) : [];

    const rawOrders = localStorage.getItem(ORDERS_KEY);
    const orders: CardapioClientOrder[] = rawOrders ? JSON.parse(rawOrders) : [];

    const categoriesSet = new Set<string>(DEFAULT_CATEGORIES);
    items.forEach((i) => {
      if (i.category) categoriesSet.add(i.category);
    });

    return {
      config,
      items,
      categories: Array.from(categoriesSet),
      reservations,
      orders,
    };
  } catch {
    return {
      config: DEFAULT_CONFIG,
      items: SEED_ITEMS,
      categories: DEFAULT_CATEGORIES,
      reservations: [],
      orders: [],
    };
  }
}

function notify() {
  window.dispatchEvent(new Event(CARDAPIO_EVENT));
}

export function getCardapioConfig(): CardapioConfig {
  return loadState().config;
}

export function saveCardapioConfig(patch: Partial<CardapioConfig>): CardapioConfig {
  const current = getCardapioConfig();
  const next: CardapioConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  notify();
  return next;
}

export function listCardapioItems(): CardapioItem[] {
  return loadState().items.slice().sort((a, b) => a.order - b.order);
}

export function saveCardapioItems(items: CardapioItem[]): void {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  notify();
}

export function addCardapioItem(item: Omit<CardapioItem, 'id' | 'order'>): CardapioItem {
  const current = listCardapioItems();
  const maxOrder = current.reduce((acc, cur) => Math.max(acc, cur.order), 0);
  const newItem: CardapioItem = {
    ...item,
    id: uid('PRATO'),
    order: maxOrder + 1,
  };
  const next = [...current, newItem];
  saveCardapioItems(next);
  return newItem;
}

export function updateCardapioItem(id: string, patch: Partial<CardapioItem>): CardapioItem | null {
  const current = listCardapioItems();
  const next = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
  saveCardapioItems(next);
  return next.find((item) => item.id === id) ?? null;
}

export function removeCardapioItem(id: string): void {
  const current = listCardapioItems();
  const next = current.filter((item) => item.id !== id);
  saveCardapioItems(next);
}

export function reorderCardapioItems(ids: string[]): void {
  const current = listCardapioItems();
  const map = new Map(current.map((item) => [item.id, item]));
  const next: CardapioItem[] = [];
  ids.forEach((id, index) => {
    const found = map.get(id);
    if (found) {
      next.push({ ...found, order: index + 1 });
      map.delete(id);
    }
  });
  // Remanescentes
  map.forEach((item) => {
    next.push({ ...item, order: next.length + 1 });
  });
  saveCardapioItems(next);
}

export function importFromStock(stockIds: string[], defaultCategory = 'Pratos do Dia'): CardapioItem[] {
  const adminState = getAdminState();
  const stockMap = new Map(adminState.stock.map((s) => [s.id, s]));
  const current = listCardapioItems();
  const currentStockIds = new Set(current.map((i) => i.stockId).filter(Boolean));

  let maxOrder = current.reduce((acc, cur) => Math.max(acc, cur.order), 0);
  const created: CardapioItem[] = [];

  stockIds.forEach((stockId) => {
    if (currentStockIds.has(stockId)) return;
    const stock = stockMap.get(stockId);
    if (!stock) return;

    maxOrder += 1;
    const newItem: CardapioItem = {
      id: uid('PRATO'),
      stockId: stock.id,
      name: stock.name,
      description: stock.sku ? `Código / SKU: ${stock.sku}` : 'Item fresco preparado sob demanda.',
      price: stock.price,
      imageUrl: stock.images?.[0] || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80',
      category: defaultCategory,
      available: stock.qty > 0,
      order: maxOrder,
    };
    created.push(newItem);
  });

  if (created.length > 0) {
    saveCardapioItems([...current, ...created]);
  }
  return created;
}

export function listCardapioCategories(): string[] {
  return loadState().categories;
}

export function addCardapioCategory(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return listCardapioCategories();
  const cats = listCardapioCategories();
  if (!cats.includes(trimmed)) {
    const next = [...cats, trimmed];
    notify();
    return next;
  }
  return cats;
}

export function listReservations(): TableReservation[] {
  return loadState().reservations;
}

export function createReservation(
  input: Omit<TableReservation, 'id' | 'createdAt' | 'status'>,
): TableReservation {
  const reservations = listReservations();
  const newRes: TableReservation = {
    ...input,
    id: uid('RES'),
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };

  // Também integra com a mesa no salão do kitchenOrderStore
  try {
    reserveKitchenTable(input.tableId, {
      guestName: input.guestName,
      time: input.time,
      guests: input.guests,
      phone: input.guestPhone,
    });
  } catch {
    /* fallback sem quebra */
  }

  const next = [newRes, ...reservations];
  localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(next));
  notify();
  return newRes;
}

export function cancelReservation(id: string): void {
  const reservations = listReservations();
  const next = reservations.map((r) => (r.id === id ? { ...r, status: 'cancelled' as const } : r));
  localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(next));
  notify();
}

export function listClientOrders(): CardapioClientOrder[] {
  return loadState().orders;
}

export function getClientOrder(id: string): CardapioClientOrder | null {
  return listClientOrders().find((o) => o.id === id) ?? null;
}

export type SubmitCardapioOrderInput = {
  orderType: CardapioOrderType;
  tableId?: string | null;
  tableLabel?: string | null;
  customerName: string;
  customerPhone?: string;
  deliveryAddress?: string;
  notes?: string;
  items: Array<{
    item: CardapioItem;
    qty: number;
    note?: string;
  }>;
};

export function submitCardapioOrder(input: SubmitCardapioOrderInput): {
  clientOrder: CardapioClientOrder;
  kitchenOrder?: KitchenOrder;
} {
  const config = getCardapioConfig();
  const subtotal = input.items.reduce((acc, line) => acc + line.item.price * line.qty, 0);
  const deliveryFee = input.orderType === 'delivery' ? config.deliveryFee : 0;
  const total = subtotal + deliveryFee;

  let kitchenOrder: KitchenOrder | undefined;

  // Canal correspondente na cozinha
  const channel =
    input.orderType === 'local'
      ? 'mesa'
      : input.orderType === 'delivery'
      ? 'delivery'
      : 'retirada';

  try {
    kitchenOrder = enqueueKitchenOrder({
      channel,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      deliveryAddress: input.deliveryAddress,
      totalAmount: total,
      tableId: input.tableId,
      occupyTable: input.orderType === 'local',
      note: [
        input.notes,
        input.orderType === 'delivery' ? `Endereço: ${input.deliveryAddress}` : null,
        input.orderType === 'retirada' ? 'Retirada no Balcão' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      lines: input.items.map((line) => ({
        name: line.item.name,
        qty: line.qty,
        note: line.note || '',
        detail: `R$ ${line.item.price.toFixed(2)} cada`,
      })),
    });
  } catch (err) {
    console.error('Erro ao despachar para a cozinha:', err);
  }

  const orderNum = kitchenOrder?.senha ? `#${kitchenOrder.senha}` : `#${Math.floor(100 + Math.random() * 900)}`;

  const clientOrder: CardapioClientOrder = {
    id: uid('PED'),
    orderNumber: orderNum,
    kitchenOrderId: kitchenOrder?.id,
    orderType: input.orderType,
    tableId: input.tableId,
    tableLabel: input.tableLabel,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    deliveryAddress: input.deliveryAddress,
    items: input.items.map((i) => ({
      itemId: i.item.id,
      name: i.item.name,
      price: i.item.price,
      qty: i.qty,
      note: i.note,
    })),
    subtotal,
    deliveryFee,
    total,
    notes: input.notes,
    status: 'received',
    createdAt: new Date().toISOString(),
  };

  const currentOrders = listClientOrders();
  localStorage.setItem(ORDERS_KEY, JSON.stringify([clientOrder, ...currentOrders.slice(0, 99)]));
  notify();

  return { clientOrder, kitchenOrder };
}
