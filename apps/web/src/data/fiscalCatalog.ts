/** Catálogo fiscal e de almoxarifado (MVP localStorage). */

import {
  apiCreateKit,
  apiCreateLot,
  apiCreateWarehouse,
  apiCreateWarehouseMove,
  apiListKits,
  apiListLots,
  apiListWarehouseMoves,
  apiListWarehouses,
  apiUpdateKit,
  apiUpdateWarehouse,
  type ApiProductKit,
  type ApiProductLot,
  type ApiWarehouse,
  type ApiWarehouseMove,
} from '../services/erpApi';
import { isNestAuthed } from '../services/nestClient';

const STORAGE_KEY = 'marthi.fiscal.catalog.v1';

export type FiscalClassification = {
  id: string;
  name: string;
  /** Nomenclatura Comum do Mercosul */
  ncm: string;
  /** Código de Situação Tributária ICMS */
  cstIcms: string;
  /** Classificação tributária (reforma / CClasTrib) */
  cClasTrib: string;
  /** Alíquotas e códigos — percentuais em % */
  icmsRate: number;
  ipiCst: string;
  ipiRate: number;
  pisCst: string;
  pisRate: number;
  cofinsCst: string;
  cofinsRate: number;
  /** Reforma tributária */
  ibsRate: number;
  cbsRate: number;
  /** CFOP padrão sugerido na venda */
  defaultCfopId: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CfopCode = {
  id: string;
  code: string;
  description: string;
  /** 1=entrada UF, 2=entrada outra UF, 5=saída UF, 6=saída outra UF… */
  operation: 'in_same' | 'in_other' | 'out_same' | 'out_other' | 'other';
  active: boolean;
};

export type FecpRule = {
  id: string;
  uf: string;
  description: string;
  rate: number;
  active: boolean;
};

export type Warehouse = {
  id: string;
  name: string;
  code: string;
  address: string;
  active: boolean;
};

export type ProductLot = {
  id: string;
  stockId: string;
  stockName: string;
  /** Número do lote (Grupo Rastro NF-e) */
  lotNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  qty: number;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  notes: string;
  createdAt: string;
};

export type ProductKitItem = {
  stockId: string;
  stockName: string;
  qty: number;
};

export type ProductKit = {
  id: string;
  name: string;
  sku: string;
  /** Produto-pai opcional no cadastro */
  parentStockId: string;
  items: ProductKitItem[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WarehouseMoveKind = 'in' | 'out' | 'transfer' | 'adjust';

export type WarehouseMove = {
  id: string;
  kind: WarehouseMoveKind;
  stockId: string;
  stockName: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  lotId: string;
  qty: number;
  description: string;
  at: string;
};

type CatalogState = {
  classifications: FiscalClassification[];
  cfops: CfopCode[];
  fecps: FecpRule[];
  warehouses: Warehouse[];
  lots: ProductLot[];
  kits: ProductKit[];
  moves: WarehouseMove[];
};

export const CFOP_OPERATION_LABEL: Record<CfopCode['operation'], string> = {
  in_same: 'Entrada — mesma UF',
  in_other: 'Entrada — outra UF',
  out_same: 'Saída — mesma UF',
  out_other: 'Saída — outra UF',
  other: 'Outras',
};

export const WAREHOUSE_MOVE_LABEL: Record<WarehouseMoveKind, string> = {
  in: 'Entrada',
  out: 'Saída',
  transfer: 'Transferência',
  adjust: 'Ajuste',
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

function seed(): CatalogState {
  const stamp = now();
  const cfopSale = uid('CFOP');
  const cfopBuy = uid('CFOP');
  const classId = uid('FIS');
  const whMain = uid('WH');
  const whSec = uid('WH');
  return {
    classifications: [
      {
        id: classId,
        name: 'Revenda aparelhos / eletrônicos',
        ncm: '8517.12.31',
        cstIcms: '00',
        cClasTrib: '000001',
        icmsRate: 18,
        ipiCst: '99',
        ipiRate: 0,
        pisCst: '01',
        pisRate: 1.65,
        cofinsCst: '01',
        cofinsRate: 7.6,
        ibsRate: 0,
        cbsRate: 0,
        defaultCfopId: cfopSale,
        notes: 'Modelo inicial — ajustar alíquotas IBS/CBS conforme reforma.',
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: uid('FIS'),
        name: 'Peças e componentes',
        ncm: '8517.70.99',
        cstIcms: '00',
        cClasTrib: '000002',
        icmsRate: 18,
        ipiCst: '99',
        ipiRate: 0,
        pisCst: '01',
        pisRate: 1.65,
        cofinsCst: '01',
        cofinsRate: 7.6,
        ibsRate: 0,
        cbsRate: 0,
        defaultCfopId: cfopSale,
        notes: '',
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    cfops: [
      {
        id: cfopSale,
        code: '5102',
        description: 'Venda de mercadoria adquirida ou recebida de terceiros',
        operation: 'out_same',
        active: true,
      },
      {
        id: cfopBuy,
        code: '1102',
        description: 'Compra para comercialização',
        operation: 'in_same',
        active: true,
      },
      {
        id: uid('CFOP'),
        code: '5405',
        description: 'Venda de mercadoria sujeita ao regime de substituição tributária',
        operation: 'out_same',
        active: true,
      },
    ],
    fecps: [
      {
        id: uid('FECP'),
        uf: 'RJ',
        description: 'FECP RJ — adicional ICMS',
        rate: 2,
        active: true,
      },
      {
        id: uid('FECP'),
        uf: 'RJ',
        description: 'FECP combustíveis (exemplo)',
        rate: 4,
        active: false,
      },
    ],
    warehouses: [
      {
        id: whMain,
        name: 'Almoxarifado principal',
        code: 'ALX-01',
        address: 'Loja · depósito',
        active: true,
      },
      {
        id: whSec,
        name: 'Bancada oficina',
        code: 'ALX-OS',
        address: 'Área técnica',
        active: true,
      },
    ],
    lots: [],
    kits: [],
    moves: [],
  };
}

function load(): CatalogState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seed();
      save(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<CatalogState>;
    return {
      classifications: Array.isArray(parsed.classifications) ? parsed.classifications : [],
      cfops: Array.isArray(parsed.cfops) ? parsed.cfops : [],
      fecps: Array.isArray(parsed.fecps) ? parsed.fecps : [],
      warehouses: Array.isArray(parsed.warehouses) ? parsed.warehouses : [],
      lots: Array.isArray(parsed.lots) ? parsed.lots : [],
      kits: Array.isArray(parsed.kits) ? parsed.kits : [],
      moves: Array.isArray(parsed.moves) ? parsed.moves : [],
    };
  } catch {
    const seeded = seed();
    save(seeded);
    return seeded;
  }
}

function save(state: CatalogState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('marthi-fiscal-updated'));
}

function mapWarehouse(row: ApiWarehouse): Warehouse {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address ?? '',
    active: row.active,
  };
}

function mapLot(row: ApiProductLot): ProductLot {
  return {
    id: row.id,
    stockId: row.stockId,
    stockName: row.stockName,
    lotNumber: row.lotNumber,
    manufacturingDate: row.manufacturingDate ?? '',
    expiryDate: row.expiryDate ?? '',
    qty: row.qty,
    supplierId: row.supplierId ?? '',
    supplierName: row.supplierName ?? '',
    warehouseId: row.warehouseId,
    notes: row.notes ?? '',
    createdAt: row.createdAt,
  };
}

function mapKit(row: ApiProductKit): ProductKit {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku ?? '',
    parentStockId: row.parentStockId ?? '',
    items: (row.items ?? []).map((item) => ({
      stockId: item.stockId,
      stockName: item.stockName,
      qty: item.qty,
    })),
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMove(row: ApiWarehouseMove): WarehouseMove {
  return {
    id: row.id,
    kind: row.kind,
    stockId: row.stockId,
    stockName: row.stockName,
    fromWarehouseId: row.fromWarehouseId ?? '',
    toWarehouseId: row.toWarehouseId ?? '',
    lotId: row.lotId ?? '',
    qty: row.qty,
    description: row.note || row.description || '',
    at: row.at || row.createdAt || now(),
  };
}

function nestError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Substitui fatias de almoxarifado (bootstrap Nest). Fiscal P2 permanece local. */
export function replaceWarehouseCatalog(partial: {
  warehouses?: Warehouse[];
  lots?: ProductLot[];
  kits?: ProductKit[];
  moves?: WarehouseMove[];
}) {
  const state = load();
  save({
    ...state,
    warehouses: partial.warehouses ?? state.warehouses,
    lots: partial.lots ?? state.lots,
    kits: partial.kits ?? state.kits,
    moves: partial.moves ?? state.moves,
  });
}

export async function hydrateWarehouseCatalogFromApi() {
  if (!isNestAuthed()) return;
  const [warehouses, lots, kits, moves] = await Promise.all([
    apiListWarehouses(),
    apiListLots(),
    apiListKits(),
    apiListWarehouseMoves(),
  ]);
  replaceWarehouseCatalog({
    warehouses: warehouses.map(mapWarehouse),
    lots: lots.map(mapLot),
    kits: kits.map(mapKit),
    moves: moves.map(mapMove),
  });
}

export type CatalogResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function listFiscalClassifications(activeOnly = false) {
  const items = load().classifications.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return activeOnly ? items.filter((item) => item.active) : items;
}

export function getFiscalClassification(id: string) {
  return load().classifications.find((item) => item.id === id) ?? null;
}

export function listCfops(activeOnly = false) {
  const items = load().cfops.sort((a, b) => a.code.localeCompare(b.code));
  return activeOnly ? items.filter((item) => item.active) : items;
}

export function listFecps(activeOnly = false) {
  const items = load().fecps.sort((a, b) => a.uf.localeCompare(b.uf));
  return activeOnly ? items.filter((item) => item.active) : items;
}

export function listWarehouses(activeOnly = false) {
  const items = load().warehouses.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return activeOnly ? items.filter((item) => item.active) : items;
}

export function listLots(stockId?: string) {
  const items = load().lots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return stockId ? items.filter((item) => item.stockId === stockId) : items;
}

export function listKits(activeOnly = false) {
  const items = load().kits.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return activeOnly ? items.filter((item) => item.active) : items;
}

export function listWarehouseMoves() {
  return load().moves.sort((a, b) => b.at.localeCompare(a.at));
}

export function upsertFiscalClassification(
  input: Omit<FiscalClassification, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): CatalogResult<FiscalClassification> {
  if (!input.name.trim()) return { ok: false, error: 'Informe o nome da classificação.' };
  if (!input.ncm.trim()) return { ok: false, error: 'Informe o NCM.' };
  const state = load();
  const stamp = now();
  if (input.id) {
    const current = state.classifications.find((item) => item.id === input.id);
    if (!current) return { ok: false, error: 'Classificação não encontrada.' };
    const next: FiscalClassification = {
      ...current,
      ...input,
      id: current.id,
      name: input.name.trim(),
      ncm: input.ncm.trim(),
      updatedAt: stamp,
      createdAt: current.createdAt,
    };
    state.classifications = state.classifications.map((item) =>
      item.id === input.id ? next : item,
    );
    save(state);
    return { ok: true, data: next };
  }
  const created: FiscalClassification = {
    ...input,
    id: uid('FIS'),
    name: input.name.trim(),
    ncm: input.ncm.trim(),
    createdAt: stamp,
    updatedAt: stamp,
  };
  state.classifications = [created, ...state.classifications];
  save(state);
  return { ok: true, data: created };
}

export function upsertCfop(
  input: Omit<CfopCode, 'id'> & { id?: string },
): CatalogResult<CfopCode> {
  if (!input.code.trim()) return { ok: false, error: 'Informe o código CFOP.' };
  const state = load();
  if (input.id) {
    const current = state.cfops.find((item) => item.id === input.id);
    if (!current) return { ok: false, error: 'CFOP não encontrado.' };
    const next: CfopCode = {
      ...current,
      ...input,
      id: current.id,
      code: input.code.trim(),
      description: input.description.trim(),
    };
    state.cfops = state.cfops.map((item) => (item.id === input.id ? next : item));
    save(state);
    return { ok: true, data: next };
  }
  const created: CfopCode = {
    ...input,
    id: uid('CFOP'),
    code: input.code.trim(),
    description: input.description.trim(),
  };
  state.cfops = [created, ...state.cfops];
  save(state);
  return { ok: true, data: created };
}

export function upsertFecp(
  input: Omit<FecpRule, 'id'> & { id?: string },
): CatalogResult<FecpRule> {
  if (!input.uf.trim()) return { ok: false, error: 'Informe a UF.' };
  const state = load();
  if (input.id) {
    const current = state.fecps.find((item) => item.id === input.id);
    if (!current) return { ok: false, error: 'FECP não encontrado.' };
    const next: FecpRule = { ...current, ...input, id: current.id, uf: input.uf.trim().toUpperCase() };
    state.fecps = state.fecps.map((item) => (item.id === input.id ? next : item));
    save(state);
    return { ok: true, data: next };
  }
  const created: FecpRule = {
    ...input,
    id: uid('FECP'),
    uf: input.uf.trim().toUpperCase(),
  };
  state.fecps = [created, ...state.fecps];
  save(state);
  return { ok: true, data: created };
}

export async function upsertWarehouse(
  input: Omit<Warehouse, 'id'> & { id?: string },
): Promise<CatalogResult<Warehouse>> {
  if (!input.name.trim()) return { ok: false, error: 'Informe o nome do almoxarifado.' };

  if (isNestAuthed()) {
    try {
      const body = {
        name: input.name.trim(),
        code: input.code.trim() || uid('ALX'),
        address: input.address.trim(),
        active: input.active,
      };
      const row = input.id
        ? await apiUpdateWarehouse(input.id, body)
        : await apiCreateWarehouse(body);
      const mapped = mapWarehouse(row);
      const state = load();
      const idx = state.warehouses.findIndex((item) => item.id === mapped.id);
      if (idx >= 0) state.warehouses[idx] = mapped;
      else state.warehouses = [mapped, ...state.warehouses];
      save(state);
      return { ok: true, data: mapped };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao salvar almoxarifado.') };
    }
  }

  const state = load();
  if (input.id) {
    const current = state.warehouses.find((item) => item.id === input.id);
    if (!current) return { ok: false, error: 'Almoxarifado não encontrado.' };
    const next: Warehouse = {
      ...current,
      ...input,
      id: current.id,
      name: input.name.trim(),
      code: input.code.trim(),
    };
    state.warehouses = state.warehouses.map((item) => (item.id === input.id ? next : item));
    save(state);
    return { ok: true, data: next };
  }
  const created: Warehouse = {
    ...input,
    id: uid('WH'),
    name: input.name.trim(),
    code: input.code.trim() || uid('ALX'),
  };
  state.warehouses = [created, ...state.warehouses];
  save(state);
  return { ok: true, data: created };
}

export async function createLot(input: {
  stockId: string;
  stockName: string;
  lotNumber: string;
  manufacturingDate?: string;
  expiryDate?: string;
  qty: number;
  supplierId?: string;
  supplierName?: string;
  warehouseId: string;
  notes?: string;
}): Promise<CatalogResult<ProductLot>> {
  if (!input.lotNumber.trim()) return { ok: false, error: 'Informe o número do lote.' };
  if (!Number.isFinite(input.qty) || input.qty <= 0) return { ok: false, error: 'Quantidade inválida.' };

  if (isNestAuthed()) {
    try {
      const row = await apiCreateLot({
        stockId: input.stockId,
        stockName: input.stockName,
        lotNumber: input.lotNumber.trim(),
        manufacturingDate: input.manufacturingDate,
        expiryDate: input.expiryDate,
        qty: input.qty,
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        warehouseId: input.warehouseId,
        notes: input.notes,
      });
      const mapped = mapLot(row);
      const state = load();
      state.lots = [mapped, ...state.lots.filter((item) => item.id !== mapped.id)];
      save(state);
      return { ok: true, data: mapped };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao registrar lote.') };
    }
  }

  const state = load();
  if (!state.warehouses.some((item) => item.id === input.warehouseId)) {
    return { ok: false, error: 'Almoxarifado inválido.' };
  }
  const lot: ProductLot = {
    id: uid('LOT'),
    stockId: input.stockId,
    stockName: input.stockName,
    lotNumber: input.lotNumber.trim(),
    manufacturingDate: input.manufacturingDate ?? '',
    expiryDate: input.expiryDate ?? '',
    qty: input.qty,
    supplierId: input.supplierId ?? '',
    supplierName: (input.supplierName ?? '').trim(),
    warehouseId: input.warehouseId,
    notes: (input.notes ?? '').trim(),
    createdAt: now(),
  };
  state.lots = [lot, ...state.lots];
  save(state);
  return { ok: true, data: lot };
}

export async function upsertKit(input: {
  id?: string;
  name: string;
  sku: string;
  parentStockId?: string;
  items: ProductKitItem[];
  active: boolean;
}): Promise<CatalogResult<ProductKit>> {
  if (!input.name.trim()) return { ok: false, error: 'Informe o nome do kit.' };
  if (input.items.length === 0) return { ok: false, error: 'Adicione ao menos um item no kit.' };

  if (isNestAuthed()) {
    try {
      const body = {
        name: input.name.trim(),
        sku: input.sku.trim(),
        parentStockId: input.parentStockId || undefined,
        items: input.items,
        active: input.active,
      };
      const row = input.id ? await apiUpdateKit(input.id, body) : await apiCreateKit(body);
      const mapped = mapKit(row);
      const state = load();
      const idx = state.kits.findIndex((item) => item.id === mapped.id);
      if (idx >= 0) state.kits[idx] = mapped;
      else state.kits = [mapped, ...state.kits];
      save(state);
      return { ok: true, data: mapped };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao salvar kit.') };
    }
  }

  const state = load();
  const stamp = now();
  if (input.id) {
    const current = state.kits.find((item) => item.id === input.id);
    if (!current) return { ok: false, error: 'Kit não encontrado.' };
    const next: ProductKit = {
      ...current,
      name: input.name.trim(),
      sku: input.sku.trim(),
      parentStockId: input.parentStockId ?? '',
      items: input.items,
      active: input.active,
      updatedAt: stamp,
    };
    state.kits = state.kits.map((item) => (item.id === input.id ? next : item));
    save(state);
    return { ok: true, data: next };
  }
  const created: ProductKit = {
    id: uid('KIT'),
    name: input.name.trim(),
    sku: input.sku.trim(),
    parentStockId: input.parentStockId ?? '',
    items: input.items,
    active: input.active,
    createdAt: stamp,
    updatedAt: stamp,
  };
  state.kits = [created, ...state.kits];
  save(state);
  return { ok: true, data: created };
}

export async function createWarehouseMove(input: {
  kind: WarehouseMoveKind;
  stockId: string;
  stockName: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  lotId?: string;
  qty: number;
  description?: string;
}): Promise<CatalogResult<WarehouseMove>> {
  if (!Number.isFinite(input.qty) || input.qty <= 0) return { ok: false, error: 'Quantidade inválida.' };

  if (isNestAuthed()) {
    try {
      const row = await apiCreateWarehouseMove({
        kind: input.kind,
        stockId: input.stockId,
        fromWarehouseId: input.fromWarehouseId || undefined,
        toWarehouseId: input.toWarehouseId || undefined,
        lotId: input.lotId || undefined,
        qty: input.qty,
        description: (input.description ?? '').trim() || WAREHOUSE_MOVE_LABEL[input.kind],
      });
      const mapped = mapMove(row);
      const state = load();
      state.moves = [mapped, ...state.moves.filter((item) => item.id !== mapped.id)];
      save(state);
      return { ok: true, data: mapped };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao registrar movimento.') };
    }
  }

  const move: WarehouseMove = {
    id: uid('WM'),
    kind: input.kind,
    stockId: input.stockId,
    stockName: input.stockName,
    fromWarehouseId: input.fromWarehouseId ?? '',
    toWarehouseId: input.toWarehouseId ?? '',
    lotId: input.lotId ?? '',
    qty: input.qty,
    description: (input.description ?? '').trim() || WAREHOUSE_MOVE_LABEL[input.kind],
    at: now(),
  };
  const state = load();
  state.moves = [move, ...state.moves];
  save(state);
  return { ok: true, data: move };
}
