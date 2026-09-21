import {
  getAdminState,
  getStockItem,
  saveStock,
  type StockItem,
} from './adminStore';

const STORAGE_KEY = 'marthi.stock.movements.v1';
export const STOCK_MOVEMENTS_EVENT = 'marthi-stock-movements';

export type StockMoveType =
  | 'purchase'
  | 'sale'
  | 'os'
  | 'return'
  | 'adjust'
  | 'transfer'
  | 'entry'
  | 'exit';

export const STOCK_MOVE_LABEL: Record<StockMoveType, string> = {
  purchase: 'Compra / entrada',
  sale: 'Venda',
  os: 'Ordem de serviço',
  return: 'Devolução / estorno',
  adjust: 'Ajuste / inventário',
  transfer: 'Transferência',
  entry: 'Entrada manual',
  exit: 'Saída manual',
};

export type StockMovement = {
  id: string;
  stockId: string;
  stockName: string;
  sku: string;
  type: StockMoveType;
  /** Sempre positivo. */
  qty: number;
  /** +1 entrada, -1 saída. */
  direction: 1 | -1;
  unitCost: number;
  balanceAfter: number;
  note: string;
  refId?: string;
  warehouseId?: string;
  createdAt: string;
};

export type StockBalanceStatus = 'ok' | 'low' | 'over' | 'empty';

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function loadMovements(): StockMovement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StockMovement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMovements(items: StockMovement[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 2000)));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STOCK_MOVEMENTS_EVENT));
  }
}

export function listStockMovements(limit = 200, stockId?: string) {
  const all = loadMovements();
  const filtered = stockId ? all.filter((item) => item.stockId === stockId) : all;
  return filtered.slice(0, limit);
}

export function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function roundPct(value: number) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

/** Markup sobre o custo: (preço − custo) / custo. */
export function stockMarkup(item: Pick<StockItem, 'price' | 'avgCost' | 'cost'>) {
  const cost = item.avgCost || item.cost || 0;
  if (cost <= 0) return 0;
  return roundPct(((item.price - cost) / cost) * 100);
}

/** Margem sobre o preço: (preço − custo) / preço. */
export function stockMargin(item: Pick<StockItem, 'price' | 'avgCost' | 'cost'>) {
  if (item.price <= 0) return 0;
  const cost = item.avgCost || item.cost || 0;
  return roundPct(((item.price - cost) / item.price) * 100);
}

export function stockCostBase(item: Pick<StockItem, 'avgCost' | 'cost'>) {
  return item.avgCost || item.cost || 0;
}

export function stockBalanceStatus(item: Pick<StockItem, 'qty' | 'minQty' | 'maxQty'>): StockBalanceStatus {
  if (item.qty <= 0) return 'empty';
  if (item.qty <= item.minQty) return 'low';
  if (item.maxQty > 0 && item.qty >= item.maxQty) return 'over';
  return 'ok';
}

export const STOCK_BALANCE_LABEL: Record<StockBalanceStatus, string> = {
  ok: 'OK',
  low: 'Abaixo do mínimo',
  over: 'Acima do máximo',
  empty: 'Zerado',
};

export function stockInventoryValue(item: Pick<StockItem, 'qty' | 'avgCost' | 'cost'>) {
  return roundMoney(item.qty * stockCostBase(item));
}

export function stockRetailValue(item: Pick<StockItem, 'qty' | 'price'>) {
  return roundMoney(item.qty * item.price);
}

function applyWeightedAvgCost(item: StockItem, inQty: number, unitCost: number) {
  const cost = Math.max(0, unitCost);
  const qtyIn = Math.max(0, inQty);
  if (qtyIn <= 0) return item;
  const oldQty = Math.max(0, item.qty);
  const newQty = oldQty + qtyIn;
  const prevAvg = item.avgCost || item.cost || 0;
  const avgCost =
    newQty > 0 ? roundMoney((prevAvg * oldQty + cost * qtyIn) / newQty) : prevAvg;
  return {
    ...item,
    avgCost,
    cost,
    lastPurchaseCost: cost,
    lastPurchaseAt: new Date().toISOString(),
  };
}

export type ApplyStockMovementInput = {
  stockId: string;
  type: StockMoveType;
  qty: number;
  direction: 1 | -1;
  unitCost?: number;
  note?: string;
  refId?: string;
  warehouseId?: string;
  /** Se true, não recalcula custo médio (saídas / ajustes sem compra). */
  skipAvgCost?: boolean;
};

export function applyStockMovement(
  input: ApplyStockMovementInput,
): { ok: true; item: StockItem; movement: StockMovement } | { ok: false; error: string } {
  const qty = Math.abs(Math.floor(Number(input.qty) || 0));
  if (qty <= 0) return { ok: false, error: 'Quantidade inválida.' };

  const state = getAdminState();
  const index = state.stock.findIndex((item) => item.id === input.stockId);
  if (index < 0) return { ok: false, error: 'Produto não encontrado no estoque.' };

  let item = { ...state.stock[index] };
  const signed = input.direction * qty;
  const nextQty = item.qty + signed;
  if (nextQty < 0) {
    return { ok: false, error: `Estoque insuficiente (${item.qty} disponível).` };
  }

  const unitCost = input.unitCost ?? stockCostBase(item);
  const isPurchaseLike =
    !input.skipAvgCost &&
    input.direction === 1 &&
    (input.type === 'purchase' || input.type === 'entry' || input.type === 'return');

  if (isPurchaseLike && unitCost > 0) {
    item = applyWeightedAvgCost(item, qty, unitCost);
  }

  item = { ...item, qty: nextQty };
  const nextStock = state.stock.map((row, i) => (i === index ? item : row));
  saveStock(nextStock);

  const movement: StockMovement = {
    id: uid('MOV'),
    stockId: item.id,
    stockName: item.name,
    sku: item.sku,
    type: input.type,
    qty,
    direction: input.direction,
    unitCost: roundMoney(unitCost),
    balanceAfter: nextQty,
    note: (input.note ?? '').trim(),
    refId: input.refId,
    warehouseId: input.warehouseId ?? item.warehouseId,
    createdAt: new Date().toISOString(),
  };

  const movements = loadMovements();
  movements.unshift(movement);
  saveMovements(movements);

  return { ok: true, item, movement };
}

/** Ajuste absoluto de inventário (define a quantidade alvo). */
export function setStockQtyAbsolute(
  stockId: string,
  targetQty: number,
  note = 'Ajuste de inventário',
): { ok: true; item: StockItem; movement: StockMovement } | { ok: false; error: string } {
  const item = getStockItem(stockId);
  if (!item) return { ok: false, error: 'Produto não encontrado no estoque.' };
  const target = Math.max(0, Math.floor(Number(targetQty) || 0));
  const delta = target - item.qty;
  if (delta === 0) {
    return {
      ok: false,
      error: 'Quantidade já está no valor informado.',
    };
  }
  return applyStockMovement({
    stockId,
    type: 'adjust',
    qty: Math.abs(delta),
    direction: delta > 0 ? 1 : -1,
    unitCost: stockCostBase(item),
    note,
    skipAvgCost: true,
  });
}

/** Registra movimentos depois que a quantidade já foi alterada (ex.: PDV). */
export function logStockMovements(
  rows: Array<{
    stockId: string;
    stockName: string;
    sku: string;
    type: StockMoveType;
    qty: number;
    direction: 1 | -1;
    unitCost: number;
    balanceAfter: number;
    note?: string;
    refId?: string;
    warehouseId?: string;
  }>,
) {
  if (!rows.length) return;
  const movements = loadMovements();
  for (const row of rows) {
    const qty = Math.abs(Math.floor(row.qty) || 0);
    if (qty <= 0) continue;
    movements.unshift({
      id: uid('MOV'),
      stockId: row.stockId,
      stockName: row.stockName,
      sku: row.sku,
      type: row.type,
      qty,
      direction: row.direction,
      unitCost: roundMoney(row.unitCost),
      balanceAfter: Math.max(0, row.balanceAfter),
      note: (row.note ?? '').trim(),
      refId: row.refId,
      warehouseId: row.warehouseId,
      createdAt: new Date().toISOString(),
    });
  }
  saveMovements(movements);
}

export function stockBalanceSnapshot(stock = getAdminState().stock) {
  const low = stock.filter((item) => stockBalanceStatus(item) === 'low').length;
  const over = stock.filter((item) => stockBalanceStatus(item) === 'over').length;
  const empty = stock.filter((item) => stockBalanceStatus(item) === 'empty').length;
  const inventory = roundMoney(stock.reduce((sum, item) => sum + stockInventoryValue(item), 0));
  const retail = roundMoney(stock.reduce((sum, item) => sum + stockRetailValue(item), 0));
  return {
    skus: stock.length,
    units: stock.reduce((sum, item) => sum + item.qty, 0),
    low,
    over,
    empty,
    inventory,
    retail,
    potentialMargin: roundMoney(retail - inventory),
  };
}
