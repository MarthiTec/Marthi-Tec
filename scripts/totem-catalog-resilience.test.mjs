import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('transient catalog failure preserves verified stock; store changes and access revocation never reuse it',async()=>{
  let scope='a',failure;
  const exports={};
  const row={id:'real',name:'Real phone',qty:3,price:0,showOnTotem:true,images:['photo.webp'],variations:[{attrs:{'ATTR-COR':'Prateado','ATTR-CAP':'256GB'},price:0,qty:1},{attrs:{'ATTR-COR':'Laranja','ATTR-CAP':'256GB'},price:7500,qty:1}]};
  const stubs={
    '../../data/adminStore':{stockItemImages:item=>item?.images||[]},
    '../../data/attributeStore':{ATTR_COR:'ATTR-COR',ATTR_CAP:'ATTR-CAP'},
    '../../data/variantQuote':{formatInstallment:()=>''},
    '../../data/totemSettings':{getTotemSettings:()=>({cardFeePercent:0})},
    '../../services/erpApi':{apiGetTotemCatalog:async()=>{if(failure)throw failure;return [row];}},
    '../../data/storeCache':{storeScopedKey:()=>scope},
    './totemData':{},
  };
  const code=ts.transpileModule(fs.readFileSync('apps/web/src/pages/totem/totemCatalog.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:key=>stubs[key]});
  const first=await exports.loadTotemCatalog();
  assert.deepEqual(Array.from(first[0].attrs['ATTR-COR']),['Laranja']);
  assert.equal(first[0].cashPrice,7500);
  failure=Object.assign(new Error('Unavailable'),{status:503});
  await assert.rejects(exports.loadTotemCatalog());
  assert.equal(exports.listTotemStock()[0].id,'real');
  scope='b';assert.equal(exports.listTotemStock().length,0);
  scope='a';failure=Object.assign(new Error('Denied'),{status:403});
  await assert.rejects(exports.loadTotemCatalog());
  assert.equal(exports.listTotemStock().length,0);
});
