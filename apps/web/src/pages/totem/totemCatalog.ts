import {
  getAdminState,
  stockItemImages,
  type StockItem,
} from '../../data/adminStore';
import { ATTR_CAP, ATTR_COR } from '../../data/attributeStore';
import { formatInstallment } from '../../data/variantQuote';
import { getTotemSettings } from '../../data/totemSettings';
import { apiGetTotemCatalog, apiListStock } from '../../services/erpApi';
import { isNestAuthed } from '../../services/nestClient';
import { type TotemBrand, type TotemProduct } from './totemData';

const TOTEM_CATALOG_CACHE_KEY = 'marthi.totem.catalog.cache.v2';

function readPersistedStockCache(): StockItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TOTEM_CATALOG_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Limpeza automática de mocks legados residuais no cache
    const hasLegacy = parsed.some(
      (item) =>
        /iphone|redmi/i.test(item.name || '') ||
        item.sku === 'APL-16P-128' ||
        item.sku === 'APL-15-128' ||
        item.sku === 'XIA-RN13-256',
    );
    if (hasLegacy) {
      localStorage.removeItem(TOTEM_CATALOG_CACHE_KEY);
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

/** Cache em memória do último catálogo Nest (inicializado com cache persistido se houver). */
let catalogStockCache: StockItem[] = readPersistedStockCache();

function stableId(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function resolveTotemBrand(rawBrand: string | undefined, name: string): TotemBrand {
  const b = (rawBrand || '').trim().toLowerCase();
  if (b === 'apple' || b === 'iphone') return 'apple';
  if (b === 'xiaomi' || b === 'redmi' || b === 'poco') return 'xiaomi';
  if (b) return 'other';
  return guessBrand(name);
}

function guessBrand(name: string): TotemBrand {
  const slug = name.toLowerCase();
  if (slug.includes('xiaomi') || slug.includes('redmi') || slug.includes('poco')) return 'xiaomi';
  if (slug.includes('iphone') || slug.includes('apple') || slug.includes('ipad')) return 'apple';
  return 'other';
}

function pushUnique(map: Record<string, string[]>, key: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  const list = map[key] ?? [];
  if (!list.includes(trimmed)) list.push(trimmed);
  map[key] = list;
}

function buildTotemAttrs(rows: StockItem[]): Record<string, string[]> {
  const attrs: Record<string, string[]> = {};

  for (const row of rows) {
    for (const [attrId, value] of Object.entries(row.attrs ?? {})) {
      pushUnique(attrs, attrId, value);
    }
    pushUnique(attrs, ATTR_COR, row.color || row.attrs?.[ATTR_COR] || '');
    pushUnique(attrs, ATTR_CAP, row.capacity || row.attrs?.[ATTR_CAP] || '');
  }

  return attrs;
}

function groupStockForTotem(items: StockItem[]): (TotemProduct & { totalQty: number })[] {
  const groups = new Map<string, StockItem[]>();
  for (const item of items) {
    if (!item.showOnTotem) continue;
    if (item.qty < 0) continue;
    if (item.kind === 'supply') continue;
    const key = item.name.trim();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([name, rows]) => {
    const attrs = buildTotemAttrs(rows);
    const colors = attrs[ATTR_COR] ?? [];
    const storages = attrs[ATTR_CAP] ?? [];
    const priced = [...rows].sort((a, b) => a.price - b.price);
    const primary = priced[0];
    const images = rows
      .flatMap((row) => stockItemImages(row))
      .filter((url, index, all) => all.indexOf(url) === index)
      .slice(0, 4);
    const stockFee =
      primary.cardRate !== undefined && primary.cardRate !== null && Number.isFinite(Number(primary.cardRate))
        ? Number(primary.cardRate)
        : undefined;
    const cardFeePercent = stockFee !== undefined ? stockFee : getTotemSettings().cardFeePercent;

    return {
      id: stableId(name),
      name,
      brand: resolveTotemBrand(primary.brand, name),
      storages,
      colors,
      cashPrice: primary.price,
      installmentLabel: formatInstallment(primary.price, 12, cardFeePercent),
      images: (images.length ? images : stockItemImages(primary)).slice(0, 4),
      attrs,
      totalQty: rows.reduce((sum, row) => sum + row.qty, 0),
    };
  });
}

function rememberStock(items: StockItem[]) {
  catalogStockCache = items.map((item) => ({
    ...item,
    attrs: { ...(item.attrs ?? {}) },
    images: [...(item.images ?? [])],
  }));
  try {
    localStorage.setItem(TOTEM_CATALOG_CACHE_KEY, JSON.stringify(catalogStockCache));
  } catch {
    /* quota / private mode */
  }
}

/** Estoque cru do último GET Nest — a cotação do card usa isto, não o seed local. */
export function listTotemStock(): StockItem[] {
  return catalogStockCache;
}

/** Sync: só cache Nest em memória — nunca adminStore/seed. */
export function listTotemCatalog(): (TotemProduct & { totalQty?: number })[] {
  return groupStockForTotem(catalogStockCache);
}

/**
 * Catálogo do totem = Nest.
 * Público: GET /totem/catalog. Autenticado: preferência estoque da loja via /stock.
 * Sem fallback para mock, com retenção resiliente em caso de falha de rede/rate-limit.
 */
export async function loadTotemCatalog(): Promise<(TotemProduct & { totalQty?: number })[]> {
  try {
    const remoteStock = isNestAuthed()
      ? await apiListStock().catch(() => apiGetTotemCatalog())
      : await apiGetTotemCatalog();

    // Obtém itens do estoque do ERP local que possuem showOnTotem: true
    const localStock = getAdminState().stock.filter((item) => item.showOnTotem === true);

    // Mescla estoque remoto com o local, preservando os itens locais para evitar que sumam do catálogo
    const stockMap = new Map<string, StockItem>();
    for (const item of localStock) {
      const key = (item.id || item.sku || item.name).trim().toLowerCase();
      if (key) stockMap.set(key, item);
    }
    for (const item of (Array.isArray(remoteStock) ? remoteStock : [])) {
      if (item.showOnTotem === true) {
        const key = (item.id || item.sku || item.name).trim().toLowerCase();
        if (key) stockMap.set(key, item);
      }
    }

    const forTotem = stockMap.size > 0
      ? Array.from(stockMap.values())
      : (Array.isArray(remoteStock) ? remoteStock.filter((i) => i.showOnTotem === true) : []);

    rememberStock(forTotem);
    return groupStockForTotem(forTotem);
  } catch (error) {
    console.warn('[totem] falha ao carregar catálogo Nest, mantendo cache existente:', error);
    // Preserva itens do estoque local se houver
    const localStock = getAdminState().stock.filter((item) => item.showOnTotem === true);
    if (localStock.length > 0) {
      rememberStock(localStock);
      return groupStockForTotem(localStock);
    }
    if (catalogStockCache.length > 0) {
      return groupStockForTotem(catalogStockCache);
    }
    const persisted = readPersistedStockCache();
    if (persisted.length > 0) {
      catalogStockCache = persisted;
      return groupStockForTotem(persisted);
    }
    return [];
  }
}

export function findStockImageById(stockId: string) {
  const item = catalogStockCache.find((entry) => entry.id === stockId);
  return stockItemImages(item);
}

export function findStockImageByName(name: string) {
  const item = catalogStockCache.find(
    (entry) => entry.name.toLowerCase() === name.trim().toLowerCase(),
  );
  return stockItemImages(item);
}
