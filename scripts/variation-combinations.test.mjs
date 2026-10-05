import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync('apps/web/src/data/variationCombinations.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildVariationCombinations}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('creates every color capacity and pickup combination without duplicates',()=>{
 const rows=buildVariationCombinations([{id:'color',values:['Laranja','Azul','Laranja']},{id:'capacity',values:['256 GB','512 GB']},{id:'pickup',values:['Em mao','Por encomenda']}]);
 assert.equal(rows.length,8);
 assert.deepEqual(rows[0],{color:'Laranja',capacity:'256 GB',pickup:'Em mao'});
 assert.ok(rows.some(r=>r.color==='Laranja'&&r.capacity==='512 GB'&&r.pickup==='Em mao'));
 assert.equal(new Set(rows.map(r=>JSON.stringify(r))).size,8);
 rows.splice(0,1);assert.equal(rows.length,7);
});
test('rejects incomplete attributes and excessive combinations',()=>{
 assert.throws(()=>buildVariationCombinations([{id:'color',values:[]} ]));
 assert.throws(()=>buildVariationCombinations([{id:'color',values:Array.from({length:501},(_,i)=>String(i))}]));
 assert.deepEqual(buildVariationCombinations([]),[]);
});
