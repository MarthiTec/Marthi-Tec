import type {StockItem,StockVariationRow} from './adminStore';
import type {PickupMethod} from './pickup';
import {CONDITION_ATTR_ID,conditionCode} from './productCondition';

/** Empty legacy price maps mean the base price for immediate collection only. */
export function productPickupMethods(methods:PickupMethod[],stock:StockItem|null,variation?:StockVariationRow) {
  const prices=variation?.pickupPrices ?? stock?.pickupPrices ?? {};
  const explicit=variation?.pickupMethodId;
  const basePrice=variation?.price ?? stock?.price ?? 0;
  return methods.filter(method=>method.active && (explicit ? method.id===explicit : Object.keys(prices).length ? Object.hasOwn(prices,method.id) && prices[method.id]!==null : method.kind==='immediate') && Number(prices[method.id] ?? basePrice)>0);
}

/** "128GB" e "128 GB" (ou maiúsculas/minúsculas) são o mesmo valor de atributo. */
const valueKey=(value:unknown)=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,'');
const sameValue=(a:unknown,b:unknown)=>valueKey(a)===valueKey(b);

/**
 * Preserve the changed attribute while completing a real, priced combination. A condição escolhida
 * (novo/usado) conta como mais um atributo quando a grade tem condições diferentes.
 */
export function selectProductVariation(stock:StockItem|undefined,config:Record<string,string>,changedId?:string) {
  const valid=stock?.variations?.filter(v=>Number(v.price)>0 || Object.values(v.pickupPrices??{}).some(price=>Number(price)>0)) ?? [];
  const wantedCondition=conditionCode(config[CONDITION_ATTR_ID]);
  const sameCondition=(v:StockVariationRow)=>!wantedCondition||(conditionCode(v.condition)||'new')===wantedCondition;
  const candidates=changedId===CONDITION_ATTR_ID?valid.filter(sameCondition):changedId?valid.filter(v=>sameValue(v.attrs[changedId],config[changedId])):valid;
  return candidates.map(v=>({v,score:Object.entries(v.attrs).filter(([id,value])=>sameValue(config[id],value)).length+(wantedCondition&&sameCondition(v)?1:0)}))
    .sort((a,b)=>b.score-a.score)[0]?.v ?? valid[0];
}

export function productAvailableForTotem(methods:PickupMethod[],stock:StockItem|undefined) {
  if(!stock) return false;
  const variations=stock.variations?.length?stock.variations:[undefined];
  return variations.some(variation=>productPickupMethods(methods,stock,variation).some(method=>method.kind==='order'||Number(variation?.qty??stock.qty)>0));
}

type SaleStock = { price: number; pickupPrices?: Record<string, number | null>; variations?: StockVariationRow[] };

/**
 * Produto como a venda enxerga: com cor/capacidade escolhidas, valem o preço e os preços por tipo
 * de retirada daquela variação (ex.: em mãos 7.500, sob encomenda 7.300).
 */
export function saleLinePickupProduct<T extends SaleStock>(stock: T | undefined, attributes: { id: string; value: string }[] = []): T | undefined {
  if (!stock?.variations?.length) return stock;
  const variation = selectProductVariation(stock as unknown as StockItem, Object.fromEntries(attributes.map((attr) => [attr.id, attr.value])));
  if (!variation) return stock;
  const pickupPrices = variation.pickupMethodId ? { [variation.pickupMethodId]: variation.price } : variation.pickupPrices ?? {};
  return { ...stock, price: variation.price, pickupPrices };
}

/** Preço unitário da linha para a variação e o tipo de retirada escolhidos. */
export function saleLineUnitPrice(stock: SaleStock | undefined, attributes: { id: string; value: string }[] = [], pickupMethodId?: string) {
  const product = saleLinePickupProduct(stock, attributes);
  if (!product) return undefined;
  const byMethod = pickupMethodId ? product.pickupPrices?.[pickupMethodId] : undefined;
  return byMethod !== undefined && byMethod !== null && Number(byMethod) > 0 ? Number(byMethod) : Number(product.price) || 0;
}
