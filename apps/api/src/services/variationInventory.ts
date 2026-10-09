import type {PoolClient} from 'pg';
import {attributeValueKey} from './attributeValues.js';
import {CONDITION_ATTR_ID,conditionCode,conditionMatches} from './productCondition.js';
/** Mesma cor/capacidade mesmo escrita diferente ("128GB" x "128 GB"). */
const sameAttributeValue=(a:unknown,b:unknown)=>attributeValueKey(a==null?'':String(a))===attributeValueKey(b==null?'':String(b));
export async function changeVariationQuantity(db:Pick<PoolClient,'query'>,storeId:string,stockId:string,attributes:{id:string;value:string}[],delta:number){
 const stock=(await db.query('SELECT variations FROM stock_items WHERE id=$1 AND store_id=$2 FOR UPDATE',[stockId,storeId])).rows[0];
 const variations=Array.isArray(stock?.variations)?stock.variations:[];if(!variations.length)return;
 const picked=Object.fromEntries((attributes??[]).map(a=>[a.id,a.value]));
 const sameAttrs=(v:any)=>Object.entries(v.attrs??{}).every(([id,value])=>sameAttributeValue(picked[id],value));
 // Mesma cor/capacidade em condições diferentes (novo x usado): sem a condição não dá para saber qual sai.
 const conditions=new Set(variations.filter(sameAttrs).map((v:any)=>conditionCode(v.condition)||'new'));
 if(conditions.size>1&&!conditionCode(picked[CONDITION_ATTR_ID]))throw Object.assign(new Error('Este produto tem novo e usado nessa cor/capacidade. Escolha a condição.'),{status:400});
 const index=variations.findIndex((v:any)=>sameAttrs(v)&&conditionMatches(v,picked));
 if(index<0)throw Object.assign(new Error('Grade da venda não encontrada no produto.'),{status:400});
 const variation=variations[index];const qty=Number(variation.qty)+delta;
 if(qty<0)throw Object.assign(new Error('Estoque insuficiente nesta grade de variação.'),{status:400});
 variations[index]={...variation,qty};
 await db.query('UPDATE stock_items SET variations=$3::jsonb,updated_at=now() WHERE id=$1 AND store_id=$2',[stockId,storeId,JSON.stringify(variations)]);
 if(variation.id)await db.query('UPDATE stock_item_variations SET qty=$4 WHERE store_id=$1 AND stock_item_id=$2 AND id=$3',[storeId,stockId,variation.id,qty]);
}
