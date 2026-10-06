import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup() {
  const window = new EventTarget();
  const document = {hidden:false};
  let poll, cleared = false;
  window.setInterval = callback => {poll=callback;return 1;};
  window.clearInterval = () => {cleared=true;};
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('apps/web/src/data/totemLiveSync.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const stubs = {
    './adminStore': {ADMIN_STATE_EVENT:'admin',STOCK_EVENT:'stock',invalidateAdminMemory(){}},
    './attributeStore': {ATTRIBUTES_EVENT:'attributes'},
    './totemSettings': {TOTEM_SETTINGS_EVENT:'settings',invalidateTotemSettingsMemory(){}},
  };
  vm.runInNewContext(code,{exports,require:path=>stubs[path],window,document,Event,Promise});
  return {window,document,subscribe:exports.subscribeTotemLive,poll:()=>poll(),cleared:()=>cleared};
}

test('API hydration events cannot recursively restart refresh or overlap an outstanding request',async()=>{
  const env=setup();let calls=0,release;
  const stop=env.subscribe(()=>{calls++;env.window.dispatchEvent(new Event('settings'));return new Promise(resolve=>{release=resolve;});});
  env.window.dispatchEvent(new Event('stock'));
  env.window.dispatchEvent(new Event('attributes'));
  env.poll();assert.equal(calls,1);
  release();await new Promise(setImmediate);
  env.window.dispatchEvent(new Event('stock'));assert.equal(calls,2);
  release();stop();
});

test('background tabs skip polling and cleanup removes timers and listeners',async()=>{
  const env=setup();let calls=0;
  const stop=env.subscribe(()=>{calls++;});
  env.document.hidden=true;env.poll();assert.equal(calls,0);
  env.document.hidden=false;env.poll();assert.equal(calls,1);
  await new Promise(setImmediate);stop();
  env.window.dispatchEvent(new Event('stock'));env.poll();
  assert.equal(calls,1);assert.equal(env.cleared(),true);
});

test('store scoped storage changes refresh the visible kiosk',()=>{
  const env=setup();let calls=0;const stop=env.subscribe(()=>{calls++;});
  const event=new Event('storage');Object.defineProperty(event,'key',{value:'marthi.totem.settings.v1:account:store:a'});
  env.window.dispatchEvent(event);assert.equal(calls,1);stop();
});
