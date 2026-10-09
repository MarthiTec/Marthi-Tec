import type { StockItem } from './adminStore';
import { CONDITION_ATTR_ID, conditionCode } from './productCondition';
import {
  getAttributes,
  stockAttributes,
  type ProductAttribute,
} from './attributeStore';
import { getTotemSettings } from './totemSettings';
import { getTotemCardRate } from './cardRatesStore';

export type VariantQuote = {
  stock: StockItem | null;
  cashPrice: number;
  qty: number;
  installmentLabel: string;
};

function namesMatch(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function totemCardFee(parcels:number) {
  const settings=getTotemSettings();
  const machine=getTotemCardRate(parcels);
  return settings.cardInstallmentRates?.[parcels] ?? (machine?.brandId ? machine.rate : settings.cardFeePercent) ?? 0;
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata o rótulo de parcelamento.
 * @param cardFeePercent Percentual de taxa de cartão a ser embutida no preço parcelado (ex.: 3.5 = 3,5%). Se omitido, usa a taxa da bandeira/maquininha padrão do Totem.
 */
export function formatInstallment(price: number, parcels = 18, cardFeePercent?: number) {
  const count = Math.max(1, parcels);
  const fee =
    cardFeePercent !== undefined && Number.isFinite(cardFeePercent)
      ? cardFeePercent
      : totemCardFee(count);
  const feeMultiplier = 1 + Math.max(0, fee) / 100;
  const adjusted = price * feeMultiplier;
  const parcel = Math.round((adjusted / count) * 100) / 100;
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
  stock: StockItem[] = [],
  attrs = stockAttributes(),
): StockItem | null {
  const rows = stock.filter((item) => namesMatch(item.name, productName));
  if (!rows.length) return null;

  const master = rows[0];
  if (master.variations && master.variations.length > 0) {
    const matchAttrs = attrs.filter((attr) => master.variations!.some((v) => v.attrs?.[attr.id]));
    const ranked = master.variations
      .map((v) => {
        let score = 0;
        // Condição escolhida (novo/usado) quando a grade tem as duas para a mesma cor/capacidade.
        const wantedCondition = conditionCode(config[CONDITION_ATTR_ID]);
        let miss = Boolean(wantedCondition) && (conditionCode(v.condition) || 'new') !== wantedCondition;
        for (const attr of matchAttrs) {
          const selected = config[attr.id];
          const stored = v.attrs?.[attr.id];
          if (!selected || !stored) continue;
          if (selected === stored) score += 1;
          else miss = true;
        }
        return { v, score, miss };
      })
      .filter((item) => !item.miss)
      .sort((a, b) => b.score - a.score || b.v.qty - a.v.qty);

    const bestVar = ranked[0]?.v;
    if (bestVar) {
      return {
        ...master,
        price: bestVar.price,
        cost: bestVar.cost,
        avgCost: bestVar.avgCost ?? bestVar.cost,
        qty: bestVar.qty,
        minQty: bestVar.minQty,
        condition: bestVar.condition,
        batteryLevel: bestVar.batteryLevel ?? null,
        cardRate: bestVar.cardRate ?? master.cardRate,
        attrs: { ...master.attrs, ...bestVar.attrs },
        barcode: bestVar.barcode || master.barcode,
        imei: bestVar.imei || master.imei,
        pickupPrices: bestVar.pickupPrices ?? master.pickupPrices,
        variations: [bestVar],
      };
    }
    return null;
  }

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
  stock: StockItem[] = [],
  cardFeePercent?: number,
): VariantQuote {
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

  // Prioridade: se o item em estoque tiver taxa específica definida (cardRate), usa ela. Senão usa o cardFeePercent fornecido ou padrão de totemSettings.
  const stockFee =
    matched?.cardRate !== undefined && matched?.cardRate !== null && Number.isFinite(Number(matched.cardRate)) && Number(matched.cardRate)>0
      ? Number(matched.cardRate)
      : undefined;

  const defaultFee =
    cardFeePercent !== undefined && Number.isFinite(cardFeePercent)
      ? cardFeePercent
      : totemCardFee(18);

  const effectiveFee = stockFee !== undefined ? stockFee : defaultFee;

  const cashPrice = Math.max(0, Math.round(price * 100) / 100);
  return {
    stock: matched,
    cashPrice,
    qty: matched?.qty ?? 0,
    installmentLabel: formatInstallment(cashPrice, 18, effectiveFee),
  };
}

export function quoteFromPicked(
  productName: string,
  fallbackPrice: number,
  picked: { id: string; value: string }[],
  stock: StockItem[] = [],
  cardFeePercent?: number,
) {
  const config = Object.fromEntries(picked.map((item) => [item.id, item.value]));
  return quoteTotemVariant(productName, fallbackPrice, config, stock, cardFeePercent);
}
