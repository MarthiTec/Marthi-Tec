import type {PoolClient} from 'pg';
export async function quoteTotemCombination(db:Pick<PoolClient,'query'>,storeId:string,stockId:string,method:any,attributes:{id:string;value:string}[]=[]){
 const stock=(await db.query('SELECT price,qty,variations,pickup_prices FROM stock_items WHERE id=$1 AND store_id=$2 AND active=true',[stockId,storeId])).rows[0];
 if(!stock)throw Object.assign(new Error('Produto indisponível.'),{status:404});
 const picked=Object.fromEntries(attributes.map(a=>[a.id,a.value]));
 const variations=Array.isArray(stock.variations)?stock.variations:[];
 const candidates=variations.length?variations.filter((v:any)=>Object.entries(v.attrs??{}).every(([id,value])=>picked[id]===value)):[stock];
 const candidate=candidates.find((v:any)=>{
   const explicit=v.pickupMethodId ?? v.pickup_method_id;
   const prices=v.pickupPrices ?? v.pickup_prices ?? stock.pickup_prices ?? {};
   const available=explicit?explicit===method.id:Object.keys(prices).length?Object.hasOwn(prices,method.id)&&prices[method.id]!==null:method.kind==='immediate';
   return available && Number(prices[method.id]??v.price)>0 && (method.kind==='order'||Number(v.qty)>0);
 });
 if(!candidate)throw Object.assign(new Error('Esta combinação de atributos, retirada e preço não está disponível. Escolha uma variação válida.'),{status:400});
 const prices=candidate.pickupPrices??candidate.pickup_prices??stock.pickup_prices??{};
 return {...method,unitPrice:Number(prices[method.id]??candidate.price),qty:Number(candidate.qty)};
}
