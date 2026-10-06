import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listDayOffers,matchDayOffer,applyDayOffersToLines} from '../dist/services/dayOffers.js';

const future=new Date(Date.now()+3600000).toISOString();
const past=new Date(Date.now()-3600000).toISOString();
const offer={id:'offer',name:'Oferta do dia',rules:{channels:['totem','pdv','external'],kind:'promo_price',promoPrice:6500,endDate:future,criteria:{stockIds:['phone'],attributes:{color:'Orange',capacity:'256'}}}};
test('offers match the chosen product and attributes and must beat its normal price',()=>{
 const data={...offer.rules,id:offer.id};
 assert.equal(matchDayOffer([data],'phone',{color:'Orange',capacity:'256'},7500).id,'offer');
 assert.equal(matchDayOffer([data],'phone',{color:'Silver',capacity:'256'},7500),null);
 assert.equal(matchDayOffer([data],'another',{color:'Orange',capacity:'256'},7500),null);
 assert.equal(matchDayOffer([data],'phone',{color:'Orange',capacity:'256'},6000),null);
});
test('expiry, start date and selected channel govern availability',async()=>{
 const db={query:async()=>({rows:[offer,{...offer,id:'expired',rules:{...offer.rules,endDate:past}},{...offer,id:'future',rules:{...offer.rules,startDate:future}},{...offer,id:'pdv-only',rules:{...offer.rules,channels:['pdv']}}]})};
 assert.deepEqual((await listDayOffers(db,'store','totem')).map(o=>o.id),['offer']);
 assert.deepEqual((await listDayOffers(db,'store','pdv')).map(o=>o.id),['offer','pdv-only']);
});
test('PDV and external sales receive the same eligible offer price',async()=>{
 const db={query:async()=>({rows:[offer]})};
 for(const channel of ['pdv','external']){
  const line={stockId:'phone',unitPrice:7500,attributes:[{id:'color',value:'Orange'},{id:'capacity',value:'256'}]};
  await applyDayOffersToLines(db,'store',[line],channel);assert.equal(line.unitPrice,6500);
 }
});
