/**
 * posDraftStore.ts
 *
 * Motor de persistência contínua e recuperação de vendas em andamento (PDV).
 * Utiliza IndexedDB primariamente (assíncrono, transacional, sem bloqueio de UI)
 * com fallback inteligente para localStorage em ambientes restritos.
 *
 * Garante que bipes de 30, 50, 100+ itens nunca sejam perdidos por F5, fechamento
 * de aba, crash do navegador, queda de conexão ou falta de energia.
 */

export type PosDraftLine = {
  key: string;
  stockId: string;
  name: string;
  sku: string;
  qty: number;
  unit: string;
  basePrice: number;
  unitPrice: number;
  priceTableId: string;
  lineDiscount: number;
  lineDiscountMode: 'money' | 'percent';
  lineSurcharge: number;
  lineSurchargeMode: 'money' | 'percent';
  isFrozenPrice?: boolean;
  promoLabel?: string;
  promoExplanation?: string;
  campaignId?: string;
  imei?: string;
  isAdHoc?: boolean;
  itemType?: 'product' | 'ad_hoc';
};

export type PosDraftSplit = {
  key: string;
  methodId: string;
  amount: number;
  installments: number;
  tendered: number;
};

export type PosDraftCustomer = {
  id: string;
  name: string;
  phone: string;
  document: string;
  askCpf: boolean;
  walkIn: boolean;
};

export type PosDraftSale = {
  localId: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  createdAt: string;
  updatedAt: string;
  operatorName: string;
  operatorEmail?: string;
  terminalId: string;
  cashSessionId?: string | null;
  customer: PosDraftCustomer;
  sellerId: string;
  defaultTableId: string;
  discount: number;
  discountMode: 'money' | 'percent';
  surcharge: number;
  surchargeMode: 'money' | 'percent';
  splits: PosDraftSplit[];
  splitTouched: boolean;
  lines: PosDraftLine[];
  linkedOsId?: string | null;
  linkedQuoteId?: string | null;
  notes?: string;
};

export const POS_DRAFT_EVENT = 'marthi-pos-draft-event';

const DB_NAME = 'marthi_pos_db';
const DB_VERSION = 1;
const STORE_DRAFTS = 'active_draft_sales';
const STORE_OFFLINE_QUEUE = 'offline_orders_queue';

const TERMINAL_STORAGE_KEY = 'marthi.pos.terminal.id';
const FALLBACK_DRAFT_KEY = 'marthi.pos.draft.fallback.v1';
const FALLBACK_QUEUE_KEY = 'marthi.pos.queue.fallback.v1';

let cachedDb: IDBDatabase | null = null;

/** Gera ID único idempotente para a venda local */
export function generateSaleLocalId(): string {
  const timestamp = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 9);
  return `pdv-${timestamp}-${rand}`;
}

/** Obtém ou inicializa o identificador do terminal/estação */
export function getPosTerminalId(): string {
  try {
    let id = localStorage.getItem(TERMINAL_STORAGE_KEY);
    if (!id || !id.trim()) {
      id = 'CAIXA-01';
      localStorage.setItem(TERMINAL_STORAGE_KEY, id);
    }
    return id.trim();
  } catch {
    return 'CAIXA-01';
  }
}

/** Atualiza o identificador do terminal */
export function setPosTerminalId(terminalId: string): void {
  try {
    localStorage.setItem(TERMINAL_STORAGE_KEY, terminalId.trim());
  } catch {
    /* ignore */
  }
}

/** Abre conexão com o IndexedDB */
async function openPosDb(): Promise<IDBDatabase> {
  if (cachedDb) return cachedDb;

  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('IndexedDB não suportado.');
  }

  return new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
          const draftStore = db.createObjectStore(STORE_DRAFTS, { keyPath: 'localId' });
          draftStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          draftStore.createIndex('terminalId', 'terminalId', { unique: false });
          draftStore.createIndex('status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_OFFLINE_QUEUE)) {
          const queueStore = db.createObjectStore(STORE_OFFLINE_QUEUE, { keyPath: 'localId' });
          queueStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => {
        cachedDb = request.result;
        cachedDb.onclose = () => {
          cachedDb = null;
        };
        resolve(cachedDb);
      };

      request.onerror = () => {
        reject(request.error);
      };

      request.onblocked = () => {
        console.warn('[posDraftStore] Conexão com IndexedDB bloqueada por outra aba.');
      };
    } catch (err) {
      reject(err);
    }
  });
}

/* =============================================================================
   FALLBACK LOCALSTORAGE (Para casos em que o IndexedDB falhe ou esteja desabilitado)
   ============================================================================= */

function loadFallbackDrafts(): Record<string, PosDraftSale> {
  try {
    const raw = localStorage.getItem(FALLBACK_DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveFallbackDrafts(map: Record<string, PosDraftSale>): void {
  try {
    localStorage.setItem(FALLBACK_DRAFT_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function loadFallbackQueue(): any[] {
  try {
    const raw = localStorage.getItem(FALLBACK_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFallbackQueue(list: any[]): void {
  try {
    localStorage.setItem(FALLBACK_QUEUE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/* =============================================================================
   OPERAÇÕES PÚBLICAS DE PERSISTÊNCIA DO RASCUNHO DA VENDA
   ============================================================================= */

/**
 * Salva ou atualiza a venda em andamento.
 * Execução instantânea e assíncrona, garantindo que mesmo após F5 o estado persista.
 */
export async function saveDraftSale(draft: PosDraftSale): Promise<void> {
  const normalized: PosDraftSale = {
    ...draft,
    updatedAt: new Date().toISOString(),
    status: draft.status || 'in_progress',
  };

  try {
    const db = await openPosDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, 'readwrite');
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.put(normalized);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Fallback para localStorage
    const map = loadFallbackDrafts();
    map[normalized.localId] = normalized;
    saveFallbackDrafts(map);
  }

  // Notifica ouvintes locais (ex: indicadores na UI)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(POS_DRAFT_EVENT, { detail: { action: 'saved', localId: normalized.localId } }));
  }
}

/**
 * Obtém uma venda em rascunho por seu ID local.
 */
export async function getDraftSale(localId: string): Promise<PosDraftSale | null> {
  if (!localId) return null;
  try {
    const db = await openPosDb();
    return await new Promise<PosDraftSale | null>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, 'readonly');
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.get(localId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    const map = loadFallbackDrafts();
    return map[localId] || null;
  }
}

/**
 * Lista todas as vendas ativas em andamento (opcionalmente filtrando por terminal).
 */
export async function listActiveDraftSales(terminalId?: string): Promise<PosDraftSale[]> {
  const currentTerminal = (terminalId || getPosTerminalId()).trim();
  try {
    const db = await openPosDb();
    const all = await new Promise<PosDraftSale[]>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, 'readonly');
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    return all
      .filter((d) => d.status === 'in_progress' && d.lines && d.lines.length > 0)
      .filter((d) => !currentTerminal || d.terminalId === currentTerminal)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    const map = loadFallbackDrafts();
    return Object.values(map)
      .filter((d) => d.status === 'in_progress' && d.lines && d.lines.length > 0)
      .filter((d) => !currentTerminal || d.terminalId === currentTerminal)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}

/**
 * Carrega a venda em andamento mais recente com itens.
 */
export async function getLatestActiveDraftSale(terminalId?: string): Promise<PosDraftSale | null> {
  const active = await listActiveDraftSales(terminalId);
  return active[0] || null;
}

/**
 * Remove a venda do armazenamento local (usada no cancelamento explícito ou descarte).
 */
export async function deleteDraftSale(localId: string): Promise<void> {
  if (!localId) return;
  try {
    const db = await openPosDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, 'readwrite');
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.delete(localId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const map = loadFallbackDrafts();
    delete map[localId];
    saveFallbackDrafts(map);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(POS_DRAFT_EVENT, { detail: { action: 'deleted', localId } }));
  }
}

/**
 * Marca o draft como finalizado com sucesso e limpa os dados temporários do armazenamento local.
 */
export async function clearCompletedDraftSale(localId: string): Promise<void> {
  if (!localId) return;
  await deleteDraftSale(localId);
}

/**
 * Limpa todos os rascunhos antigos ou abandonados (manutenção preventiva).
 */
export async function cleanupOldDraftSales(maxAgeHours = 72): Promise<number> {
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  let count = 0;
  try {
    const db = await openPosDb();
    const all = await new Promise<PosDraftSale[]>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, 'readonly');
      const store = tx.objectStore(STORE_DRAFTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    for (const item of all) {
      if (new Date(item.updatedAt).getTime() < cutoff) {
        await deleteDraftSale(item.localId);
        count += 1;
      }
    }
  } catch {
    const map = loadFallbackDrafts();
    for (const key of Object.keys(map)) {
      if (new Date(map[key].updatedAt).getTime() < cutoff) {
        delete map[key];
        count += 1;
      }
    }
    saveFallbackDrafts(map);
  }
  return count;
}

/* =============================================================================
   FILA DE SINCRONIZAÇÃO OFFLINE (Caso a internet caia durante a finalização)
   ============================================================================= */

export type OfflineOrderQueueItem = {
  localId: string;
  createdAt: string;
  orderData: any;
  retryCount: number;
  lastError?: string;
};

export async function enqueueOfflineOrder(localId: string, orderData: any): Promise<void> {
  const item: OfflineOrderQueueItem = {
    localId,
    createdAt: new Date().toISOString(),
    orderData,
    retryCount: 0,
  };

  try {
    const db = await openPosDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_OFFLINE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_OFFLINE_QUEUE);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const list = loadFallbackQueue();
    const filtered = list.filter((i) => i.localId !== localId);
    filtered.push(item);
    saveFallbackQueue(filtered);
  }
}

export async function listOfflineOrderQueue(): Promise<OfflineOrderQueueItem[]> {
  try {
    const db = await openPosDb();
    return await new Promise<OfflineOrderQueueItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_OFFLINE_QUEUE, 'readonly');
      const store = tx.objectStore(STORE_OFFLINE_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return loadFallbackQueue();
  }
}

export async function dequeueOfflineOrder(localId: string): Promise<void> {
  try {
    const db = await openPosDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_OFFLINE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_OFFLINE_QUEUE);
      const req = store.delete(localId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const list = loadFallbackQueue();
    saveFallbackQueue(list.filter((i) => i.localId !== localId));
  }
}
