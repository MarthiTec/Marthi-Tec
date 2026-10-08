import {
  stockItemImages,
  type StockItem,
} from '../../data/adminStore';
import { ATTR_CAP, ATTR_COR } from '../../data/attributeStore';
import { formatInstallment,totemCardFee } from '../../data/variantQuote';
import { apiGetTotemCatalog } from '../../services/erpApi';
import {storeScopedKey} from '../../data/storeCache';
import { type TotemBrand, type TotemProduct } from './totemData';

// Public catalog is fetched from the database; never hydrate stock from a browser cache.
let catalogStockCache: StockItem[]=[];
let catalogScope='';
const scope=()=>storeScopedKey('marthi.totem.catalog');

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
    if (row.variations && row.variations.length > 0) {
      for (const v of row.variations) {
        if (Number(v.price) <= 0 && !Object.values(v.pickupPrices ?? {}).some(price => Number(price) > 0)) continue;
        for (const [attrId, value] of Object.entries(v.attrs ?? {})) {
          pushUnique(attrs, attrId, value);
        }
      }
      continue;
    }
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
    if (!item.showOnTotem || item.active===false) continue;
    if (item.qty < 0) continue;
    if (item.kind === 'supply') continue;
    if (item.variations?.length && !item.variations.some(v => Number(v.price)>0 || Object.values(v.pickupPrices ?? {}).some(price=>Number(price)>0))) continue;
    if (!item.variations?.length && Number(item.price)<=0) continue;
    const key = item.id;
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.values()].map((rows) => {
    const name = rows[0].name;
    const attrs = buildTotemAttrs(rows);
    const colors = attrs[ATTR_COR] ?? [];
    const storages = attrs[ATTR_CAP] ?? [];
    const priced = [...rows].sort((a, b) => {
      const minA = a.variations?.length ? Math.min(...a.variations.map(v => v.price)) : a.price;
      const minB = b.variations?.length ? Math.min(...b.variations.map(v => v.price)) : b.price;
      return minA - minB;
    });
    const primary = priced[0];
    const bestCashPrice = primary.variations?.length
      ? Math.min(...primary.variations.flatMap(v => [v.price,...Object.values(v.pickupPrices??{})].map(Number).filter(price=>price>0)))
      : primary.price;
    const images = rows
      .flatMap((row) => stockItemImages(row))
      .filter((url, index, all) => all.indexOf(url) === index);
    const stockFee =
      primary.cardRate !== undefined && primary.cardRate !== null && Number.isFinite(Number(primary.cardRate)) && Number(primary.cardRate)>0
        ? Number(primary.cardRate)
        : undefined;
    const cardFeePercent = stockFee !== undefined ? stockFee : totemCardFee(18);

    return {
      id: stableId(primary.id),
      stockId: primary.id,
      name,
      brand: resolveTotemBrand(primary.brand, name),
      brandName: primary.brand?.trim() || '',
      category: primary.category?.trim() || '',
      storages,
      colors,
      cashPrice: bestCashPrice,
      installmentLabel: formatInstallment(bestCashPrice, 18, cardFeePercent),
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
  catalogScope=scope();
}

/** Estoque cru do último GET Nest — a cotação do card usa isto, não o seed local. */
export function listTotemStock(): StockItem[] {
  return catalogScope===scope()?catalogStockCache:[];
}

/** Sync: só cache Nest em memória — nunca adminStore/seed. */
export function listTotemCatalog(): (TotemProduct & { totalQty?: number })[] {
  return groupStockForTotem(listTotemStock());
}

/**
 * Catálogo do totem = Nest.
 * Público: GET /totem/catalog. Autenticado: preferência estoque da loja via /stock.
 * Sem fallback para mock, com retenção resiliente em caso de falha de rede/rate-limit.
 */
export async function loadTotemCatalog(): Promise<(TotemProduct & { totalQty?: number })[]> {
  const requestedScope=scope();
  try {
    const remote=await apiGetTotemCatalog();
    if(requestedScope!==scope()) throw new Error('A loja selecionada mudou. Atualize o catálogo.');
    rememberStock(Array.isArray(remote)?remote:[]);
    return groupStockForTotem(listTotemStock());
  } catch(error) {
    const status=(error as {status?:number}).status;
    if(requestedScope===scope() && (status===401 || status===403 || status===404))rememberStock([]);
    throw error;
  }
}

export function findStockImageById(stockId: string) {
  const item = listTotemStock().find((entry) => entry.id === stockId);
  return stockItemImages(item);
}

export function findStockImageByName(name: string) {
  const item = listTotemStock().find(
    (entry) => entry.name.toLowerCase() === name.trim().toLowerCase(),
  );
  return stockItemImages(item);
}
