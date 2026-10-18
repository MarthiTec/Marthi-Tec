import { CONDITION_LABEL, conditionCode } from './productCondition.js';

/**
 * Catálogo para o cliente: de cada produto escolhido, uma foto, o nome e o preço; e cada variação
 * com o que soma ao valor (cor, capacidade, condição, bateria do usado), o preço e a disponibilidade:
 * em estoque, sob encomenda (a loja trabalha muito por encomenda: sem estoque continua disponível,
 * com o prazo) ou esgotada. Nunca expõe custo nem IMEI.
 */
export type Availability = 'in_stock' | 'order' | 'sold_out';
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
  availability: Availability;
  /** Prazo da encomenda (dias), quando é sob encomenda. */
  leadDays: number | null;
  /** Para o pedido virar linha de venda (variação certa); sem custo nem IMEI. */
  attributes: Array<{ id: string; name: string; value: string }>;
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
  /** Tudo o que está disponível é sob encomenda (nada em estoque agora). */
  orderOnly: boolean;
  /** Vídeo do aparelho (YouTube ou arquivo HTTPS) e ficha técnica, quando cadastrados. */
  videoUrl: string;
  specs: Array<{ label: string; value: string }>;
};
/** Modalidade "sob encomenda" ativa da loja (preço por produto/variação em pickup_prices). */
export type OrderMethod = { id: string; leadDays: number } | null;

type Attr = { id: string; name: string };
type EntryUnits = { variationId: string | null; battery: number | null; free: number };

/** Novidade: produto cadastrado nos últimos 3 dias. */
const NEW_DAYS = 3;
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
const asObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};
const httpsImage = (value: unknown) => {
  const text = String(value ?? '');
  return /^https:\/\//i.test(text) || /^data:image\//i.test(text) ? text : null;
};

/**
 * Sem estoque: dá para encomendar? Mesma regra do cadastro ("Preço por tipo de retirada"): só quando a
 * modalidade "Sob encomenda" está marcada no produto/variação. Sem nada marcado vale só a pronta entrega.
 */
function orderPrice(orderMethod: OrderMethod, prices: Record<string, any>, fallback: number) {
  if (!orderMethod) return null;
  if (!Object.prototype.hasOwnProperty.call(prices, orderMethod.id) || prices[orderMethod.id] === null) return null;
  const price = num(prices[orderMethod.id]);
  return price > 0 ? price : fallback > 0 ? fallback : null;
}

/** A variação com as formas de retirada marcadas usa as dela; sem nada marcado, vale o que o produto marcou. */
const ownPrices = (variation: Record<string, any>, product: Record<string, any>) => (Object.keys(variation).length ? variation : product);

/** Monta os itens do catálogo na ordem escolhida pela loja. */
export function buildCatalogItems(
  products: any[],
  productIds: string[],
  attributes: Attr[],
  units: Map<string, EntryUnits[]>,
  options: { hideSoldOut: boolean; now?: Date; orderMethod?: OrderMethod },
): CatalogItem[] {
  const now = (options.now ?? new Date()).getTime();
  const orderMethod = options.orderMethod ?? null;
  const attrName = new Map(attributes.map((attr) => [attr.id, attr.name]));
  const isColor = (id: string) => /\bcor\b|color/i.test(attrName.get(id) ?? id) || /cor$/i.test(id);
  const isCapacity = (id: string) => /capac|armazen|storage/i.test(attrName.get(id) ?? id) || /cap$/i.test(id);
  const byId = new Map(products.map((product) => [String(product.id), product]));
  const items: CatalogItem[] = [];

  for (const id of productIds) {
    const product = byId.get(id);
    if (!product || product.active === false) continue;
    const productUnits = units.get(id) ?? [];
    const productPrices = asObject(product.pickup_prices ?? product.pickupPrices);
    const batteriesFor = (variationId: string | null, fallback: unknown, condition: string) => {
      if (condition === 'new') return [];
      const list = productUnits
        .filter((unit) => unit.variationId === variationId && unit.free > 0 && unit.battery !== null)
        .map((unit) => num(unit.battery));
      const unique = [...new Set(list.length ? list : fallback === null || fallback === undefined || fallback === '' ? [] : [num(fallback)])];
      return unique.filter((value) => value > 0 && value <= 100).sort((a, b) => b - a);
    };
    /** Em estoque, sob encomenda (com o preço de encomenda) ou esgotada. */
    const availabilityOf = (qty: number, basePrice: number, prices: Record<string, any>) => {
      if (qty > 0) return { availability: 'in_stock' as const, price: basePrice, leadDays: null };
      const byOrder = orderPrice(orderMethod, prices, basePrice);
      if (byOrder !== null) return { availability: 'order' as const, price: byOrder, leadDays: orderMethod!.leadDays };
      return { availability: 'sold_out' as const, price: basePrice, leadDays: null };
    };

    const variations = asArray(product.variations);
    let variants: CatalogVariant[];
    if (variations.length) {
      variants = variations.map((variation: any) => {
        const attrs = Object.entries(variation.attrs ?? {}).filter(([, value]) => String(value ?? '').trim());
        const color = String(attrs.find(([attrId]) => isColor(attrId))?.[1] ?? '');
        const capacity = String(attrs.find(([attrId]) => isCapacity(attrId))?.[1] ?? '');
        const others = attrs.filter(([attrId]) => !isColor(attrId) && !isCapacity(attrId)).map(([, value]) => String(value));
        const code = conditionCode(variation.condition) || 'new';
        const condition = CONDITION_LABEL[code] ?? 'Novo';
        const qty = Math.max(0, num(variation.qty));
        const state = availabilityOf(qty, num(variation.price) || num(product.price), ownPrices(asObject(variation.pickupPrices ?? variation.pickup_prices), productPrices));
        return {
          attributes: [
            ...attrs.map(([attrId, value]) => ({ id: attrId, name: attrName.get(attrId) ?? attrId, value: String(value) })),
            { id: '__condition', name: 'Condição', value: condition },
          ],
          label: [color, capacity, ...others].filter(Boolean).join(' · '),
          color,
          capacity,
          others,
          condition,
          batteries: state.availability === 'in_stock' ? batteriesFor(variation.id ? String(variation.id) : null, variation.batteryLevel ?? variation.battery_level, code) : [],
          price: state.price,
          available: qty,
          availability: state.availability,
          leadDays: state.leadDays,
        };
      });
    } else {
      const code = conditionCode(product.condition) || 'new';
      const qty = Math.max(0, num(product.qty));
      const state = availabilityOf(qty, num(product.price), productPrices);
      variants = [
        {
          attributes: [],
          label: [product.color, product.capacity].filter(Boolean).join(' · '),
          color: String(product.color ?? ''),
          capacity: String(product.capacity ?? ''),
          others: [],
          condition: CONDITION_LABEL[code] ?? 'Novo',
          batteries: state.availability === 'in_stock' ? batteriesFor(null, product.battery_level ?? product.batteryLevel, code) : [],
          price: state.price,
          available: qty,
          availability: state.availability,
          leadDays: state.leadDays,
        },
      ];
    }
    if (options.hideSoldOut) variants = variants.filter((variant) => variant.availability !== 'sold_out');

    const open = variants.filter((variant) => variant.availability !== 'sold_out');
    const soldOut = open.length === 0;
    if (soldOut && options.hideSoldOut) continue;
    const priced = (open.length ? open : variants).map((variant) => variant.price).filter((price) => price > 0);
    const price = priced.length ? Math.min(...priced) : num(product.price);
    const conditions = [...new Set(variants.map((variant) => variant.condition))];
    const createdAt = product.created_at ? new Date(product.created_at).getTime() : 0;
    const single = variants.length === 1 && !variants[0].label && !variants[0].batteries.length;
    items.push({
      id: String(product.id),
      name: String(product.name ?? ''),
      brand: String(product.brand ?? ''),
      image: httpsImage(asArray(product.images)[0]),
      price,
      priceFrom: new Set(priced).size > 1,
      condition: conditions.length === 1 ? conditions[0] : '',
      // Produto sem grade: a "variação" única só aparece quando tem algo a dizer (cor, bateria, encomenda).
      variants: single && variants[0].availability === 'in_stock' ? [] : variants,
      isNew: createdAt > 0 && now - createdAt < NEW_DAYS * 86400000,
      soldOut,
      orderOnly: !soldOut && open.every((variant) => variant.availability === 'order'),
      videoUrl: /^https:\/\//i.test(String(product.video_url ?? '')) ? String(product.video_url) : '',
      specs: asArray(product.specs)
        .map((line: any) => ({ label: String(line?.label ?? '').trim(), value: String(line?.value ?? '').trim() }))
        .filter((line) => line.label && line.value),
    });
  }
  return items;
}

/** Chave da variação (para o pedido do cliente achar a mesma variação com o preço atual). */
export const variantKey = (attributes: Array<{ id: string; value: string }>) =>
  attributes
    .map((attr) => `${attr.id}=${String(attr.value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '')}`)
    .sort()
    .join('|');
