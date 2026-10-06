import type {PoolClient} from 'pg';
export async function listDayOffers(db:Pick<PoolClient,'query'>,storeId:string,channel:'totem'|'pdv'|'external'){
 const rows=(await db.query("SELECT id,name,rules FROM promo_campaigns WHERE store_id=$1 AND active=true AND rules->>'dayOffer'='true'",[storeId])).rows;
 const now=Date.now();
 return rows.map(row=>({...row.rules,id:row.id,name:row.name})).filter(offer=>offer.channels?.includes(channel)&&offer.kind==='promo_price'&&Number(offer.promoPrice)>0&&offer.endDate&&Number.isFinite(Date.parse(offer.endDate))&&Date.parse(offer.endDate)>now&&(!offer.startDate||Date.parse(offer.startDate)<=now));
}
export function matchDayOffer(offers:any[],stockId:string,attrs:Record<string,string>,basePrice:number){
 return offers.filter(offer=>offer.criteria?.stockIds?.includes(stockId)&&Object.entries(offer.criteria?.attributes??{}).every(([id,value])=>attrs[id]===value)&&Number(offer.promoPrice)<basePrice).sort((a,b)=>Number(a.promoPrice)-Number(b.promoPrice))[0]??null;
}
export async function applyDayOffersToLines(db:Pick<PoolClient,'query'>,storeId:string,lines:any[],channel:'pdv'|'external'){
 const offers=await listDayOffers(db,storeId,channel);
 for(const line of lines){if(!line.stockId)continue;const offer=matchDayOffer(offers,line.stockId,Object.fromEntries((line.attributes??[]).map((a:any)=>[a.id,a.value])),line.unitPrice);if(offer)line.unitPrice=Number(offer.promoPrice);}
}
