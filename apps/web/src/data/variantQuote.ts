import { getAdminState, type StockItem } from './adminStore';
import {
  getAttributes,
  stockAttributes,
  type ProductAttribute,
} from './attributeStore';

export type VariantQuote = {
  stock: StockItem | null;
  cashPrice: number;
  qty: number;
  installmentLabel: string;
};

function namesMatch(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatInstallment(price: number, parcels = 12) {
  const count = Math.max(1, parcels);
  const parcel = Math.round((price / count) * 100) / 100;
  return `${count} X ${money(parcel)}`;
}

function varyingStockAttrs(rows: StockItem[], attrs: ProductAttribute[]) {
  return attrs.filter((attr) => {
    const values = new Set(rows.map((row) => row.attrs?.[attr.id]).filter(Boolean));
    return values.size > 1;
  });
}

export function findStockVariant(
  productName: string,
  config: Record<string, string>,
  stock = getAdminState().stock,
  attrs = stockAttributes(),
): StockItem | null {
  const rows = stock.filter((item) => namesMatch(item.name, productName));
  if (!rows.length) return null;

  const keys = varyingStockAttrs(rows, attrs);
  const matchAttrs = keys.length ? keys : attrs.filter((attr) => rows.some((row) => row.attrs?.[attr.id]));

  const ranked = rows
    .map((row) => {
      let score = 0;
      let miss = false;
      for (const attr of matchAttrs) {
        const selected = config[attr.id];
        const stored = row.attrs?.[attr.id];
        if (!selected || !stored) continue;
        if (selected === stored) score += 1;
        else miss = true;
      }
      return { row, score, miss };
    })
    .filter((item) => !item.miss)
    .sort((a, b) => b.score - a.score || b.row.qty - a.row.qty);

  return ranked[0]?.row ?? null;
}

function deltaFor(attr: ProductAttribute, value: string | undefined) {
  if (!value) return 0;
  return Number(attr.priceDeltas?.[value] ?? 0) || 0;
}

export function quoteTotemVariant(
  productName: string,
  fallbackPrice: number,
  config: Record<string, string>,
): VariantQuote {
  const stock = getAdminState().stock;
  const stockAttrs = stockAttributes();
  const attrs = getAttributes().filter((item) => item.active);
  const matched = findStockVariant(productName, config, stock, stockAttrs);

  let price = matched?.price ?? fallbackPrice;
  for (const attr of attrs) {
    const value = config[attr.id];
    if (!value) continue;
    if (matched && attr.useOnStock) continue;
    price += deltaFor(attr, value);
  }

  const cashPrice = Math.max(0, Math.round(price * 100) / 100);
  return {
    stock: matched,
    cashPrice,
    qty: matched?.qty ?? 0,
    installmentLabel: formatInstallment(cashPrice),
  };
}

export function quoteFromPicked(
  productName: string,
  fallbackPrice: number,
  picked: { id: string; value: string }[],
) {
  const config = Object.fromEntries(picked.map((item) => [item.id, item.value]));
  return quoteTotemVariant(productName, fallbackPrice, config);
}
