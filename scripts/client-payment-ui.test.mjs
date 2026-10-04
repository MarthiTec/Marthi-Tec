import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildSync} from 'esbuild';
const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
globalThis.window=Object.assign(new EventTarget(),{location:{origin:'http://payment-ui.test'}});
const {outputFiles}=buildSync({entryPoints:['apps/web/src/data/marthiClientsStore.ts'],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env':JSON.stringify({DEV:false})}});
const api=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const key='marthi.ops.clients.v2';
const customer={clientId:'real-db-customer',tradeName:'Real Customer',email:'customer@example.com',planId:'bronze',modules:['erp'],status:'active',paymentOk:false,passwordConfigured:true,monthlyAmount:0};
function reset(){storage.clear();localStorage.setItem(key,JSON.stringify({clients:[customer]}));localStorage.setItem('marthi.auth.token','test-session');}
test('API rejection includes authentication and never reports local payment success',async()=>{
 reset();const before=localStorage.getItem(key);let calls=0;
 globalThis.fetch=async(url,init)=>{calls++;assert.equal(init.headers.get('authorization'),'Bearer test-session');assert.equal(JSON.parse(init.body).protocol,customer.clientId);return new Response(JSON.stringify({success:false,error:{code:'FORBIDDEN',message:'Acesso negado'}}),{status:403});};
 const result=await api.identifyClientPaymentAndActivate(customer.clientId,{method:'pix'});
 assert.equal(result.ok,false);assert.equal(result.message,'Acesso negado');assert.equal(calls,1);assert.equal(localStorage.getItem(key),before);
});
test('success is cached only after the database confirms payment in a new read',async()=>{
 reset();let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({success:true,data:calls===1?{id:customer.clientId,status:'acesso_ativado',message:'Confirmado no banco'}:[{...customer,paymentOk:true}]}),{status:200});};
 const result=await api.identifyClientPaymentAndActivate(customer.clientId,{method:'pix'});assert.equal(result.ok,true);assert.equal(calls,2);assert.equal(JSON.parse(localStorage.getItem(key)).clients[0].paymentOk,true);assert.equal(result.client.monthlyAmount,0);
});
test('empty database response removes cached rows and never injects demo or Cell Ponto data',async()=>{
 reset();globalThis.fetch=async()=>new Response(JSON.stringify({success:true,data:[]}),{status:200});
 assert.deepEqual(await api.hydrateMarthiClientsFromApi(),[]);assert.deepEqual(api.listMarthiClients(),[]);
});
