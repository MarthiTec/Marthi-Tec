import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/src/data/totemAssistant.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
test('assistant respects the full preferred name and replaces every marker',()=>{
 assert.equal(exports.assistantText('Oi, {nome}! Sou {vendedor}. Qual marca te agrada, {nome}?','  Ana   Paula  ','Mariana'),'Oi, Ana Paula! Sou Mariana. Qual marca te agrada, Ana Paula?');
 assert.equal(exports.assistantText('Ótima escolha, {nome}!','Matheus','Mariana'),'Ótima escolha, Matheus!');
});
