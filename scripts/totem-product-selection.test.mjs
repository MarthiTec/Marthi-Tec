import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const cjs=(file,ctx)=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,...ctx});return exports;};
const condition=cjs('apps/web/src/data/productCondition.ts');
const exports=cjs('apps/web/src/data/productPickup.ts',{require:(name)=>name==='./productCondition'?condition:{}});
const methods=[{id:'hand',kind:'immediate',active:true},{id:'order',kind:'order',active:true},{id:'delivery',kind:'delivery',active:true}];
test('only configured positive pickup prices appear, with immediate collection for legacy rows',()=>{
 assert.deepEqual(Array.from(exports.productPickupMethods(methods,{price:7500}),m=>m.id),['hand']);
 assert.deepEqual(Array.from(exports.productPickupMethods(methods,{price:7500,pickupPrices:{hand:7500,order:null,delivery:0}}),m=>m.id),['hand']);
 assert.deepEqual(Array.from(exports.productPickupMethods(methods,{price:0,pickupPrices:{order:7000}}),m=>m.id),['order']);
});
test('changing an attribute completes a real variation without reverting the customer choice',()=>{
 const stock={variations:[{attrs:{color:'Orange',capacity:'256'},price:7500},{attrs:{color:'Silver',capacity:'512'},price:8000},{attrs:{color:'Silver',capacity:'256'},price:0}]};
 const next=exports.selectProductVariation(stock,{color:'Silver',capacity:'256'},'color');
 assert.equal(next.attrs.color,'Silver');assert.equal(next.attrs.capacity,'512');assert.equal(next.price,8000);
 assert.equal(exports.selectProductVariation(stock,{color:'Silver',capacity:'256'},'capacity').attrs.color,'Orange');
});
test('guided brands require stock or an explicitly priced order variation',()=>{
 assert.equal(exports.productAvailableForTotem(methods,{qty:0,price:7500}),false);
 assert.equal(exports.productAvailableForTotem(methods,{qty:1,price:7500}),true);
 assert.equal(exports.productAvailableForTotem(methods,{qty:0,price:0,variations:[{qty:0,price:0,pickupPrices:{order:7000}}]}),true);
});
