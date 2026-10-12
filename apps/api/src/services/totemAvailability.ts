/**
 * O que o totem pode oferecer: produto (ou variação) com estoque numa retirada ativa, ou com
 * "Sob encomenda" habilitado. Sem estoque e só "Em mãos"/"Delivery", não aparece no totem.
 * Mesma regra de productPickupMethods/productAvailableForTotem na tela do totem.
 */
export type TotemPickupMethod = { id: string; kind: string };

type PricedRow = {
  price?: number;
  qty?: number;
  pickupPrices?: Record<string, number | null>;
  pickupMethodId?: string | null;
};

type TotemRow = PricedRow & { variations?: PricedRow[] };

/** Retiradas da variação (ou do produto): mapa vazio = preço base, só "Em mãos" (cadastro antigo). */
function pickupMethodsFor(methods: TotemPickupMethod[], item: TotemRow, variation?: PricedRow) {
  const prices = variation?.pickupPrices ?? item.pickupPrices ?? {};
  const explicit = variation?.pickupMethodId;
  const basePrice = Number(variation?.price ?? item.price ?? 0);
  return methods.filter((method) => {
    const offered = explicit
      ? method.id === explicit
      : Object.keys(prices).length
        ? Object.hasOwn(prices, method.id) && prices[method.id] !== null
        : method.kind === 'immediate';
    return offered && Number(prices[method.id] ?? basePrice) > 0;
  });
}

function availableOnTotem(methods: TotemPickupMethod[], item: TotemRow, variation?: PricedRow) {
  const qty = Number(variation ? variation.qty : item.qty) || 0;
  return pickupMethodsFor(methods, item, variation).some((method) => method.kind === 'order' || qty > 0);
}

/** Produto como o totem deve vê-lo: só as variações disponíveis; null quando nada está disponível. */
export function totemVisibleStock<T extends TotemRow>(methods: TotemPickupMethod[], item: T): T | null {
  if (item.variations?.length) {
    const variations = item.variations.filter((variation) => availableOnTotem(methods, item, variation));
    return variations.length ? { ...item, variations } : null;
  }
  return availableOnTotem(methods, item) ? item : null;
}
