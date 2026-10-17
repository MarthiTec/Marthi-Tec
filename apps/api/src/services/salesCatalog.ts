import { CONDITION_LABEL, conditionCode } from './productCondition.js';

/**
 * Catálogo para o cliente: de cada produto escolhido, uma foto, o nome e o preço; e cada variação
 * disponível com o que soma ao valor (cor, capacidade, condição, bateria do usado) e o preço dela.
 * Nunca expõe custo nem IMEI.
 */
export type CatalogVariant = {
  label: string;
  color: string;
  capacity: string;
  others: string[];
  condition: string;
  /** Bateria das unidades usadas em estoque (uma por aparelho, sem repetir). */
  batteries: number[];
  price: number;
  available: number;
};
export type CatalogItem = {
  id: string;
  name: string;
  brand: string;
  image: string | null;
  price: number;
  priceFrom: boolean;
  condition: string;
  variants: CatalogVariant[];
  isNew: boolean;
  soldOut: boolean;
};

type Attr = { id: string; name: string };
type EntryUnits = { variationId: string | null; battery: number | null; free: number };

const NEW_DAYS = 15;
const num = (value: unknown) => Number(value) || 0;
const asArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};
const httpsImage = (value: unknown) => {
  const text = String(value ?? '');
  return /^https:\/\//i.test(text) || /^data:image\//i.test(text) ? text : null;
};

/** Monta os itens do catálogo na ordem escolhida pela loja. */
export function buildCatalogItems(
  products: any[],
  productIds: string[],
  attributes: Attr[],
  units: Map<string, EntryUnits[]>,
  options: { hideSoldOut: boolean; now?: Date },
): CatalogItem[] {
  const now = (options.now ?? new Date()).getTime();
  const attrName = new Map(attributes.map((attr) => [attr.id, attr.name]));
  const isColor = (id: string) => /\bcor\b|color/i.test(attrName.get(id) ?? id) || /cor$/i.test(id);
  const isCapacity = (id: string) => /capac|armazen|storage/i.test(attrName.get(id) ?? id) || /cap$/i.test(id);
  const byId = new Map(products.map((product) => [String(product.id), product]));
  const items: CatalogItem[] = [];

  for (const id of productIds) {
    const product = byId.get(id);
    if (!product || product.active === false) continue;
    const productUnits = units.get(id) ?? [];
    const batteriesFor = (variationId: string | null, fallback: unknown, condition: string) => {
      if (condition === 'new') return [];
      const list = productUnits
        .filter((unit) => unit.variationId === variationId && unit.free > 0 && unit.battery !== null)
        .map((unit) => num(unit.battery));
      const unique = [...new Set(list.length ? list : fallback === null || fallback === undefined || fallback === '' ? [] : [num(fallback)])];
      return unique.filter((value) => value > 0 && value <= 100).sort((a, b) => b - a);
    };

    const variations = asArray(product.variations);
    let variants: CatalogVariant[];
    if (variations.length) {
      variants = variations
        .map((variation: any) => {
          const attrs = Object.entries(variation.attrs ?? {}).filter(([, value]) => String(value ?? '').trim());
          const color = String(attrs.find(([attrId]) => isColor(attrId))?.[1] ?? '');
          const capacity = String(attrs.find(([attrId]) => isCapacity(attrId))?.[1] ?? '');
          const others = attrs.filter(([attrId]) => !isColor(attrId) && !isCapacity(attrId)).map(([, value]) => String(value));
          const code = conditionCode(variation.condition) || 'new';
          const condition = CONDITION_LABEL[code] ?? 'Novo';
          const batteries = batteriesFor(variation.id ? String(variation.id) : null, variation.batteryLevel ?? variation.battery_level, code);
          return {
            label: [color, capacity, ...others].filter(Boolean).join(' · '),
            color,
            capacity,
            others,
            condition,
            batteries,
            price: num(variation.price) || num(product.price),
            available: Math.max(0, num(variation.qty)),
          };
        })
        .filter((variant) => !options.hideSoldOut || variant.available > 0);
    } else {
      const code = conditionCode(product.condition) || 'new';
      variants = [
        {
          label: [product.color, product.capacity].filter(Boolean).join(' · '),
          color: String(product.color ?? ''),
          capacity: String(product.capacity ?? ''),
          others: [],
          condition: CONDITION_LABEL[code] ?? 'Novo',
          batteries: batteriesFor(null, product.battery_level ?? product.batteryLevel, code),
          price: num(product.price),
          available: Math.max(0, num(product.qty)),
        },
      ];
    }

    const available = variants.filter((variant) => variant.available > 0);
    const soldOut = available.length === 0;
    if (soldOut && options.hideSoldOut) continue;
    const priced = (available.length ? available : variants).map((variant) => variant.price).filter((price) => price > 0);
    const price = priced.length ? Math.min(...priced) : num(product.price);
    const conditions = [...new Set(variants.map((variant) => variant.condition))];
    const recent = [product.last_purchase_at, product.created_at].map((value) => (value ? new Date(value).getTime() : 0)).filter(Boolean);
    items.push({
      id: String(product.id),
      name: String(product.name ?? ''),
      brand: String(product.brand ?? ''),
      image: httpsImage(asArray(product.images)[0]),
      price,
      priceFrom: new Set(priced).size > 1,
      condition: conditions.length === 1 ? conditions[0] : '',
      // Só a variação, sem repetir no cartão o que já é o produto inteiro.
      variants: variants.length === 1 && !variants[0].label && !variants[0].batteries.length ? [] : variants,
      isNew: recent.some((time) => now - time < NEW_DAYS * 86400000),
      soldOut,
    });
  }
  return items;
}
