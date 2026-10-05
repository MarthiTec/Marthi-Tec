import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';


process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
const db = new PGlite();
for (const file of fs.readdirSync('apps/api/src/db/migrations').filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(`apps/api/src/db/migrations/${file}`, 'utf8'));
}
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const { createSessionToken } = await import('../dist/services/authService.js');
const query = async (sql, args = []) => { const result = await db.query(sql, args); return { ...result, rowCount: result.affectedRows ?? result.rows.length }; };
pool.query = query;
pool.connect = async () => ({ query, release() {} });
for (const n of ['a', 'b']) {
  await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES($1,$1,$1,$1,$1,'','Test')`, [n]);
  await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES($1,$2,$1,$1,$1)`, ['store-' + n, n]);
  await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES($1,$2,$3,$1,'admin',true)`, ['user-' + n, n, n + '@example.com']);
  await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES($1,$2,$3,'admin')`, ['membership-' + n, 'user-' + n, 'store-' + n]);
}
const token = await createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'user-a', role: 'admin', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
async function request(path, method = 'GET', body, store = 'store-a') {
  const response = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': store, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, json: await response.json() };
}



const {productSku}=await import('../dist/services/productSku.js');
const catalog=await import('../dist/services/deviceCatalogApi.js');
import ts from 'typescript';
const pricingJs=ts.transpileModule(fs.readFileSync('apps/web/src/data/productPricing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {priceMetrics,suggestedPrice}=await import('data:text/javascript;base64,'+Buffer.from(pricingJs).toString('base64'));
test('SKU is stable across attribute IDs and pricing uses correct margin and markup',()=>{
 const a=productSku({name:'Galaxy S24',brand:'Samsung',color:'Azul',capacity:'256GB',attrs:{c:'Azul',s:'256GB'}});
 assert.equal(a,productSku({name:'Galaxy S24',brand:'Samsung',attrs:{other:'256GB',third:'Azul'}}));
 assert.notEqual(a,productSku({name:'Galaxy S24',brand:'Samsung',color:'Azul',capacity:'512GB'}));
 assert.throws(()=>catalog.parseDeviceSpecs([{},{}],'https://example.com'));
 assert.equal(suggestedPrice(100,{basis:'margin',percent:20}),125);assert.equal(suggestedPrice(100,{basis:'markup',percent:20}),120);
 assert.equal(suggestedPrice(100,{basis:'margin',percent:100}),null);assert.equal(suggestedPrice(0,{basis:'markup',percent:20}),null);
 assert.ok(Math.abs(priceMetrics(100,125).margin-20)<1e-10);assert.equal(priceMetrics(100,125).markup,25);
});
test('automatic SKU collision, manual SKU and true entry history persist',async()=>{
 const body={name:'Galaxy S24',brand:'Samsung',qty:2,cost:100,avgCost:90,price:125,pricingPolicy:{basis:'margin',percent:20},skuAuto:true,color:'Azul',capacity:'256GB'};
 const created=await request('/stock','POST',body);assert.equal(created.status,201,JSON.stringify(created.json));const row=created.json.data;
 const duplicate=await request('/stock','POST',body);assert.equal(duplicate.status,201);assert.equal(duplicate.json.data.sku,row.sku+'-2');
 assert.equal(row.avgCost,90);assert.equal(row.pricingPolicy.percent,20);assert.equal(row.lastEntry.unitCost,100);assert.equal(row.lastEntry.invoice,null);
 const updated=await request('/stock/'+row.id,'PATCH',{price:140,name:'Galaxy S24 editado'});assert.equal(updated.status,200,JSON.stringify(updated.json));assert.equal(updated.json.data.lastEntry.movementId,row.lastEntry.movementId);
 assert.equal((await request('/stock','POST',{...body,skuAuto:false,sku:row.sku})).status,409);
 assert.equal((await request('/stock/'+row.id,'PATCH',{pricingPolicy:{basis:'margin',percent:100}})).status,400);
});
test('product without a pricing calculation stays editable after reload',async()=>{
 const created=await request('/stock','POST',{name:'No pricing policy',qty:0,cost:0,price:0});
 assert.equal(created.status,201,JSON.stringify(created.json));
 assert.equal(created.json.data.pricingPolicy,null);
 const list=await request('/stock');
 assert.equal(list.json.data.find(row=>row.id===created.json.data.id).pricingPolicy,null);
 const updated=await request('/stock/'+created.json.data.id,'PATCH',{price:0,pricingPolicy:null});
 assert.equal(updated.status,200,JSON.stringify(updated.json));
 assert.equal(updated.json.data.pricingPolicy,null);
});
test('registration rolls back when preparing persisted product details fails', async () => {
 const normalConnect=pool.connect;
 pool.connect=async()=>({query:async(sql,args)=>{if(sql.includes('SELECT s.id,s.avg_cost'))throw new Error('Simulated product detail failure');return query(sql,args);},release(){}});
 try {
  const result=await request('/stock','POST',{name:'Rollback registration',qty:1,cost:10,price:20});
  assert.equal(result.status,500);
  assert.equal(Number((await query("SELECT count(*) n FROM stock_items WHERE name='Rollback registration'")).rows[0].n),0);
 }finally{pool.connect=normalConnect;}
 const retry=await request('/stock','POST',{name:'Rollback registration',qty:1,cost:10,price:20});
 assert.equal(retry.status,201,JSON.stringify(retry.json));
 assert.equal(Number((await query("SELECT count(*) n FROM stock_items WHERE name='Rollback registration'")).rows[0].n),1);
});

test('totem iPhone registration persists six variants with pickup prices', async () => {
 await query("INSERT INTO pickup_methods(id,store_id,name,kind) VALUES('pickup-phone','store-a','Em mãos teste iPhone','immediate')");
 for (const color of ['Prateado','Laranja-cósmico','Azul-intenso']) {
  for (const capacity of ['256GB','512GB']) {
   const price = capacity === '256GB' ? 7520 : 8520;
   const body = {name:'IPHONE 17 PRO MAX',brand:'Apple',sku:'APPLE-IPHONE17PROMAX-NEW',skuAuto:true,kind:'device',condition:'new',unit:'UN',qty:1,minQty:0,cost:capacity === '256GB' ? 6000 : 7000,avgCost:capacity === '256GB' ? 6000 : 7000,price:0,pricingPolicy:null,supplierId:'',attrs:{'ATTR-COR':color,'ATTR-CAP':capacity},color,capacity,pickupPrices:{'pickup-phone':price},images:[],showOnTotem:true};
   const result = await request('/stock','POST',body);
   assert.equal(result.status,201,JSON.stringify(result.json));
   assert.equal(result.json.data.pickupPrices['pickup-phone'],price);
   assert.equal(result.json.data.qty,1);
  }
 }
 const rows = (await request('/stock')).json.data.filter(row=>row.name==='IPHONE 17 PRO MAX');
 assert.equal(rows.length,6);
 assert.equal(new Set(rows.map(row=>row.sku)).size,6);
});
test('invoice posting, weighted cost and cancellation are transactional and tenant scoped',async()=>{
 await query("INSERT INTO suppliers(id,store_id,name) VALUES('supplier-a','store-a','Fornecedor teste')");
 const item=(await request('/stock','POST',{name:'Item nota',qty:2,cost:100,avgCost:100,price:150})).json.data;
 const created=await request('/stock-invoices','POST',{kind:'entry',number:'987',series:'1',supplierId:'supplier-a',issuedAt:'2026-10-01',movementAt:'2026-10-02'});
 assert.equal(created.status,201,JSON.stringify(created.json));const id=created.json.data.id;
 assert.equal((await request('/stock-invoices/'+id+'/lines','POST',{stockId:item.id,qty:2,unitCost:120})).status,201);
 const posted=await request('/stock-invoices/'+id+'/post','POST',{});assert.equal(posted.status,200,JSON.stringify(posted.json));
 let row=(await request('/stock')).json.data.find(r=>r.id===item.id);
 assert.equal(row.qty,4);assert.equal(row.avgCost,110);assert.equal(row.cost,120);assert.equal(row.lastEntry.invoice.number,'987');assert.equal(row.lastEntry.invoice.movementAt,'2026-10-02');
 assert.equal((await request('/stock-invoices/'+id+'/post','POST',{})).status,200);
 assert.equal(Number((await query('SELECT qty FROM stock_items WHERE id=$1',[item.id])).rows[0].qty),4);
 assert.equal((await request('/stock-invoices/'+id+'/cancel','POST',{})).status,200);
 row=(await request('/stock')).json.data.find(r=>r.id===item.id);assert.equal(row.qty,2);assert.equal(row.avgCost,100);assert.equal(row.lastEntry.invoice,null);
 await query("INSERT INTO stock_items(id,store_id,name) VALUES('foreign-item','store-b','Foreign')");
 const draft=(await request('/stock-invoices','POST',{kind:'entry',number:'988',supplierId:'supplier-a',issuedAt:'2026-10-01'})).json.data;
 assert.equal((await request('/stock-invoices/'+draft.id+'/lines','POST',{stockId:'foreign-item',qty:1,unitCost:10})).status,400);
});
test('device key is encrypted and full provider specifications are saved only for the requesting store',async()=>{
 assert.equal((await request('/device-reference?name=Samsung%20Galaxy%20S24')).status,409);
 assert.equal((await request('/device-reference/settings','PUT',{providerId:'devicespecs',enabled:true,cacheDays:30})).status,400);
 const settings=await request('/device-reference/settings','PUT',{providerId:'devicespecs',enabled:true,cacheDays:30,apiKey:'test-only-provider-key'});assert.equal(settings.status,200,JSON.stringify(settings.json));
 const saved=(await query("SELECT * FROM device_catalog_settings WHERE store_id='store-a'")).rows[0];assert.notEqual(saved.api_key_encrypted,'test-only-provider-key');assert.equal(catalog.decryptCatalogKey(saved.api_key_encrypted),'test-only-provider-key');
 assert.ok(!JSON.stringify((await request('/device-reference/settings')).json).includes('test-only-provider-key'));
 const raw={manufacturer:'Samsung',model:'Galaxy S24',colors:['Amber Yellow','Onyx Black'],normalizedSpecs:{memoryOptions:{availableStorageGb:[128,256]}},display:'Supplier specification'};
 const realFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{if(String(url).startsWith('https://deviceultraparser.p.rapidapi.com/')){calls++;assert.equal(options.headers['x-rapidapi-key'],'test-only-provider-key');return new Response(JSON.stringify(raw),{status:200,headers:{'content-type':'application/json'}});}return realFetch(url,options);};
 try{
 const response=await request('/device-reference?name=Samsung%20Galaxy%20S24');assert.equal(response.status,200,JSON.stringify(response.json));assert.deepEqual(response.json.data.capacities,['128GB','256GB']);
 assert.equal((await request('/device-reference?name=Samsung%20Galaxy%20S24')).status,200);assert.equal(calls,1);
 const models=(await query('SELECT * FROM device_catalog_models')).rows;assert.equal(models.length,1);assert.equal(models[0].store_id,'store-a');assert.deepEqual(models[0].raw_data,raw);
 }finally{globalThis.fetch=realFetch;}
 assert.equal((await query("SELECT count(*)::int n FROM device_catalog_models WHERE store_id='store-b'")).rows[0].n,0);
});

after(async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));await db.close();});
