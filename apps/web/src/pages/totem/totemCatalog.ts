import { getAdminState, stockItemImages, type StockItem } from '../../data/adminStore';
import { ATTR_CAP, ATTR_COR, ATTR_RET, totemAttributes } from '../../data/attributeStore';
import { getTotemSettings } from '../../data/totemSettings';
import { formatInstallment } from '../../data/variantQuote';
import { fetchCatalogProducts, type CatalogProduct } from '../../services/products';
import {
  FULFILLMENT_OPTIONS,
  TOTEM_PRODUCTS,
  type TotemBrand,
  type TotemProduct,
} from './totemData';

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

function brandFromApi(product: CatalogProduct): TotemBrand {
  const slug = (product.brandSlug ?? '').toLowerCase();
  if (slug === 'xiaomi') return 'xiaomi';
  if (slug === 'apple') return 'apple';
  const brandId = String(product.brandId ?? '').toLowerCase();
  if (brandId.includes('xiaomi')) return 'xiaomi';
  return guessBrand(product.name);
}

function pushUnique(map: Record<string, string[]>, key: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  const list = map[key] ?? [];
  if (!list.includes(trimmed)) list.push(trimmed);
  map[key] = list;
}

/** Agrega attrs do estoque ERP para o card do totem (incluindo atributos customizados). */
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
    if (item.qty <= 0) continue;
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

function mapApiProduct(product: CatalogProduct): TotemProduct {
  const attrs = { ...(product.attrs ?? {}) };
  if (!attrs[ATTR_RET]?.length) {
    attrs[ATTR_RET] = [...FULFILLMENT_OPTIONS];
  }
  const colors = attrs[ATTR_COR]?.length ? attrs[ATTR_COR] : ['—'];
  const storages = attrs[ATTR_CAP]?.length ? attrs[ATTR_CAP] : ['—'];
  const cashPrice = Number(product.cashPrice) || 0;
  const numericId = typeof product.id === 'number' ? product.id : Number(product.id);
  const id = Number.isFinite(numericId) && numericId > 0 ? numericId : stableId(product.name);

  return {
    id,
    name: product.name,
    brand: brandFromApi(product),
    storages,
    colors,
    cashPrice,
    installmentLabel: formatInstallment(cashPrice, 12),
    images: product.images?.length ? product.images : [],
    attrs: {
      ...attrs,
      [ATTR_COR]: colors,
      [ATTR_CAP]: storages,
      [ATTR_RET]: attrs[ATTR_RET] ?? [...FULFILLMENT_OPTIONS],
    },
  };
}

/** Catálogo efetivo síncrono: estoque ERP local ou demo hardcoded. */
export function listTotemCatalog(): (TotemProduct & { totalQty?: number })[] {
  const { shareStockWithErp } = getTotemSettings();
  if (!shareStockWithErp) return TOTEM_PRODUCTS;
  return groupStockForTotem(getAdminState().stock);
}

/**
 * Preferência: Nest público → fallback local (estoque ERP ou TOTEM_PRODUCTS).
 * Usar no mount do totem.
 */
export async function loadTotemCatalog(): Promise<(TotemProduct & { totalQty?: number })[]> {
  const { shareStockWithErp } = getTotemSettings();
  if (shareStockWithErp) {
    return groupStockForTotem(getAdminState().stock);
  }

  try {
    const products = await fetchCatalogProducts();
    const active = products.filter((item) => item.status !== 'inactive');
    if (active.length === 0) return TOTEM_PRODUCTS;
    return active.map(mapApiProduct);
  } catch {
    return TOTEM_PRODUCTS;
  }
}

export function findStockImageById(stockId: string) {
  const item = getAdminState().stock.find((entry) => entry.id === stockId);
  return stockItemImages(item);
}

export function findStockImageByName(name: string) {
  const item = getAdminState().stock.find(
    (entry) => entry.name.toLowerCase() === name.trim().toLowerCase(),
  );
  return stockItemImages(item);
}
