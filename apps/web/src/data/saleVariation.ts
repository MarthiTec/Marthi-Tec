import type { StockVariationRow, SupplierEntry } from './adminStore';
import { CONDITION_ATTR_ID, conditionCode } from './productCondition';
import { entryImeis } from './stockSearch';

type Picked = Array<{ id: string; value: string }>;
type ProductLike = { imei?: string; variations?: StockVariationRow[]; supplierEntries?: SupplierEntry[] };

const valueKey = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');

/** Variações compatíveis com o que já foi escolhido na linha (cor, capacidade, condição). */
export function compatibleVariations(product: ProductLike | undefined, picked: Picked, options: { ignore?: string; onlyInStock?: boolean } = {}) {
  const condition = conditionCode(picked.find((p) => p.id === CONDITION_ATTR_ID)?.value);
  return (product?.variations ?? []).filter((v) => {
    if (options.onlyInStock && !(Number(v.qty) > 0)) return false;
    if (condition && options.ignore !== CONDITION_ATTR_ID && (conditionCode(v.condition) || 'new') !== condition) return false;
    return picked.every((p) => p.id === CONDITION_ATTR_ID || p.id === options.ignore || !p.value || valueKey(v.attrs?.[p.id]) === valueKey(p.value));
  });
}

/** A variação da linha, quando o que foi escolhido aponta para uma só. */
export function lineVariation(product: ProductLike | undefined, picked: Picked, onlyInStock = true) {
  const list = compatibleVariations(product, picked, { onlyInStock });
  return list.length === 1 ? list[0] : undefined;
}

/**
 * Correção de venda: devolve ao estoque da tela os aparelhos desta venda (como o servidor fará ao
 * gravar a correção), para a venda poder ser refeita com o mesmo aparelho, cor e IMEI.
 */
export function restoreSaleUnits<T extends ProductLike & { id: string; qty?: number }>(
  items: T[],
  saleId: string,
  lines: Array<{ stockId: string | null; qty: number; imei?: string; attributes?: Picked }>,
): T[] {
  const release = (entry: SupplierEntry): SupplierEntry => {
    const back = (entry.soldImeis ?? []).filter((unit) => unit.saleId === saleId).length;
    return back ? { ...entry, soldImeis: (entry.soldImeis ?? []).filter((unit) => unit.saleId !== saleId), soldQty: Math.max(0, (entry.soldQty ?? 0) - back) } : entry;
  };
  return items.map((item) => {
    const own = lines.filter((line) => line.stockId === item.id);
    if (!own.length) return item;
    const variations = item.variations ?? [];
    const extra = new Map<StockVariationRow, number>();
    for (const line of own) {
      // A unidade volta para a variação do IMEI vendido (ou a da cor/capacidade da linha).
      const target =
        (line.imei && variations.find((v) => (v.supplierEntries ?? []).some((entry) => (entry.imeis ?? []).includes(line.imei!)))) ||
        compatibleVariations({ variations }, line.attributes ?? [])[0];
      if (target) extra.set(target, (extra.get(target) ?? 0) + line.qty);
    }
    return {
      ...item,
      qty: (Number(item.qty) || 0) + own.reduce((sum, line) => sum + line.qty, 0),
      supplierEntries: item.supplierEntries?.map(release),
      variations: variations.map((v) => ({ ...v, qty: (Number(v.qty) || 0) + (extra.get(v) ?? 0), supplierEntries: v.supplierEntries?.map(release) })),
    };
  });
}

/** IMEIs em estoque do aparelho escolhido (variação, ou produto sem grade). Vendidos/baixados não entram. */
export function availableImeis(product: ProductLike | undefined, variation: StockVariationRow | undefined) {
  const entries = variation ? variation.supplierEntries ?? [] : (product?.variations?.length ? [] : product?.supplierEntries ?? []);
  const list = [...entries.flatMap((entry) => entryImeis(entry)), variation ? variation.imei ?? '' : product?.variations?.length ? '' : product?.imei ?? ''];
  return [...new Set(list.map((imei) => imei.trim()).filter(Boolean))];
}
