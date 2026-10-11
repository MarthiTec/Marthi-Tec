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

/** IMEIs em estoque do aparelho escolhido (variação, ou produto sem grade). Vendidos/baixados não entram. */
export function availableImeis(product: ProductLike | undefined, variation: StockVariationRow | undefined) {
  const entries = variation ? variation.supplierEntries ?? [] : (product?.variations?.length ? [] : product?.supplierEntries ?? []);
  const list = [...entries.flatMap((entry) => entryImeis(entry)), variation ? variation.imei ?? '' : product?.variations?.length ? '' : product?.imei ?? ''];
  return [...new Set(list.map((imei) => imei.trim()).filter(Boolean))];
}
