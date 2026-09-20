import { getAdminState, stockItemImages, type StockItem } from '../../data/adminStore';
import { ATTR_CAP, ATTR_COR, ATTR_RET, totemAttributes } from '../../data/attributeStore';
import { getTotemSettings } from '../../data/totemSettings';
import { formatInstallment } from '../../data/variantQuote';
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

  // Retirada é opção de atendimento do totem (não vem do estoque).
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

/** Catálogo efetivo do totem: demo isolado ou estoque ERP marcado para exibir. */
export function listTotemCatalog(): (TotemProduct & { totalQty?: number })[] {
  const { shareStockWithErp } = getTotemSettings();
  if (!shareStockWithErp) return TOTEM_PRODUCTS;
  return groupStockForTotem(getAdminState().stock);
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
