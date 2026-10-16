/**
 * Cotação avançada: compara as ofertas dos fornecedores para o mesmo aparelho e aponta a melhor compra
 * (preço, prazo, parcelamento, novo/usado e bateria, procedência), com os prós e contras de cada uma.
 */
export type OfferCondition = 'new' | 'used' | 'refurbished';

export type SupplierOffer = {
  id: string;
  supplierId: string;
  supplierName: string;
  model: string;
  condition: OfferCondition;
  batteryLevel: number | null;
  capacities: string[];
  colors: string[];
  price: number;
  deliveryDays: number;
  maxInstallments: number;
  installmentFeePercent: number;
  origin: string;
  warranty: string;
  notes: string;
  /** Dia da cotação (aaaa-mm-dd). */
  quotedAt: string;
};

export type OfferFilter = { model: string; capacity?: string; color?: string; condition?: 'any' | OfferCondition };

export type StockUnit = { name: string; capacity: string; color: string; condition: OfferCondition; batteryLevel: number | null; qty: number; price: number };

export type RankedOffer = {
  offer: SupplierOffer;
  score: number;
  pros: string[];
  cons: string[];
  /** Dias desde a cotação (preço antigo precisa ser confirmado). */
  ageDays: number;
  /** Melhor compra entre as ofertas do mesmo estado (novo, usado ou recondicionado). */
  best: boolean;
};

/** Mesmo nome de aparelho/atributo, sem diferença de maiúsculas, acentos e espaços. */
export const sameText = (a: unknown, b: unknown) => key(a) === key(b);
const key = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '');
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const CONDITION_LABEL: Record<OfferCondition, string> = { new: 'Novo', used: 'Usado', refurbished: 'Recondicionado' };
export const conditionLabel = (condition: OfferCondition) => CONDITION_LABEL[condition] ?? condition;

const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from.slice(0, 10) + 'T12:00:00Z')) / 86400000));

/** Ofertas do aparelho procurado que atendem a capacidade, a cor e a condição pedidas. */
export function matchingOffers(offers: SupplierOffer[], filter: OfferFilter) {
  return offers.filter((offer) => {
    if (!sameText(offer.model, filter.model)) return false;
    if (filter.condition && filter.condition !== 'any' && offer.condition !== filter.condition) return false;
    if (filter.capacity && offer.capacities.length && !offer.capacities.some((value) => sameText(value, filter.capacity))) return false;
    if (filter.color && offer.colors.length && !offer.colors.some((value) => sameText(value, filter.color))) return false;
    return true;
  });
}

/** Unidades que a loja já tem do aparelho procurado (vender o do estoque antes de comprar outro). */
export function matchingStock(units: StockUnit[], filter: OfferFilter) {
  return units.filter(
    (unit) =>
      unit.qty > 0 &&
      sameText(unit.name, filter.model) &&
      (!filter.capacity || sameText(unit.capacity, filter.capacity)) &&
      (!filter.color || sameText(unit.color, filter.color)) &&
      (!filter.condition || filter.condition === 'any' || unit.condition === filter.condition),
  );
}

/** Cada 1% acima do menor preço tira 5% da nota de preço; cada dia de espera tira 10% da nota de prazo. */
const priceScore = (price: number, minPrice: number) => Math.max(0, 1 - 5 * (price / minPrice - 1));
const deliveryScore = (days: number) => Math.max(0, 1 - days / 10);
const conditionScore = (offer: SupplierOffer) =>
  offer.condition === 'new' ? 1 : offer.condition === 'refurbished' ? 0.8 : Math.min(1, Math.max(0, (offer.batteryLevel ?? 70) / 100));
const RISKY = /import|vitrine|cpo|swap|paraguai|usa|eua/i;

const CONDITION_ORDER: OfferCondition[] = ['new', 'refurbished', 'used'];
const GROUP_LABEL: Record<OfferCondition, string> = { new: 'os novos', used: 'os usados', refurbished: 'os recondicionados' };

/**
 * Ordena da melhor para a pior compra e explica os prós e contras de cada oferta. Preço e prazo são
 * comparados só entre ofertas do mesmo estado: um usado mais barato não "ganha" de um lacrado.
 */
export function rankOffers(offers: SupplierOffer[], filter: OfferFilter, today: string): RankedOffer[] {
  if (!offers.length) return [];
  const mixed = new Set(offers.map((offer) => offer.condition)).size > 1;
  const groups = new Map(
    CONDITION_ORDER.map((condition) => {
      const group = offers.filter((offer) => offer.condition === condition);
      return [condition, { size: group.length, minPrice: Math.min(...group.map((o) => o.price)), maxPrice: Math.max(...group.map((o) => o.price)), minDays: Math.min(...group.map((o) => o.deliveryDays)) }];
    }),
  );

  const ranked = offers
    .map((offer) => {
      const pros: string[] = [];
      const cons: string[] = [];
      const ageDays = daysBetween(offer.quotedAt, today);
      const { size, minPrice, maxPrice, minDays } = groups.get(offer.condition)!;
      const among = mixed ? ` entre ${GROUP_LABEL[offer.condition]}` : '';

      if (size > 1 && offer.price === minPrice) pros.push(`Menor preço${among}${maxPrice > minPrice ? ` (${money(maxPrice - minPrice)} a menos que o mais caro)` : ''}`);
      else if (offer.price > minPrice) cons.push(`${money(offer.price - minPrice)} mais caro que o menor preço${among}`);

      if (offer.deliveryDays === 0) pros.push('Pronta entrega');
      else if (size > 1 && offer.deliveryDays === minDays) pros.push(`Entrega mais rápida (${offer.deliveryDays} ${offer.deliveryDays === 1 ? 'dia' : 'dias'})`);
      else cons.push(`Entrega em ${offer.deliveryDays} ${offer.deliveryDays === 1 ? 'dia' : 'dias'}`);

      if (offer.maxInstallments > 1) pros.push(`Fornecedor parcela em até ${offer.maxInstallments}x${offer.installmentFeePercent > 0 ? ` (${offer.installmentFeePercent}% de juros)` : ' sem juros'}`);
      else cons.push('Fornecedor só à vista');

      if (offer.condition === 'new') pros.push('Novo (lacrado)');
      else if (offer.batteryLevel == null) cons.push(`${conditionLabel(offer.condition)} sem a bateria informada`);
      else if (offer.batteryLevel >= 90) pros.push(`${conditionLabel(offer.condition)} com bateria ${offer.batteryLevel}%`);
      else cons.push(`${conditionLabel(offer.condition)} com bateria ${offer.batteryLevel}%${offer.batteryLevel < 80 ? ': o cliente pode reclamar' : ''}`);

      if (!offer.origin.trim()) cons.push('Procedência não informada');
      else if (RISKY.test(offer.origin)) cons.push(`Procedência: ${offer.origin} (confira garantia e Anatel)`);
      else pros.push(`Procedência: ${offer.origin}`);

      if (offer.warranty.trim()) pros.push(`Garantia: ${offer.warranty}`);
      if (filter.capacity && offer.capacities.some((value) => sameText(value, filter.capacity))) pros.push(`Tem ${filter.capacity}`);
      if (filter.color && offer.colors.some((value) => sameText(value, filter.color))) pros.push(`Tem na cor ${filter.color}`);
      if ((filter.capacity && !offer.capacities.length) || (filter.color && !offer.colors.length)) cons.push('Cores/capacidades não informadas: confirme antes');
      if (ageDays > 0) cons.push(`Preço de ${ageDays} ${ageDays === 1 ? 'dia' : 'dias'} atrás: confirme com o fornecedor`);

      const score =
        0.5 * priceScore(offer.price, minPrice) +
        0.2 * deliveryScore(offer.deliveryDays) +
        0.15 * conditionScore(offer) +
        0.1 * (Math.min(offer.maxInstallments, 12) / 12) +
        0.05 * (ageDays === 0 ? 1 : ageDays === 1 ? 0.6 : 0.3) -
        (RISKY.test(offer.origin) ? 0.15 : 0);
      return { offer, score: Math.round(score * 1000) / 1000, pros, cons, ageDays, best: false };
    })
    .sort(
      (a, b) =>
        CONDITION_ORDER.indexOf(a.offer.condition) - CONDITION_ORDER.indexOf(b.offer.condition) || b.score - a.score || a.offer.price - b.offer.price,
    );
  for (const condition of CONDITION_ORDER) {
    const top = ranked.find((item) => item.offer.condition === condition);
    if (top) top.best = true;
  }
  return ranked;
}

/** Texto curto da recomendação: vender do estoque, ou de qual fornecedor comprar e por quê. */
export function purchaseAdvice(ranked: RankedOffer[], stock: StockUnit[]) {
  if (stock.length) {
    const qty = stock.reduce((total, unit) => total + unit.qty, 0);
    const best = ranked[0];
    return `Você já tem ${qty} ${qty === 1 ? 'unidade' : 'unidades'} em estoque: venda a do estoque antes de comprar${best ? ` (se precisar de outra, a melhor compra é ${best.offer.supplierName})` : ''}.`;
  }
  if (!ranked.length) return 'Nenhuma oferta para este aparelho: cadastre as cotações dos fornecedores.';
  const bests = ranked.filter((item) => item.best);
  if (bests.length > 1) {
    return bests.map((item) => `${conditionLabel(item.offer.condition)}: ${item.offer.supplierName} por ${money(item.offer.price)}`).join(' · ') + '.';
  }
  const [best] = bests;
  return `Melhor compra: ${best.offer.supplierName} por ${money(best.offer.price)} · ${best.pros.slice(0, 3).join(' · ') || 'melhor equilíbrio entre preço e prazo'}.`;
}
