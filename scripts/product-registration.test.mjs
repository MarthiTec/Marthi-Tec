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
test('supplier enters the automatic SKU by SKU name, trade name or first name, and can be left out',async()=>{
 const supplier=async(body)=>{const res=await request('/suppliers','POST',body);assert.equal(res.status,201,JSON.stringify(res.json));return res.json.data;};
 const byTrade=await supplier({name:'Distribuidora Paulista de Celulares LTDA',tradeName:'Cel Paulista'});
 const byFirst=await supplier({name:'Joaquim Ferreira'});
 const bySku=await supplier({name:'Atacado Brasil',tradeName:'Atacadão',skuName:'atb'});
 assert.equal(bySku.skuName,'atb');
 const body={name:'Redmi 13',brand:'Xiaomi',qty:1,cost:10,price:20,skuAuto:true,capacity:'128GB'};
 const sku=async(extra)=>{const res=await request('/stock','POST',{...body,...extra});assert.equal(res.status,201,JSON.stringify(res.json));return res.json.data;};
 assert.equal((await sku({supplierId:byTrade.id})).sku,'XIAOMI-CELPAULISTA-REDMI13-128GB-NEW');
 assert.equal((await sku({supplierId:byFirst.id})).sku,'XIAOMI-JOAQUIM-REDMI13-128GB-NEW');
 const withSku=await sku({supplierId:bySku.id});assert.equal(withSku.sku,'XIAOMI-ATB-REDMI13-128GB-NEW');assert.equal(withSku.skuWithSupplier,true);
 const without=await sku({supplierId:bySku.id,skuWithSupplier:false});assert.equal(without.sku,'XIAOMI-REDMI13-128GB-NEW');assert.equal(without.skuWithSupplier,false);
 const back=await request('/stock/'+without.id,'PATCH',{skuAuto:true,skuWithSupplier:true});assert.equal(back.status,200,JSON.stringify(back.json));assert.equal(back.json.data.sku,'XIAOMI-ATB-REDMI13-128GB-NEW-2');
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

test('product with variation grid persists as ONE single product with ONE SKU and detail variations in database', async () => {
 const variations = [];
 for (const color of ['Prateado','Laranja-cósmico','Azul-intenso']) {
  for (const capacity of ['256GB','512GB']) {
   const price = capacity === '256GB' ? 7520 : 8520;
   const cost = capacity === '256GB' ? 6000 : 7000;
   variations.push({
    attrs: {'ATTR-COR': color, 'ATTR-CAP': capacity},
    price,
    cost,
    qty: 2,
    minQty: 1,
    condition: 'new',
    barcode: '',
    imei: '',
    pickupPrices: {'pickup-phone': price}
   });
  }
 }
 const body = {
  name: 'iPhone 17 Pro Max Master',
  brand: 'Apple',
  sku: 'APPLE-IPHONE17PROMAX-MASTER-NEW',
  skuAuto: false,
  kind: 'device',
  condition: 'new',
  unit: 'UN',
  price: 7520,
  cost: 6000,
  showOnTotem: true,
  variations
 };
 const res = await request('/stock', 'POST', body);
 assert.equal(res.status, 201, JSON.stringify(res.json));
 const item = res.json.data;
 assert.equal(item.name, 'iPhone 17 Pro Max Master');
 assert.equal(item.sku, 'APPLE-IPHONE17PROMAX-MASTER-NEW');
 assert.equal(item.qty, 12); // 6 variations * 2 qty each = 12
 assert.equal(item.variations.length, 6);
 assert.equal(item.variations[0].attrs['ATTR-COR'], 'Prateado');
 assert.equal(item.variations[0].sku, undefined);

 const dbVars = (await query("SELECT * FROM stock_item_variations WHERE stock_item_id = $1", [item.id])).rows;
 assert.equal(dbVars.length, 6);
 assert.equal(Number(dbVars[0].qty), 2);

 const rows = (await request('/stock')).json.data.filter(r => r.name === 'iPhone 17 Pro Max Master');
 assert.equal(rows.length, 1);
 assert.equal(rows[0].variations.length, 6);
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
test('supplier chosen in the product form is saved on create and on edit, and only from the same store', async () => {
  await query("INSERT INTO suppliers(id,store_id,name) VALUES('SUP-a1','store-a','Distribuidora A'),('SUP-a2','store-a','Distribuidora B'),('SUP-b1','store-b','Fornecedor da loja B')");
  const created = await request('/stock', 'POST', { name: 'Produto com fornecedor', qty: 1, cost: 10, price: 20, supplierId: 'SUP-a1' });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.data.supplierId, 'SUP-a1');
  const id = created.json.data.id;
  const changed = await request('/stock/' + id, 'PATCH', { supplierId: 'SUP-a2' });
  assert.equal(changed.status, 200, JSON.stringify(changed.json));
  assert.equal(changed.json.data.supplierId, 'SUP-a2');
  assert.equal((await query('SELECT supplier_id FROM stock_items WHERE id=$1', [id])).rows[0].supplier_id, 'SUP-a2');
  assert.equal((await request('/stock/' + id, 'PATCH', { supplierId: 'SUP-b1' })).status, 400, 'supplier of another store is refused');
  const cleared = await request('/stock/' + id, 'PATCH', { supplierId: '' });
  assert.equal(cleared.status, 200);
  assert.equal((await query('SELECT supplier_id FROM stock_items WHERE id=$1', [id])).rows[0].supplier_id, null);
  const untouched = await request('/stock/' + id, 'PATCH', { price: 25 });
  assert.equal(untouched.status, 200);
  assert.equal((await query('SELECT supplier_id FROM stock_items WHERE id=$1', [id])).rows[0].supplier_id, null, 'editing other fields keeps the supplier as is');
  assert.equal((await request('/stock', 'POST', { name: 'Fornecedor errado', qty: 0, cost: 0, price: 0, supplierId: 'SUP-b1' })).status, 400);
});
test('color or capacity suggested by the device catalog is created in the attribute when the product is saved', async () => {
  await query("INSERT INTO product_attributes(id,store_id,name,active) VALUES('ATTR-cor-a','store-a','Cor',true)");
  await query("INSERT INTO product_attribute_values(id,attribute_id,value,sort) VALUES('ATV-azul','ATTR-cor-a','Azul',0)");
  const created = await request('/stock', 'POST', { name: 'iPhone grade', qty: 0, cost: 0, price: 5000, variations: [
    { attrs: { 'ATTR-cor-a': 'azul' }, qty: 1, price: 5000, cost: 4000 },
    { attrs: { 'ATTR-cor-a': 'Verde-sálvia' }, qty: 1, price: 5100, cost: 4100 },
  ] });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const values = (await query("SELECT value FROM product_attribute_values WHERE attribute_id='ATTR-cor-a' ORDER BY sort")).rows.map((r) => r.value);
  assert.deepEqual(values, ['Azul', 'Verde-sálvia'], 'existing value reused, new one created once');
  await request('/stock/' + created.json.data.id, 'PATCH', { attrs: { 'ATTR-cor-a': 'Titânio' } });
  assert.ok((await query("SELECT 1 FROM product_attribute_values WHERE attribute_id='ATTR-cor-a' AND value='Titânio'")).rows.length);
});
test('seller can sell by order a color the product does not have yet; immediate pickup explains what is missing', async () => {
  await query("INSERT INTO product_attributes(id,store_id,name,active,use_on_external_sale) VALUES('ATTR-cor-sale','store-a','Cor',true,true)");
  await query("INSERT INTO product_attribute_values(id,attribute_id,value,sort) VALUES('ATV-sale-azul','ATTR-cor-sale','Azul',0)");
  await query("INSERT INTO pickup_methods(id,store_id,name,kind) VALUES('pm-hand','store-a','Em mãos (teste cor)','immediate'),('pm-order','store-a','Encomenda (teste cor)','order')");
  const created = await request('/stock', 'POST', { name: 'IPHONE 17', qty: 0, cost: 4000, price: 5600, variations: [
    { attrs: { 'ATTR-cor-sale': 'Azul' }, qty: 1, price: 5600, cost: 4000, pickupPrices: { 'pm-hand': 5600, 'pm-order': 5200 } },
  ] });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const line = { stockId: created.json.data.id, name: 'IPHONE 17', qty: 1, unitPrice: 5600, attributes: [{ id: 'ATTR-cor-sale', name: 'Cor', value: 'Preto' }] };
  const byOrder = await request('/sales/external', 'POST', { paymentMethod: 'Pix', customerName: 'Ramon', customerPhone: '24992259927', lines: [{ ...line, pickupMethodId: 'pm-order' }] });
  assert.equal(byOrder.status, 201, JSON.stringify(byOrder.json));
  const sold = (await query('SELECT unit_price, attributes FROM sales_order_lines WHERE sale_id=$1 OR order_id=$1', [byOrder.json.data.id || byOrder.json.data.saleId])).rows[0];
  assert.equal(Number(sold.unit_price), 5200, 'order price of the product');
  assert.equal(sold.attributes[0].value, 'Preto');
  assert.ok((await query("SELECT 1 FROM product_attribute_values WHERE attribute_id='ATTR-cor-sale' AND value='Preto'")).rows.length, 'new color created in the attribute');
  const inHand = await request('/sales/external', 'POST', { paymentMethod: 'Pix', customerName: 'Ramon', customerPhone: '24992259927', lines: [{ ...line, attributes: [{ id: 'ATTR-cor-sale', name: 'Cor', value: 'Verde' }], pickupMethodId: 'pm-hand' }] });
  assert.equal(inHand.status, 400);
  assert.match(inHand.json.error.message, /Não há Verde em estoque para entrega imediata/);
});
test('variation written as "128GB" matches the attribute value "128 GB" in sale and stock deduction', async () => {
  await query("INSERT INTO product_attributes(id,store_id,name,active,use_on_external_sale,use_on_totem) VALUES('ATTR-cap-sp','store-a','Capacidade',true,true,true)");
  await query("INSERT INTO product_attribute_values(id,attribute_id,value,sort) VALUES('ATV-cap-128','ATTR-cap-sp','128 GB',0)");
  await query("INSERT INTO pickup_methods(id,store_id,name,kind) VALUES('pm-hand-sp','store-a','Em mãos (teste espaço)','immediate')");
  const created = await request('/stock', 'POST', { name: 'IPHONE 16', qty: 0, cost: 3000, price: 4650, variations: [
    { attrs: { 'ATTR-cap-sp': '128GB' }, qty: 2, price: 4650, cost: 3000, pickupPrices: { 'pm-hand-sp': 4650 } },
  ] });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const sale = await request('/sales/external', 'POST', { paymentMethod: 'Pix', customerName: 'Gilvan', customerPhone: '24999663631', lines: [
    { stockId: created.json.data.id, name: 'IPHONE 16', qty: 1, unitPrice: 4650, pickupMethodId: 'pm-hand-sp', attributes: [{ id: 'ATTR-cap-sp', name: 'Capacidade', value: '128GB' }] },
  ] });
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  const variations = (await query('SELECT variations FROM stock_items WHERE id=$1', [created.json.data.id])).rows[0].variations;
  assert.equal(Number(variations[0].qty), 1, 'the 128GB variation was deducted');
});
test('sale receipt has the store header and a signed QR link; the public page masks customer data', async () => {
  await query("UPDATE stores SET legal_name='Loja A Ltda', document='12345678000190', street='Rua Um', number='10', city='Três Rios', state='RJ' WHERE id='store-a'");
  const stock = (await request('/stock', 'POST', { name: 'Capinha nota', qty: 3, cost: 5, price: 50 })).json.data;
  const sale = await request('/sales/external', 'POST', { paymentMethod: 'Pix', customerName: 'Ramon', customerPhone: '24992259927', customerDocument: '12345678909', lines: [{ stockId: stock.id, name: 'Capinha nota', qty: 1, unitPrice: 50 }] });
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  const id = sale.json.data.id || sale.json.data.saleId;
  const receipt = (await request('/sales/' + id + '/receipt')).json.data;
  assert.equal(receipt.store.legalName, 'Loja A Ltda');
  assert.match(receipt.store.address, /Rua Um, 10/);
  assert.ok(receipt.verifyToken && receipt.verifyToken.length >= 16);
  assert.equal(receipt.sale.customer.document, '12345678909', 'the store sees the full document');
  const open = await fetch(base + '/public/receipts/' + encodeURIComponent(id) + '?t=' + encodeURIComponent(receipt.verifyToken));
  assert.equal(open.status, 200);
  const pub = (await open.json()).data;
  assert.equal(pub.sale.items[0].name, 'Capinha nota');
  assert.equal(pub.sale.customer.document, '••••••••909');
  assert.equal(pub.sale.customer.phone, '(••) •••••-9927');
  assert.equal((await fetch(base + '/public/receipts/' + encodeURIComponent(id) + '?t=forged-token-123456789')).status, 404);
  assert.equal((await fetch(base + '/public/receipts/' + encodeURIComponent(id))).status, 404);
});
test('sale can have store warranty, manufacturer-only warranty or no warranty', async () => {
  const stock = (await request('/stock', 'POST', { name: 'Fone garantia', qty: 5, cost: 5, price: 80 })).json.data;
  const sell = (extra) => request('/sales/external', 'POST', { paymentMethod: 'Pix', customerName: 'Cliente', lines: [{ stockId: stock.id, name: 'Fone garantia', qty: 1, unitPrice: 80 }], ...extra });
  const cases = [
    [{ warrantyType: 'manufacturer', warrantyMonths: 6 }, 'manufacturer', 0],
    [{ warrantyType: 'none' }, 'none', 0],
    [{ warrantyMonths: 6 }, 'store', 6],
  ];
  for (const [extra, type, months] of cases) {
    const sale = await sell(extra);
    assert.equal(sale.status, 201, JSON.stringify(sale.json));
    const receipt = (await request('/sales/' + (sale.json.data.id || sale.json.data.saleId) + '/receipt')).json.data;
    assert.equal(receipt.sale.warranty.type, type);
    assert.equal(receipt.sale.warranty.months, months);
  }
});

test('groups/subgroups with store labels, entry date, DUN-14 and unit conversion are saved on the product', async () => {
  const group = (await request('/product-groups', 'POST', { name: 'Bebidas' })).json.data;
  const sub = await request('/product-groups', 'POST', { name: 'Cerveja', parentId: group.id });
  assert.equal(sub.status, 201, JSON.stringify(sub.json));
  assert.equal((await request('/product-groups', 'POST', { name: 'Lata', parentId: sub.json.data.id })).status, 400, 'only one sublevel');
  const other = (await request('/product-groups', 'POST', { name: 'Eletrônicos' })).json.data;

  const labels = await request('/product-groups/labels', 'PUT', { group: 'Família', subgroup: 'Linha' });
  assert.deepEqual(labels.json.data, { group: 'Família', subgroup: 'Linha' });
  const listed = (await request('/product-groups')).json.data;
  assert.equal(listed.labels.group, 'Família');
  assert.equal(listed.groups.find((g) => g.id === sub.json.data.id).parentId, group.id);

  const created = await request('/stock', 'POST', {
    name: 'Cerveja Lata 350', qty: 24, cost: 3, price: 5, groupId: group.id, subgroupId: sub.json.data.id,
    entryDate: '2026-10-01', dun14: '17891234567895', purchaseUnit: 'cx', purchaseFactor: 12,
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const row = created.json.data;
  assert.equal(row.subgroupId, sub.json.data.id);
  assert.equal(row.entryDate, '2026-10-01');
  assert.equal(row.dun14, '17891234567895');
  assert.equal(row.purchaseUnit, 'CX');
  assert.equal(row.purchaseFactor, 12);
  const fromList = (await request('/stock')).json.data.find((item) => item.id === row.id);
  assert.equal(fromList.entryDate, '2026-10-01');
  assert.equal(fromList.groupId, group.id);

  assert.equal((await request('/stock/' + row.id, 'PATCH', { groupId: other.id, subgroupId: sub.json.data.id })).status, 400, 'subgroup must belong to the group');
  assert.equal((await request('/stock/' + row.id, 'PATCH', { dun14: '123' })).status, 400);
  const cleared = await request('/stock/' + row.id, 'PATCH', { groupId: '' });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.json));
  assert.equal(cleared.json.data.groupId, '');
  assert.equal(cleared.json.data.subgroupId, '');

  const today = await request('/stock', 'POST', { name: 'Sem data informada', qty: 0 });
  assert.match(today.json.data.entryDate, /^\d{4}-\d{2}-\d{2}$/);

  assert.equal((await request('/product-groups', 'GET', undefined, 'store-b')).status, 403, 'other store is not reachable');
  assert.equal((await request('/stock/' + row.id, 'PATCH', { groupId: 'PGR-missing' })).status, 400);
});

test('product movements show entries with supplier and invoice and exits with the customer', async () => {
  const supplier = (await request('/suppliers', 'POST', { name: 'Fornecedor Movimento LTDA', tradeName: 'Mov Distrib' })).json.data;
  const product = (await request('/stock', 'POST', { name: 'Produto com histórico', qty: 0, cost: 10, price: 20 })).json.data;
  await query(`INSERT INTO stock_invoices(id,store_id,supplier_id,number,series) VALUES('INV-MOV','store-a',$1,'1234','1')`, [supplier.id]);
  await query(`INSERT INTO stock_movements(id,store_id,stock_id,type,qty,previous_qty,new_qty,unit_cost,ref_type,ref_id,operator_name,notes,created_at) VALUES('MOV-IN','store-a',$1,'in',5,0,5,10,'invoice','INV-MOV','Ana','',now()-interval '1 day')`, [product.id]);
  await query(`INSERT INTO sales_orders(id,store_id,customer_name) VALUES('SALE-MOV','store-a','Cliente Movimento')`).catch(async () => {
    await query(`INSERT INTO sales_orders(id,store_id,customer_name,product_name) VALUES('SALE-MOV','store-a','Cliente Movimento','x')`);
  });
  await query(`INSERT INTO stock_movements(id,store_id,stock_id,type,qty,previous_qty,new_qty,unit_cost,ref_type,ref_id,operator_name,notes) VALUES('MOV-OUT','store-a',$1,'sale',2,5,3,10,'sale','SALE-MOV','Ana','')`, [product.id]);
  const res = await request('/stock/' + product.id + '/movements');
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const [out, entry] = res.json.data;
  assert.equal(out.direction, 'out');
  assert.equal(out.customer.name, 'Cliente Movimento');
  assert.equal(entry.direction, 'in');
  assert.equal(entry.supplier.name, 'Mov Distrib');
  assert.equal(entry.invoice.number, '1234');
  assert.equal((await request('/stock/' + product.id + '/movements', 'GET', undefined, 'store-b')).status, 403);
});

test('campaigns by group, subgroup, supplier and brand are saved, listed and deleted; external sale records the campaign', async () => {
  const group = (await request('/product-groups', 'POST', { name: 'Acessórios' })).json.data;
  const sub = (await request('/product-groups', 'POST', { name: 'Fones', parentId: group.id })).json.data;
  const supplier = (await request('/suppliers', 'POST', { name: 'Distribuidora Som LTDA', tradeName: 'Som Distrib' })).json.data;
  const product = (await request('/stock', 'POST', { name: 'Fone Bluetooth', brand: 'jbl', qty: 10, cost: 50, price: 100, groupId: group.id, subgroupId: sub.id, supplierId: supplier.id })).json.data;
  const base = { active: true, kind: 'percent', discountPercent: 10, tiers: [], giftStockId: '', giftMinQty: 1, priority: 1, accumulative: false, stockIds: [], note: '' };
  const targets = [
    ['Grupo', { groupId: group.id }],
    ['Subgrupo', { groupId: group.id, subgroupId: sub.id }],
    ['Fornecedor', { supplierId: supplier.id }],
    ['Marca', { brand: 'JBL' }],
  ];
  const ids = [];
  for (const [name, criteria] of targets) {
    const saved = await request('/promotions', 'POST', { ...base, name: `Campanha por ${name}`, channels: ['external'], criteria: { stockIds: [], ...criteria } });
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.deepEqual(saved.json.data.criteria, { stockIds: [], ...criteria });
    ids.push(saved.json.data.id);
  }
  const listed = (await request('/promotions')).json.data;
  for (const id of ids) assert.ok(listed.some((row) => row.id === id), 'campaign listed after save');

  const foreignGroup = await request('/product-groups', 'POST', { name: 'Grupo da outra loja' }, 'store-b');
  assert.equal(foreignGroup.status, 403);
  assert.equal((await request('/promotions', 'POST', { ...base, name: 'Grupo inexistente', criteria: { stockIds: [], groupId: 'PGR-nao-existe' } })).status, 400);

  // Venda externa com a campanha por grupo: 10% de 2 x 100 = 20 de desconto.
  const sell = (line) => request('/sales/external', 'POST', { paymentMethod: 'Pix', customerName: 'Cliente Campanha', lines: [{ stockId: product.id, name: product.name, qty: 2, unitPrice: 100, ...line }] });
  const sale = await sell({ discount: 20, campaignId: ids[0] });
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  const saleId = sale.json.data.id || sale.json.data.saleId;
  const line = (await query('SELECT campaign_id, campaign_name, discount_amount, total_price FROM sales_order_lines WHERE sale_id = $1', [saleId])).rows[0];
  assert.equal(line.campaign_id, ids[0]);
  assert.equal(line.campaign_name, 'Campanha por Grupo');
  assert.equal(Number(line.discount_amount), 20);
  assert.equal(Number(line.total_price), 180);

  // Campanha só do PDV não vale na venda externa; campanha excluída também não.
  const pdvOnly = (await request('/promotions', 'POST', { ...base, name: 'Só no PDV', channels: ['pdv'], criteria: { stockIds: [], groupId: group.id } })).json.data;
  assert.equal((await sell({ discount: 20, campaignId: pdvOnly.id })).status, 409);
  for (const id of [...ids, pdvOnly.id]) assert.equal((await request('/promotions/' + id, 'DELETE')).status, 200);
  assert.equal((await request('/promotions')).json.data.filter((row) => ids.includes(row.id)).length, 0, 'deleted from the database');
  assert.equal((await sell({ discount: 20, campaignId: ids[0] })).status, 409);
});

test('deleting a product without history removes it; with sales it is deactivated and keeps the history', async () => {
  const clean = (await request('/stock', 'POST', { name: 'Sem historico', qty: 0, price: 10 })).json.data;
  const removed = await request('/stock/' + clean.id, 'DELETE');
  assert.equal(removed.status, 200, JSON.stringify(removed.json));
  assert.equal(removed.json.data.deactivated, undefined);
  assert.equal((await query('SELECT count(*)::int AS n FROM stock_items WHERE id = $1', [clean.id])).rows[0].n, 0);

  const sold = (await request('/stock', 'POST', { name: 'Com venda', qty: 3, cost: 5, price: 20, showOnTotem: true })).json.data;
  const sale = await request('/sales/external', 'POST', { paymentMethod: 'Pix', customerName: 'Cliente', lines: [{ stockId: sold.id, name: sold.name, qty: 1, unitPrice: 20 }] });
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  const res = await request('/stock/' + sold.id, 'DELETE');
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.data.deactivated, true);
  const row = (await query('SELECT active, show_on_totem FROM stock_items WHERE id = $1', [sold.id])).rows[0];
  assert.equal(row.active, false);
  assert.equal(row.show_on_totem, false);
  assert.equal((await query('SELECT count(*)::int AS n FROM sales_order_lines WHERE stock_id = $1', [sold.id])).rows[0].n, 1, 'sale history kept');
  assert.equal((await request('/stock/STK-nao-existe', 'DELETE')).status, 404);
});

test('same product from different suppliers: entries per variation with cost, quantity and IMEIs; sale price stays the variation price', async () => {
  const supA = (await request('/suppliers', 'POST', { name: 'Fornecedor A LTDA', tradeName: 'Forn A' })).json.data;
  const supB = (await request('/suppliers', 'POST', { name: 'Fornecedor B LTDA', tradeName: 'Forn B' })).json.data;
  const variation = (attrs, price, entries) => ({ attrs, price, cost: 0, qty: entries.reduce((s, e) => s + e.qty, 0), minQty: 0, condition: 'new', supplierEntries: entries });
  const created = await request('/stock', 'POST', {
    name: 'IPHONE 17 PRO MAX', kind: 'device', supplierId: supA.id, qty: 0, price: 9000,
    variations: [
      variation({ 'ATTR-COR': 'Preto', 'ATTR-CAP': '256GB' }, 9000, [
        { supplierId: supA.id, entryDate: '2026-10-01', qty: 2, unitCost: 7000, imeis: ['350000000000001', '350000000000002'] },
        { supplierId: supB.id, entryDate: '2026-10-05', qty: 1, unitCost: 6800, imeis: ['350000000000003'] },
      ]),
      variation({ 'ATTR-COR': 'Prata', 'ATTR-CAP': '512GB' }, 10500, [{ qty: 1, unitCost: 8200, imeis: ['350000000000004'] }]),
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const row = created.json.data;
  assert.equal(row.qty, 4);
  const black = row.variations.find((v) => v.attrs['ATTR-COR'] === 'Preto');
  assert.equal(black.price, 9000, 'sale price is the variation price, not per supplier');
  assert.equal(black.supplierEntries.length, 2);
  assert.deepEqual(black.supplierEntries.map((e) => [e.supplierName, e.qty, e.unitCost, e.entryDate]), [['Forn A', 2, 7000, '2026-10-01'], ['Forn B', 1, 6800, '2026-10-05']]);
  const silver = row.variations.find((v) => v.attrs['ATTR-COR'] === 'Prata');
  assert.equal(silver.supplierEntries[0].supplierId, supA.id, 'without supplier the entry takes the product supplier');

  const movements = (await request('/stock/' + row.id + '/movements')).json.data;
  assert.equal(movements.filter((m) => m.origin === 'supplier_entry').length, 3);
  assert.equal(movements.filter((m) => m.origin === 'manual').length, 0, 'no double count of the initial quantity');
  assert.ok(movements.some((m) => m.supplier?.name === 'Forn B'));

  // Listagem traz as entradas; reenviar as mesmas entradas não gera movimentação nova.
  const listed = (await request('/stock')).json.data.find((item) => item.id === row.id);
  const keep = listed.variations.map((v) => ({ ...v, supplierEntries: v.supplierEntries }));
  const same = await request('/stock/' + row.id, 'PATCH', { variations: keep, supplierEntries: [] });
  assert.equal(same.status, 200, JSON.stringify(same.json));
  assert.equal((await request('/stock/' + row.id + '/movements')).json.data.length, movements.length);

  // Nova compra do fornecedor B: entra 1 unidade com o custo dele.
  const more = keep.map((v) => v.attrs['ATTR-COR'] === 'Preto'
    ? { ...v, qty: v.qty + 1, supplierEntries: [...v.supplierEntries, { supplierId: supB.id, qty: 1, unitCost: 6700, imeis: ['350000000000005'] }] }
    : v);
  const added = await request('/stock/' + row.id, 'PATCH', { variations: more, supplierEntries: [] });
  assert.equal(added.status, 200, JSON.stringify(added.json));
  assert.equal(added.json.data.qty, 5);
  const after = (await request('/stock/' + row.id + '/movements')).json.data;
  assert.equal(after.length, movements.length + 1);
  assert.equal(after[0].origin, 'supplier_entry');
  assert.equal(after[0].unitCost, 6700);

  // IMEI repetido é recusado.
  const dupe = keep.map((v) => v.attrs['ATTR-COR'] === 'Prata' ? { ...v, supplierEntries: [...v.supplierEntries, { qty: 1, unitCost: 1, imeis: ['350000000000001'] }] } : v);
  assert.equal((await request('/stock/' + row.id, 'PATCH', { variations: dupe, supplierEntries: [] })).status, 400);
  const other = await request('/stock', 'POST', { name: 'Outro aparelho', qty: 1, supplierEntries: [{ qty: 1, unitCost: 1, imeis: ['350000000000004'] }] });
  assert.equal(other.status, 409);
  assert.equal((await request('/stock', 'POST', { name: 'IMEI demais', qty: 1, supplierEntries: [{ qty: 1, unitCost: 1, imeis: ['1', '2'] }] })).status, 400);
});

test('help center: Marthi contacts come from the database, store requests are saved, only the platform admin edits contacts', async () => {
  const contacts = await request('/support/contacts');
  assert.equal(contacts.status, 200, JSON.stringify(contacts.json));
  assert.equal(contacts.json.data.email, 'marthi.tecnologia@gmail.com');
  assert.equal(contacts.json.data.instagram, 'marthi.tecnologia');
  assert.match(contacts.json.data.whatsappUrl, /^https:\/\/wa\.me\/55\d+$/);
  assert.equal((await request('/support/contacts', 'PUT', { email: 'x@y.com', instagram: 'x', whatsapp: '24999999999' })).status, 403);
  const ticket = await request('/support/tickets', 'POST', { topic: 'ajuste', message: 'Preciso de ajuda no cadastro' });
  assert.equal(ticket.status, 201, JSON.stringify(ticket.json));
  const list = (await request('/support/tickets')).json.data;
  assert.equal(list[0].message, 'Preciso de ajuda no cadastro');
  assert.equal((await request('/support/tickets', 'GET', undefined, 'store-b')).status, 403);
});

test('trade-in device with the name of an existing product enters that product stock; cancelling removes only that unit', async () => {
  // Produto simples com o mesmo nome (escrito diferente): soma 1 no estoque e o custo vira a média.
  const used = (await request('/stock', 'POST', { name: 'IPHONE 11 USADO', kind: 'device', condition: 'used', qty: 2, cost: 1000, price: 1800 })).json.data;
  const item = (await request('/stock', 'POST', { name: 'Capinha troca', qty: 5, cost: 5, price: 50 })).json.data;
  const sell = (tradeIn) => request('/sales/external', 'POST', { paymentMethod: 'Pix', customerName: 'Cliente Troca', lines: [{ stockId: item.id, name: item.name, qty: 1, unitPrice: 50 }], discount: 0, tradeIn });
  const sale = await sell({ deviceName: 'iPhone 11 Usado', imei: '359000000000101', tradeValue: 40, conditionState: 'used' });
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  const saleId = sale.json.data.id || sale.json.data.saleId;
  const after = (await request('/stock')).json.data.find((p) => p.id === used.id);
  assert.equal(after.qty, 3);
  assert.equal((await query("SELECT count(*)::int n FROM stock_items WHERE store_id = 'store-a' AND id LIKE 'STK-USED-%' AND name ILIKE '%iphone 11%'")).rows[0].n, 0, 'no duplicate product');
  assert.equal((await query('SELECT stock_item_id, stock_merged FROM sale_trade_ins WHERE sale_id = $1', [saleId])).rows[0].stock_merged, true);
  const cancel = await request('/sales/' + saleId + '/cancel', 'POST', { reason: 'Teste' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
  const back = (await query('SELECT qty, active FROM stock_items WHERE id = $1', [used.id])).rows[0];
  assert.equal(back.qty, 2);
  assert.equal(back.active, true, 'existing product stays active');

  // Produto com grade: entra na variação de mesma cor/capacidade.
  await query("INSERT INTO product_attributes(id,store_id,name,active) VALUES('ATTR-cor-ti','store-a','Cor',true),('ATTR-cap-ti','store-a','Capacidade',true)");
  const grid = (await request('/stock', 'POST', {
    name: 'GALAXY S21 SEMINOVO', kind: 'device', qty: 0, price: 1500,
    variations: [
      { attrs: { 'ATTR-cor-ti': 'Preto', 'ATTR-cap-ti': '128 GB' }, price: 1500, cost: 900, qty: 1, minQty: 0, condition: 'used' },
      { attrs: { 'ATTR-cor-ti': 'Branco', 'ATTR-cap-ti': '256 GB' }, price: 1700, cost: 1000, qty: 1, minQty: 0, condition: 'used' },
    ],
  })).json.data;
  const sale2 = await sell({ deviceName: 'Galaxy S21 Seminovo', color: 'preto', capacity: '128GB', imei: '359000000000102', tradeValue: 45, conditionState: 'used' });
  assert.equal(sale2.status, 201, JSON.stringify(sale2.json));
  const g = (await request('/stock')).json.data.find((p) => p.id === grid.id);
  assert.equal(g.qty, 3);
  assert.equal(g.variations.find((v) => v.attrs['ATTR-cor-ti'] === 'Preto').qty, 2);
  assert.equal(g.variations.find((v) => v.attrs['ATTR-cor-ti'] === 'Branco').qty, 1);
  const cancel2 = await request('/sales/' + (sale2.json.data.id || sale2.json.data.saleId) + '/cancel', 'POST', { reason: 'Teste' });
  assert.equal(cancel2.status, 200, JSON.stringify(cancel2.json));
  const g2 = (await request('/stock')).json.data.find((p) => p.id === grid.id);
  assert.equal(g2.variations.find((v) => v.attrs['ATTR-cor-ti'] === 'Preto').qty, 1);

  // Nome que não existe: cadastro próprio do usado, como antes.
  const sale3 = await sell({ deviceName: 'Moto G Antigo', tradeValue: 10, conditionState: 'used' });
  assert.equal(sale3.status, 201, JSON.stringify(sale3.json));
  assert.equal((await query("SELECT count(*)::int n FROM stock_items WHERE store_id = 'store-a' AND name = 'Moto G Antigo (Trade-in)'")).rows[0].n, 1);
});

test('condition and battery per variation: new is 100%, used keeps its level; sale must pick the condition when new and used share color/capacity', async () => {
  await query("INSERT INTO product_attributes(id,store_id,name,active,use_on_external_sale) VALUES('ATTR-cor-cd','store-a','Cor',true,true),('ATTR-cap-cd','store-a','Capacidade',true,true)");
  const row = (await request('/stock', 'POST', {
    name: 'IPHONE 15 CONDICAO', kind: 'device', qty: 0, price: 5000, showOnTotem: true,
    variations: [
      { attrs: { 'ATTR-cor-cd': 'Preto', 'ATTR-cap-cd': '128 GB' }, price: 5000, cost: 4000, qty: 2, minQty: 0, condition: 'new', batteryLevel: 70 },
      { attrs: { 'ATTR-cor-cd': 'Preto', 'ATTR-cap-cd': '128 GB' }, price: 3500, cost: 2500, qty: 1, minQty: 0, condition: 'used', batteryLevel: 87 },
    ],
  })).json.data;
  const news = row.variations.find((v) => v.condition === 'new');
  const used = row.variations.find((v) => v.condition === 'used');
  assert.equal(news.batteryLevel, 100, 'new is always 100%');
  assert.equal(used.batteryLevel, 87);
  assert.equal(row.showConditionOnTotem, true, 'shown on the totem by default');

  const catalog = await (await fetch(base.replace('/api/v1', '') + '/api/v1/totem/catalog?storeId=store-a')).json();
  const pub = catalog.data.find((p) => p.id === row.id);
  assert.equal(pub.variations.find((v) => v.condition === 'used').batteryLevel, 87);

  const attrs = [{ id: 'ATTR-cor-cd', name: 'Cor', value: 'Preto' }, { id: 'ATTR-cap-cd', name: 'Capacidade', value: '128 GB' }];
  const sell = (extra) => request('/sales/external', 'POST', { paymentMethod: 'Pix', customerName: 'Cliente', lines: [{ stockId: row.id, name: row.name, qty: 1, unitPrice: 3500, attributes: [...attrs, ...extra] }] });
  const noCondition = await sell([]);
  assert.equal(noCondition.status, 400);
  assert.match(noCondition.json.error.message, /condição/i);
  const sold = await sell([{ id: '__condition', name: 'Condição', value: 'Usado' }]);
  assert.equal(sold.status, 201, JSON.stringify(sold.json));
  const after = (await request('/stock')).json.data.find((p) => p.id === row.id);
  assert.equal(after.variations.find((v) => v.condition === 'used').qty, 0, 'the used one was sold');
  assert.equal(after.variations.find((v) => v.condition === 'new').qty, 2);
  const line = (await query('SELECT attributes FROM sales_order_lines WHERE sale_id = $1', [sold.json.data.id || sold.json.data.saleId])).rows[0];
  assert.ok(line.attributes.some((a) => a.id === '__condition' && a.value === 'Usado'));

  const hidden = await request('/stock/' + row.id, 'PATCH', { showConditionOnTotem: false });
  assert.equal(hidden.json.data.showConditionOnTotem, false);
});

test('a product whose only movements are its own registration (opening balance, supplier entries) is really deleted', async () => {
  const sup = (await request('/suppliers', 'POST', { name: 'Fornecedor Exclusao' })).json.data;
  const created = (await request('/stock', 'POST', { name: 'Para excluir de verdade', qty: 3, cost: 10, price: 20, supplierEntries: [{ supplierId: sup.id, qty: 2, unitCost: 10, imeis: [] }] })).json.data;
  assert.ok((await query('SELECT count(*)::int n FROM stock_movements WHERE stock_id = $1', [created.id])).rows[0].n >= 2);
  const res = await request('/stock/' + created.id, 'DELETE');
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.data.deactivated, undefined);
  assert.equal((await query('SELECT count(*)::int n FROM stock_items WHERE id = $1', [created.id])).rows[0].n, 0);
  assert.equal((await query('SELECT count(*)::int n FROM stock_movements WHERE stock_id = $1', [created.id])).rows[0].n, 0);

  // Já inativado antes pela regra antiga: excluir de novo apaga.
  const old = (await request('/stock', 'POST', { name: 'Inativado pela regra antiga', qty: 1, price: 5 })).json.data;
  await query('UPDATE stock_items SET active = false WHERE id = $1', [old.id]);
  assert.equal((await request('/stock/' + old.id, 'DELETE')).json.data.deactivated, undefined);
  assert.equal((await query('SELECT count(*)::int n FROM stock_items WHERE id = $1', [old.id])).rows[0].n, 0);
});

test('trade-in becomes a stock entry with the customer as origin, its notes and battery; entries keep notes and battery; cancel removes it', async () => {
  const customer = (await request('/customers', 'POST', { name: 'Cliente Elaine', phone: '24999998888' })).json.data;
  const item = (await request('/stock', 'POST', { name: 'Pelicula troca', qty: 5, cost: 5, price: 30 })).json.data;
  const sale = await request('/sales/external', 'POST', {
    paymentMethod: 'Pix', customerId: customer.id, customerName: 'Cliente Elaine',
    lines: [{ stockId: item.id, name: item.name, qty: 1, unitPrice: 30 }],
    tradeIn: { deviceName: 'IPHONE 14 PRO MAX TROCA', imei: '350813225079732', tradeValue: 20, conditionState: 'used', notes: 'Troca de tela - está no reparo com o João', batteryLevel: 83 },
  });
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  const product = (await request('/stock')).json.data.find((p) => p.name === 'IPHONE 14 PRO MAX TROCA (Trade-in)');
  assert.ok(product, 'trade-in product created');
  const entry = product.supplierEntries[0];
  assert.equal(entry.origin, 'trade_in');
  assert.equal(entry.customerName, 'Cliente Elaine');
  assert.equal(entry.notes, 'Troca de tela - está no reparo com o João');
  assert.equal(entry.batteryLevel, 83);
  assert.deepEqual(entry.imeis, ['350813225079732']);
  assert.equal(entry.unitCost, 20);

  // Salvar o produto pelo cadastro mantém a origem da troca; observação e bateria editáveis.
  const saved = await request('/stock/' + product.id, 'PATCH', { supplierEntries: [{ ...entry, notes: 'Pronto para venda', batteryLevel: 85 }] });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  const after = saved.json.data.supplierEntries[0];
  assert.equal(after.origin, 'trade_in');
  assert.equal(after.customerName, 'Cliente Elaine');
  assert.equal(after.notes, 'Pronto para venda');
  assert.equal(after.batteryLevel, 85);

  const cancel = await request('/sales/' + (sale.json.data.id || sale.json.data.saleId) + '/cancel', 'POST', { reason: 'Teste' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
  assert.equal((await query('SELECT count(*)::int n FROM stock_supplier_entries WHERE stock_item_id = $1', [product.id])).rows[0].n, 0);
});
