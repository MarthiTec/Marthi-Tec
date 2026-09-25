import {
  stockItemImages,
  type StockItem,
} from '../../data/adminStore';
import { ATTR_CAP, ATTR_COR, ATTR_RET, totemAttributes } from '../../data/attributeStore';
import { formatInstallment } from '../../data/variantQuote';
import { apiGetTotemCatalog, apiListStock } from '../../services/erpApi';
import { isNestAuthed } from '../../services/nestClient';
import {
  FULFILLMENT_OPTIONS,
  type TotemBrand,
  type TotemProduct,
} from './totemData';

/** Cache em memória do último catálogo Nest (nunca seed localStorage). */
let catalogStockCache: StockItem[] = [];

function stableId(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function guessBrand(name: string): TotemBrand {
  const slug = name.toLowerCase();
  if (slug.includes('xiaomi') || slug.includes('redmi')) return 'xiaomi';
  return 'apple';
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

  for (const attr of totemAttributes()) {
    if (attr.id === ATTR_RET) {
      attrs[ATTR_RET] = [...FULFILLMENT_OPTIONS];
    }
  }
  if (!attrs[ATTR_RET]?.length) {
    attrs[ATTR_RET] = [...FULFILLMENT_OPTIONS];
  }

  if (!attrs[ATTR_COR]?.length) attrs[ATTR_COR] = ['—'];
  if (!attrs[ATTR_CAP]?.length) attrs[ATTR_CAP] = ['—'];

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
    const colors = attrs[ATTR_COR] ?? ['—'];
    const storages = attrs[ATTR_CAP] ?? ['—'];
    const priced = [...rows].sort((a, b) => a.price - b.price);
    const primary = priced[0];
    const images = rows
      .flatMap((row) => stockItemImages(row))
      .filter((url, index, all) => all.indexOf(url) === index);

    return {
      id: stableId(name),
      name,
      brand: guessBrand(name),
      storages,
      colors,
      cashPrice: primary.price,
      installmentLabel: formatInstallment(primary.price, 12),
      images: images.length ? images : stockItemImages(primary),
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
}

/** Sync: só cache Nest em memória — nunca adminStore/seed. */
export function listTotemCatalog(): (TotemProduct & { totalQty?: number })[] {
  return groupStockForTotem(catalogStockCache);
}

/**
 * Catálogo do totem = Nest.
 * Público: GET /totem/catalog. Autenticado: preferência estoque da loja via /stock.
 * Sem fallback para mock/localStorage.
 */
export async function loadTotemCatalog(): Promise<(TotemProduct & { totalQty?: number })[]> {
  try {
    const stock = isNestAuthed()
      ? await apiListStock().catch(() => apiGetTotemCatalog())
      : await apiGetTotemCatalog();
    const forTotem = stock.filter((item) => item.showOnTotem !== false);
    rememberStock(forTotem);
    return groupStockForTotem(forTotem);
  } catch (error) {
    console.error('[totem] falha ao carregar catálogo Nest', error);
    catalogStockCache = [];
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
