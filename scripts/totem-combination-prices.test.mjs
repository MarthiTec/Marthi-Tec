import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quoteTotemCombination} from '../dist/services/totemCombination.js';

test('server honors inherited pickup prices and rejects unpriced combinations',async()=>{
 const stock={price:0,qty:0,pickup_prices:{hand:7500,delivery:0},variations:[{attrs:{color:'Orange'},price:7500,qty:1}]};
 const db={query:async()=>({rows:[stock]})};
 assert.equal((await quoteTotemCombination(db,'store','phone',{id:'hand',kind:'immediate'},[{id:'color',value:'Orange'}])).unitPrice,7500);
 await assert.rejects(()=>quoteTotemCombination(db,'store','phone',{id:'delivery',kind:'delivery'},[{id:'color',value:'Orange'}]),/combinação/);
 await assert.rejects(()=>quoteTotemCombination(db,'store','phone',{id:'hand',kind:'immediate'},[{id:'color',value:'Silver'}]),/combinação/);
 stock.variations[0].pickupPrices={hand:7600};
 assert.equal((await quoteTotemCombination(db,'store','phone',{id:'hand',kind:'immediate'},[{id:'color',value:'Orange'}])).unitPrice,7600);
});
