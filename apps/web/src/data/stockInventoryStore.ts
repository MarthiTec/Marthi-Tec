import * as XLSX from 'xlsx';
import { getAdminState, adjustStockQty, type StockItem } from './adminStore';
import { logStockMovements } from './stockLedger';

export type StockBalanceStatus = 'in_progress' | 'completed' | 'cancelled';
export type CountSource = 'barcode' | 'manual' | 'collector' | 'txt' | 'excel';
export type SyncState = 'synced' | 'pending' | 'offline' | 'error';
export type DuplicateRule = 'sum' | 'overwrite';

export const STOCK_INVENTORY_EVENT = 'marthi-stock-inventory-updated';

const ACTIVE_STORAGE_KEY = 'marthi.stock.balance.active.v1';
const HISTORY_STORAGE_KEY = 'marthi.stock.balances.history.v1';
const IDB_NAME = 'marthi_stock_inventory_db';
const IDB_VERSION = 1;
const IDB_STORE_BALANCES = 'balances';

export type CountEntry = {
  id: string;
  timestamp: string;
  qty: number;
  source: CountSource;
  user: string;
  note?: string;
};

export type StockBalanceItem = {
  stockId: string;
  name: string;
  sku: string;
  barcode: string;
  imei: string;
  color?: string;
  capacity?: string;
  unit: string;
  cost: number;
  avgCost: number;
  price: number;
  systemQty: number;
  countedQty: number | null;
  difference: number;
  status: 'pending' | 'ok' | 'divergent_pos' | 'divergent_neg';
  entries: CountEntry[];
  lastCountedAt?: string;
  lastSource?: CountSource;
  note?: string;
};

export type StockBalanceAudit = {
  id: string;
  code: string;
  title: string;
  status: StockBalanceStatus;
  responsibleUser: string;
  warehouseId?: string;
  warehouseName: string;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
  durationSeconds: number;
  notes?: string;
  duplicateRule: DuplicateRule;

  // Cached summary counters
  totalItems: number;
  countedItems: number;
  pendingItems: number;
  okItems: number;
  divergentItems: number;
  systemTotalUnits: number;
  countedTotalUnits: number;
  divergentPositiveUnits: number;
  divergentNegativeUnits: number;

  adjustmentAppliedAt?: string;
  adjustmentUser?: string;

  syncState: SyncState;
  lastSyncedAt?: string;

  items: Record<string, StockBalanceItem>;
};

let memoryActiveBalance: StockBalanceAudit | null = null;
let memoryHistory: StockBalanceAudit[] = [];
const idbSupported = typeof window !== 'undefined' && 'indexedDB' in window;

function uid(prefix = 'ENTRY') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

// Web Audio API feedback for barcode scanner and collector gun
export function playInventoryBeep(type: 'ok' | 'error' | 'warning' = 'ok') {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'ok') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    }
  } catch {
    // audio fallback
  }
}

// IndexedDB Helper
function openIdb(): Promise<IDBDatabase | null> {
  if (!idbSupported) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE_BALANCES)) {
          db.createObjectStore(IDB_STORE_BALANCES, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function persistToIdb(balance: StockBalanceAudit) {
  try {
    const db = await openIdb();
    if (!db) return;
    const tx = db.transaction(IDB_STORE_BALANCES, 'readwrite');
    const store = tx.objectStore(IDB_STORE_BALANCES);
    store.put(balance);
  } catch {
    // fallback to localStorage
  }
}

async function deleteFromIdb(id: string) {
  try {
    const db = await openIdb();
    if (!db) return;
    const tx = db.transaction(IDB_STORE_BALANCES, 'readwrite');
    tx.objectStore(IDB_STORE_BALANCES).delete(id);
  } catch {
    // ignore
  }
}

export function recalculateBalanceMetrics(audit: StockBalanceAudit): StockBalanceAudit {
  const itemsList = Object.values(audit.items);
  const totalItems = itemsList.length;
  let countedItems = 0;
  let pendingItems = 0;
  let okItems = 0;
  let divergentItems = 0;
  let systemTotalUnits = 0;
  let countedTotalUnits = 0;
  let divergentPositiveUnits = 0;
  let divergentNegativeUnits = 0;

  for (const item of itemsList) {
    systemTotalUnits += item.systemQty;

    if (item.countedQty === null) {
      pendingItems++;
      item.status = 'pending';
      item.difference = 0;
    } else {
      countedItems++;
      countedTotalUnits += item.countedQty;
      const diff = item.countedQty - item.systemQty;
      item.difference = diff;
      if (diff === 0) {
        okItems++;
        item.status = 'ok';
      } else if (diff > 0) {
        divergentItems++;
        divergentPositiveUnits += diff;
        item.status = 'divergent_pos';
      } else {
        divergentItems++;
        divergentNegativeUnits += Math.abs(diff);
        item.status = 'divergent_neg';
      }
    }
  }

  let durationSeconds = audit.durationSeconds || 0;
  if (audit.startedAt) {
    const startMs = new Date(audit.startedAt).getTime();
    const endMs = audit.completedAt ? new Date(audit.completedAt).getTime() : Date.now();
    if (!Number.isNaN(startMs) && endMs > startMs) {
      durationSeconds = Math.floor((endMs - startMs) / 1000);
    }
  }

  audit.totalItems = totalItems;
  audit.countedItems = countedItems;
  audit.pendingItems = pendingItems;
  audit.okItems = okItems;
  audit.divergentItems = divergentItems;
  audit.systemTotalUnits = systemTotalUnits;
  audit.countedTotalUnits = countedTotalUnits;
  audit.divergentPositiveUnits = divergentPositiveUnits;
  audit.divergentNegativeUnits = divergentNegativeUnits;
  audit.durationSeconds = durationSeconds;
  audit.updatedAt = new Date().toISOString();

  return audit;
}

function saveActiveBalance(balance: StockBalanceAudit | null) {
  memoryActiveBalance = balance;
  try {
    if (typeof window !== 'undefined') {
      if (balance) {
        localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(balance));
      } else {
        localStorage.removeItem(ACTIVE_STORAGE_KEY);
      }
      window.dispatchEvent(new Event(STOCK_INVENTORY_EVENT));
    }
  } catch (err) {
    console.error('Falha ao salvar balanço ativo no localStorage:', err);
  }

  if (balance) {
    void persistToIdb(balance);
  }
}

function saveHistory(history: StockBalanceAudit[]) {
  memoryHistory = history;
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 100)));
      window.dispatchEvent(new Event(STOCK_INVENTORY_EVENT));
    }
  } catch (err) {
    console.error('Falha ao salvar histórico no localStorage:', err);
  }
}

export function listStockBalances(): StockBalanceAudit[] {
  if (memoryHistory.length > 0) return memoryHistory;
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryHistory = parsed;
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return [];
}

export function getActiveStockBalance(): StockBalanceAudit | null {
  if (memoryActiveBalance && memoryActiveBalance.status === 'in_progress') {
    return memoryActiveBalance;
  }
  try {
    const raw = localStorage.getItem(ACTIVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StockBalanceAudit;
      if (parsed && parsed.status === 'in_progress') {
        memoryActiveBalance = recalculateBalanceMetrics(parsed);
        return memoryActiveBalance;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar balanço ativo do storage:', err);
  }
  return null;
}

export function getStockBalance(id: string): StockBalanceAudit | null {
  const active = getActiveStockBalance();
  if (active && active.id === id) return active;
  const history = listStockBalances();
  return history.find((b) => b.id === id) || null;
}

export function createStockBalance(options: {
  responsibleUser: string;
  warehouseId?: string;
  warehouseName?: string;
  title?: string;
  notes?: string;
  duplicateRule?: DuplicateRule;
  preselectedStockItems?: StockItem[];
}): StockBalanceAudit {
  const existing = getActiveStockBalance();
  if (existing && existing.status === 'in_progress') {
    const hist = listStockBalances().filter((b) => b.id !== existing.id);
    saveHistory([existing, ...hist]);
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randSeq = Math.floor(1000 + Math.random() * 9000);
  const id = `BAL-${dateStr}-${randSeq}`;
  const code = `#${randSeq}`;

  const state = getAdminState();
  const stockList = options.preselectedStockItems || state.stock || [];

  const itemsMap: Record<string, StockBalanceItem> = {};
  for (const item of stockList) {
    itemsMap[item.id] = {
      stockId: item.id,
      name: item.name,
      sku: item.sku || '',
      barcode: item.barcode || '',
      imei: item.imei || '',
      color: item.color,
      capacity: item.capacity,
      unit: item.unit || 'UN',
      cost: Number(item.cost) || 0,
      avgCost: Number(item.avgCost) || Number(item.cost) || 0,
      price: Number(item.price) || 0,
      systemQty: Math.max(0, Number(item.qty) || 0),
      countedQty: null,
      difference: 0,
      status: 'pending',
      entries: [],
    };
  }

  const newAudit: StockBalanceAudit = {
    id,
    code,
    title: options.title || `Balanço de Estoque ${code}`,
    status: 'in_progress',
    responsibleUser: options.responsibleUser || 'Operador',
    warehouseId: options.warehouseId || '',
    warehouseName: options.warehouseName || 'Loja / Estoque Principal',
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    durationSeconds: 0,
    notes: options.notes || '',
    duplicateRule: options.duplicateRule || 'sum',
    totalItems: stockList.length,
    countedItems: 0,
    pendingItems: stockList.length,
    okItems: 0,
    divergentItems: 0,
    systemTotalUnits: 0,
    countedTotalUnits: 0,
    divergentPositiveUnits: 0,
    divergentNegativeUnits: 0,
    syncState: navigator.onLine ? 'synced' : 'offline',
    lastSyncedAt: now.toISOString(),
    items: itemsMap,
  };

  const calculated = recalculateBalanceMetrics(newAudit);
  saveActiveBalance(calculated);
  return calculated;
}

export function findItemInBalance(
  balance: StockBalanceAudit,
  code: string,
): StockBalanceItem | null {
  const clean = code.trim().toLowerCase();
  if (!clean) return null;

  const items = Object.values(balance.items);

  // 1. Barcode exact
  const byBarcode = items.find((i) => i.barcode && i.barcode.toLowerCase() === clean);
  if (byBarcode) return byBarcode;

  // 2. SKU exact
  const bySku = items.find((i) => i.sku && i.sku.toLowerCase() === clean);
  if (bySku) return bySku;

  // 3. IMEI exact
  const byImei = items.find((i) => i.imei && i.imei.toLowerCase() === clean);
  if (byImei) return byImei;

  // 4. stockId exact
  const byId = items.find((i) => i.stockId.toLowerCase() === clean);
  if (byId) return byId;

  // 5. Numeric cleaned match
  const cleanDigits = clean.replace(/\D/g, '');
  if (cleanDigits.length >= 3) {
    const byDigits = items.find(
      (i) =>
        i.sku.toLowerCase().replace(/\D/g, '') === cleanDigits ||
        i.barcode.toLowerCase().replace(/\D/g, '') === cleanDigits,
    );
    if (byDigits) return byDigits;
  }

  // 6. Name match if exact
  const byName = items.find((i) => i.name.trim().toLowerCase() === clean);
  if (byName) return byName;

  return null;
}

export function recordCount(
  balanceId: string,
  params: {
    codeOrId: string;
    qty: number;
    source: CountSource;
    user?: string;
    note?: string;
    mode?: 'add' | 'set';
  },
): {
  ok: boolean;
  item?: StockBalanceItem;
  balance?: StockBalanceAudit;
  error?: string;
} {
  const active = getActiveStockBalance();
  if (!active || active.id !== balanceId) {
    return { ok: false, error: 'Balanço não encontrado ou não está em andamento.' };
  }
  if (active.status !== 'in_progress') {
    return { ok: false, error: 'Este balanço já foi finalizado ou cancelado.' };
  }

  const target = findItemInBalance(active, params.codeOrId);
  if (!target) {
    playInventoryBeep('error');
    return {
      ok: false,
      error: `Produto com código "${params.codeOrId}" não foi localizado no estoque.`,
    };
  }

  const countDelta = Number(params.qty) || 1;
  const currentCount = target.countedQty === null ? 0 : target.countedQty;
  const newCount = params.mode === 'set' ? countDelta : currentCount + countDelta;

  const entry: CountEntry = {
    id: uid('CNT'),
    timestamp: new Date().toISOString(),
    qty: countDelta,
    source: params.source,
    user: params.user || active.responsibleUser,
    note: params.note,
  };

  target.countedQty = Math.max(0, newCount);
  target.entries.unshift(entry);
  target.lastCountedAt = entry.timestamp;
  target.lastSource = params.source;

  recalculateBalanceMetrics(active);
  saveActiveBalance(active);
  playInventoryBeep('ok');

  return { ok: true, item: target, balance: active };
}

export function recordBatchCounts(
  balanceId: string,
  entries: Array<{
    code: string;
    qty: number;
    source: 'txt' | 'excel';
    user?: string;
    note?: string;
  }>,
  rule: DuplicateRule = 'sum',
): {
  ok: boolean;
  importedCount: number;
  unmatchedCount: number;
  balance?: StockBalanceAudit;
  error?: string;
} {
  const active = getActiveStockBalance();
  if (!active || active.id !== balanceId) {
    return { ok: false, importedCount: 0, unmatchedCount: 0, error: 'Balanço não está em andamento.' };
  }

  let imported = 0;
  let unmatched = 0;

  for (const entry of entries) {
    const target = findItemInBalance(active, entry.code);
    if (!target) {
      unmatched++;
      continue;
    }

    const qty = Number(entry.qty) || 0;
    if (qty <= 0) continue;

    const countLog: CountEntry = {
      id: uid('BATCH'),
      timestamp: new Date().toISOString(),
      qty,
      source: entry.source,
      user: entry.user || active.responsibleUser,
      note: entry.note || `Importação ${entry.source.toUpperCase()}`,
    };

    if (rule === 'overwrite' || target.countedQty === null) {
      target.countedQty = qty;
    } else {
      target.countedQty = (target.countedQty || 0) + qty;
    }

    target.entries.unshift(countLog);
    target.lastCountedAt = countLog.timestamp;
    target.lastSource = entry.source;
    imported++;
  }

  recalculateBalanceMetrics(active);
  saveActiveBalance(active);

  return { ok: true, importedCount: imported, unmatchedCount: unmatched, balance: active };
}

export function setDirectCount(
  balanceId: string,
  stockId: string,
  countedQty: number | null,
  note = 'Edição manual',
  user = 'Operador',
): StockBalanceAudit | null {
  const active = getActiveStockBalance();
  if (!active || active.id !== balanceId) return null;

  const item = active.items[stockId];
  if (!item) return null;

  if (countedQty === null) {
    item.countedQty = null;
    item.status = 'pending';
    item.difference = 0;
  } else {
    const val = Math.max(0, Number(countedQty) || 0);
    item.countedQty = val;
    item.entries.unshift({
      id: uid('DIRECT'),
      timestamp: new Date().toISOString(),
      qty: val,
      source: 'manual',
      user,
      note,
    });
    item.lastCountedAt = new Date().toISOString();
    item.lastSource = 'manual';
  }

  recalculateBalanceMetrics(active);
  saveActiveBalance(active);
  return active;
}

export function finalizeStockBalance(balanceId: string, notes?: string): StockBalanceAudit | null {
  const active = getActiveStockBalance();
  if (!active || active.id !== balanceId) return null;

  active.status = 'completed';
  active.completedAt = new Date().toISOString();
  if (notes) active.notes = notes;

  recalculateBalanceMetrics(active);

  const history = listStockBalances().filter((b) => b.id !== active.id);
  const updatedHistory = [active, ...history];
  saveHistory(updatedHistory);
  saveActiveBalance(null);

  return active;
}

export function cancelStockBalance(balanceId: string, reason?: string): StockBalanceAudit | null {
  const active = getActiveStockBalance();
  if (!active || active.id !== balanceId) return null;

  active.status = 'cancelled';
  active.completedAt = new Date().toISOString();
  if (reason) active.notes = (active.notes ? active.notes + ' · ' : '') + 'Cancelado: ' + reason;

  recalculateBalanceMetrics(active);

  const history = listStockBalances().filter((b) => b.id !== active.id);
  saveHistory([active, ...history]);
  saveActiveBalance(null);

  return active;
}

export function reopenStockBalance(balanceId: string): StockBalanceAudit | null {
  const currentActive = getActiveStockBalance();
  if (currentActive && currentActive.status === 'in_progress') {
    return null;
  }

  const history = listStockBalances();
  const target = history.find((b) => b.id === balanceId);
  if (!target) return null;

  target.status = 'in_progress';
  target.completedAt = undefined;
  recalculateBalanceMetrics(target);

  const remainingHistory = history.filter((b) => b.id !== balanceId);
  saveHistory(remainingHistory);
  saveActiveBalance(target);

  return target;
}

export function applyStockAdjustment(
  balanceId: string,
  operator = 'Operador',
): {
  ok: boolean;
  adjustedItemsCount: number;
  totalUnitsDelta: number;
  error?: string;
} {
  const balance = getStockBalance(balanceId);
  if (!balance) return { ok: false, adjustedItemsCount: 0, totalUnitsDelta: 0, error: 'Balanço não encontrado.' };

  const items = Object.values(balance.items).filter(
    (i) => i.countedQty !== null && i.difference !== 0,
  );

  if (items.length === 0) {
    return { ok: true, adjustedItemsCount: 0, totalUnitsDelta: 0 };
  }

  let totalDelta = 0;
  const movementsToLog = [];

  for (const item of items) {
    const delta = item.difference;
    totalDelta += delta;
    adjustStockQty(item.stockId, delta);

    movementsToLog.push({
      stockId: item.stockId,
      stockName: item.name,
      sku: item.sku,
      type: 'adjust' as const,
      qty: Math.abs(delta),
      direction: (delta >= 0 ? 1 : -1) as 1 | -1,
      unitCost: item.avgCost || item.cost,
      balanceAfter: item.countedQty ?? item.systemQty,
      note: `Balanço de estoque ${balance.code} (${delta >= 0 ? '+' : ''}${delta} ${item.unit})`,
      warehouseId: balance.warehouseId,
    });
  }

  if (movementsToLog.length > 0) {
    logStockMovements(movementsToLog);
  }

  balance.adjustmentAppliedAt = new Date().toISOString();
  balance.adjustmentUser = operator;
  balance.updatedAt = new Date().toISOString();

  if (memoryActiveBalance && memoryActiveBalance.id === balance.id) {
    saveActiveBalance(balance);
  } else {
    const hist = listStockBalances().map((b) => (b.id === balance.id ? balance : b));
    saveHistory(hist);
  }

  return { ok: true, adjustedItemsCount: items.length, totalUnitsDelta: totalDelta };
}

export function deleteStockBalance(balanceId: string) {
  const active = getActiveStockBalance();
  if (active && active.id === balanceId) {
    saveActiveBalance(null);
  }
  const hist = listStockBalances().filter((b) => b.id !== balanceId);
  saveHistory(hist);
  void deleteFromIdb(balanceId);
}

export function duplicateStockBalance(
  balanceId: string,
  operator = 'Operador',
): StockBalanceAudit | null {
  const source = getStockBalance(balanceId);
  if (!source) return null;

  return createStockBalance({
    responsibleUser: operator,
    warehouseId: source.warehouseId,
    warehouseName: source.warehouseName,
    title: `Cópia de ${source.title}`,
    duplicateRule: source.duplicateRule,
  });
}

export function updateStockBalanceMetadata(
  balanceId: string,
  data: { title?: string; notes?: string },
): StockBalanceAudit | null {
  const active = getActiveStockBalance();
  if (active && active.id === balanceId) {
    if (data.title !== undefined) active.title = data.title;
    if (data.notes !== undefined) active.notes = data.notes;
    active.updatedAt = new Date().toISOString();
    saveActiveBalance(active);
    return active;
  }
  const history = listStockBalances();
  const target = history.find((b) => b.id === balanceId);
  if (!target) return null;
  if (data.title !== undefined) target.title = data.title;
  if (data.notes !== undefined) target.notes = data.notes;
  target.updatedAt = new Date().toISOString();
  saveHistory(history.map((b) => (b.id === balanceId ? target : b)));
  return target;
}


export function parseTxtContent(content: string, delimiter: string) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: Array<{ code: string; qty: number; line: number; raw: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') || line.startsWith('//')) continue;

    let parts: string[] = [];
    if (delimiter === '\\t' || delimiter === 'tab' || delimiter === '\t') {
      parts = line.split(/\t+/);
    } else {
      parts = line.split(delimiter);
    }

    if (parts.length >= 2) {
      const code = parts[0].trim();
      const qtyStr = parts[1].trim().replace(',', '.');
      const qty = parseFloat(qtyStr);
      if (code) {
        rows.push({ code, qty: Number.isFinite(qty) ? qty : 0, line: i + 1, raw: line });
      }
    }
  }

  return rows;
}

export function parseExcelBuffer(buffer: ArrayBuffer | Uint8Array) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetNames = wb.SheetNames;
  const sheetsData: Record<string, unknown[][]> = {};

  for (const name of sheetNames) {
    const sheet = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    sheetsData[name] = raw;
  }

  return { sheetNames, sheetsData };
}

export type ImportValidationReport = {
  totalRows: number;
  matchedRows: Array<{ line: number; code: string; qty: number; item: StockBalanceItem }>;
  unmatchedRows: Array<{ line: number; code: string; qty: number; reason: string }>;
  invalidQtyRows: Array<{ line: number; code: string; rawQty: number; reason: string }>;
  duplicateSummary: Array<{ code: string; occurrences: number; totalQty: number; item: StockBalanceItem }>;
  uniqueMatchedItemsCount: number;
  totalUnitsToImport: number;
};

export function validateImportRows(
  balance: StockBalanceAudit,
  rows: Array<{ code: string; qty: number; line: number }>,
): ImportValidationReport {
  const matchedRows: ImportValidationReport['matchedRows'] = [];
  const unmatchedRows: ImportValidationReport['unmatchedRows'] = [];
  const invalidQtyRows: ImportValidationReport['invalidQtyRows'] = [];
  const codeOccurrences: Record<string, { code: string; occurrences: number; totalQty: number; item: StockBalanceItem }> = {};

  for (const row of rows) {
    if (!row.code) {
      unmatchedRows.push({ line: row.line, code: '', qty: row.qty, reason: 'Código em branco' });
      continue;
    }

    if (row.qty <= 0 || !Number.isFinite(row.qty)) {
      invalidQtyRows.push({
        line: row.line,
        code: row.code,
        rawQty: row.qty,
        reason: 'Quantidade deve ser maior que zero',
      });
      continue;
    }

    const item = findItemInBalance(balance, row.code);
    if (!item) {
      unmatchedRows.push({
        line: row.line,
        code: row.code,
        qty: row.qty,
        reason: 'Produto não cadastrado no catálogo',
      });
      continue;
    }

    matchedRows.push({ line: row.line, code: row.code, qty: row.qty, item });

    if (!codeOccurrences[item.stockId]) {
      codeOccurrences[item.stockId] = { code: item.sku || item.barcode || row.code, occurrences: 1, totalQty: row.qty, item };
    } else {
      codeOccurrences[item.stockId].occurrences++;
      codeOccurrences[item.stockId].totalQty += row.qty;
    }
  }

  const duplicateSummary = Object.values(codeOccurrences).filter((d) => d.occurrences > 1);
  const uniqueMatchedItemsCount = Object.keys(codeOccurrences).length;
  const totalUnitsToImport = matchedRows.reduce((acc, r) => acc + r.qty, 0);

  return {
    totalRows: rows.length,
    matchedRows,
    unmatchedRows,
    invalidQtyRows,
    duplicateSummary,
    uniqueMatchedItemsCount,
    totalUnitsToImport,
  };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}h ${m}min ${sec}s`;
  }
  if (m > 0) {
    return `${m}min ${sec}s`;
  }
  return `${sec}s`;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const active = getActiveStockBalance();
    if (active) {
      active.syncState = 'synced';
      active.lastSyncedAt = new Date().toISOString();
      saveActiveBalance(active);
    }
  });

  window.addEventListener('offline', () => {
    const active = getActiveStockBalance();
    if (active) {
      active.syncState = 'offline';
      saveActiveBalance(active);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (memoryActiveBalance && memoryActiveBalance.status === 'in_progress') {
      try {
        localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(memoryActiveBalance));
      } catch {
        // ignore
      }
    }
  });
}
