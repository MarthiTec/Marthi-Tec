import type {StockItem,StockVariationRow} from './adminStore';
import type {PickupMethod} from './pickup';

/** Empty legacy price maps mean the base price for immediate collection only. */
export function productPickupMethods(methods:PickupMethod[],stock:StockItem|null,variation?:StockVariationRow) {
  const prices=variation?.pickupPrices ?? stock?.pickupPrices ?? {};
  const explicit=variation?.pickupMethodId;
  const basePrice=variation?.price ?? stock?.price ?? 0;
  return methods.filter(method=>method.active && (explicit ? method.id===explicit : Object.keys(prices).length ? Object.hasOwn(prices,method.id) && prices[method.id]!==null : method.kind==='immediate') && Number(prices[method.id] ?? basePrice)>0);
}

/** Preserve the changed attribute while completing a real, priced combination. */
export function selectProductVariation(stock:StockItem|undefined,config:Record<string,string>,changedId?:string) {
  const valid=stock?.variations?.filter(v=>Number(v.price)>0 || Object.values(v.pickupPrices??{}).some(price=>Number(price)>0)) ?? [];
  const candidates=changedId?valid.filter(v=>v.attrs[changedId]===config[changedId]):valid;
  return candidates.map(v=>({v,score:Object.entries(v.attrs).filter(([id,value])=>config[id]===value).length}))
    .sort((a,b)=>b.score-a.score)[0]?.v ?? valid[0];
}

export function productAvailableForTotem(methods:PickupMethod[],stock:StockItem|undefined) {
  if(!stock) return false;
  const variations=stock.variations?.length?stock.variations:[undefined];
  return variations.some(variation=>productPickupMethods(methods,stock,variation).some(method=>method.kind==='order'||Number(variation?.qty??stock.qty)>0));
}
