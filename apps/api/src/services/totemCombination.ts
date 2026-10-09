import type {PoolClient} from 'pg';
import {attributeValueKey} from './attributeValues.js';
import {CONDITION_ATTR_ID,conditionMatches} from './productCondition.js';
/** Mesma cor/capacidade mesmo escrita diferente ("128GB" x "128 GB"). */
const sameAttributeValue=(a:unknown,b:unknown)=>attributeValueKey(a==null?'':String(a))===attributeValueKey(b==null?'':String(b));

const methodPrice=(prices:Record<string,unknown>|null|undefined,methodId:string)=>{
 const value=prices?.[methodId];
 return value===null||value===undefined?null:Number(value);
};

/**
 * Preço e disponibilidade de um produto (e da variação escolhida) para um tipo de retirada.
 * No totem o cliente só escolhe combinações que existem. Na venda do vendedor (`fromSale`), uma
 * encomenda pode ser de uma cor/capacidade que a loja ainda não tem cadastrada: vale o preço de
 * encomenda do produto (ou o menor das variações), sem travar a venda.
 */
export async function quoteTotemCombination(db:Pick<PoolClient,'query'>,storeId:string,stockId:string,method:any,attributes:{id:string;value:string}[]=[],fromSale=false){
 const stock=(await db.query('SELECT price,qty,variations,pickup_prices,card_rate FROM stock_items WHERE id=$1 AND store_id=$2 AND active=true',[stockId,storeId])).rows[0];
 if(!stock)throw Object.assign(new Error('Produto indisponível.'),{status:404});
 const picked=Object.fromEntries(attributes.map(a=>[a.id,a.value]));
 const variations=Array.isArray(stock.variations)?stock.variations:[];
 const candidates=variations.length?variations.filter((v:any)=>Object.entries(v.attrs??{}).every(([id,value])=>sameAttributeValue(picked[id],value))&&conditionMatches(v,picked)):[stock];
 const candidate=candidates.find((v:any)=>{
   const explicit=v.pickupMethodId ?? v.pickup_method_id;
   const prices=v.pickupPrices ?? v.pickup_prices ?? stock.pickup_prices ?? {};
   const available=explicit?explicit===method.id:Object.keys(prices).length?Object.hasOwn(prices,method.id)&&prices[method.id]!==null:method.kind==='immediate';
   return available && Number(prices[method.id]??v.price)>0 && (method.kind==='order'||Number(v.qty)>0);
 });
 if(!candidate&&fromSale&&method.kind==='order'){
  const fromProduct=methodPrice(stock.pickup_prices,method.id);
  const fromVariations=variations.map((v:any)=>methodPrice(v.pickupPrices??v.pickup_prices,method.id)??(Number(v.price)||null)).filter((p:any):p is number=>Number(p)>0);
  const unitPrice=fromProduct&&fromProduct>0?fromProduct:fromVariations.length?Math.min(...fromVariations):Number(stock.price);
  if(unitPrice>0)return {...method,unitPrice,qty:0,cardRate:stock.card_rate};
 }
 if(!candidate){
  const wanted=attributes.filter(a=>a.id!==CONDITION_ATTR_ID).map(a=>a.value).concat(attributes.filter(a=>a.id===CONDITION_ATTR_ID).map(a=>a.value)).filter(Boolean).join(' / ');
  const message=fromSale&&method.kind!=='order'&&candidates.length===0&&wanted
   ? `Não há ${wanted} em estoque para entrega imediata. Escolha "Sob encomenda" ou cadastre essa variação no produto.`
   : 'Esta combinação de atributos, retirada e preço não está disponível. Escolha uma variação válida.';
  throw Object.assign(new Error(message),{status:400});
 }
 const prices=candidate.pickupPrices??candidate.pickup_prices??stock.pickup_prices??{};
 return {...method,unitPrice:Number(prices[method.id]??candidate.price),qty:Number(candidate.qty),cardRate:candidate.cardRate??candidate.card_rate??stock.card_rate};
}
