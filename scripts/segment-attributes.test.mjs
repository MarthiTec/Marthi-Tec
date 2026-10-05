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


test('segment provisions independent persisted options once and preserves retailer edits',async()=>{
 await query("UPDATE stores SET segment='assistencia_tecnica' WHERE id IN ('store-a','store-b')");
 const a=(await query("SELECT * FROM product_attributes WHERE store_id='store-a' ORDER BY sort")).rows;
 const b=(await query("SELECT * FROM product_attributes WHERE store_id='store-b' ORDER BY sort")).rows;
 assert.deepEqual(a.map(x=>x.name),['Cor','Capacidade']);
 assert.equal(a.every(x=>x.active && x.use_on_stock && x.use_on_pdv && x.use_on_external_sale && x.use_on_totem),true);
 assert.equal(a.some(x=>b.some(y=>x.id===y.id)),false);
 await query('UPDATE product_attributes SET active=false WHERE id=$1',[a[0].id]);

 await query("UPDATE stores SET segment='assistencia_tecnica' WHERE id='store-a'");
 assert.equal((await query("SELECT count(*)::int n FROM product_attributes WHERE store_id='store-a'")).rows[0].n,2);
 assert.equal((await query('SELECT active FROM product_attributes WHERE id=$1',[a[0].id])).rows[0].active,false);
});
test('CRUD rejects foreign IDs, never upserts foreign records and requires authentication',async()=>{
 const foreign=(await query("SELECT id FROM product_attributes WHERE store_id='store-b' LIMIT 1")).rows[0].id;
 assert.equal((await request('/attributes/'+foreign,'PATCH',{name:'Invadido'})).status,404);
 assert.equal((await request('/attributes/'+foreign,'DELETE')).status,404);
 const created=await request('/attributes','POST',{id:foreign,name:'Novo',values:['Valor']});
 assert.equal(created.status,201);assert.notEqual(created.json.data.id,foreign);
 assert.notEqual((await query('SELECT name FROM product_attributes WHERE id=$1',[foreign])).rows[0].name,'Invadido');
 assert.equal((await fetch(base+'/attributes')).status,401);
 const value=(await query('SELECT id FROM product_attribute_values WHERE attribute_id=$1',[created.json.data.id])).rows[0].id;
 assert.equal((await request('/attributes/'+created.json.data.id,'PATCH',{priceDeltas:{Valor:12}})).status,200);
 assert.equal((await query('SELECT id,price_delta FROM product_attribute_values WHERE attribute_id=$1',[created.json.data.id])).rows[0].id,value);
});
test('branch replication is explicit, authorized, independent and preserves existing names',async()=>{
 await query("INSERT INTO stores(id,client_account_id,trade_name,legal_name,document,is_matrix) VALUES('branch','a','Filial','Filial','branch',false)");
 await query("INSERT INTO user_stores(id,user_id,store_id,role) VALUES('branch-member','user-a','branch','manager')");
 assert.equal((await query("SELECT count(*)::int n FROM product_attributes WHERE store_id='branch'")).rows[0].n,0);
 assert.equal((await request('/attributes/replicate','POST',{targetStoreId:'store-b'})).status,403);
 const copied=await request('/attributes/replicate','POST',{targetStoreId:'branch'});
 assert.equal(copied.status,200);assert.equal(copied.json.data.copied,3);
 assert.equal((await request('/attributes/replicate','POST',{targetStoreId:'branch'})).json.data.copied,0);
 const a=(await query("SELECT id FROM product_attributes WHERE store_id='store-a'")).rows;
 const b=(await query("SELECT id FROM product_attributes WHERE store_id='branch'")).rows;
 assert.equal(a.some(x=>b.some(y=>x.id===y.id)),false);
});
test('sale selections are stored and foreign or invalid options are rejected transactionally',async()=>{
 const capacity=(await request('/attributes')).json.data.find(a=>a.name==='Capacidade');
 await query("INSERT INTO stock_items(id,store_id,name,qty,price,cost,capacity) VALUES('device','store-a','Aparelho',5,100,50,'256GB')");
 const body={paymentMethod:'Pix',lines:[{stockId:'device',name:'Aparelho',qty:1,unitPrice:100,attributes:[{id:capacity.id,name:'forged',value:'256GB'}]}]};
 const sale=await request('/sales/external','POST',body);assert.equal(sale.status,201);
 const stored=(await query('SELECT attributes FROM sales_order_lines WHERE order_id=$1',[sale.json.data.id || sale.json.data.saleId])).rows;
 assert.equal(stored.length,1);assert.deepEqual(stored[0].attributes,[{id:capacity.id,name:'Capacidade',value:'256GB'}]);
 body.lines[0].attributes[0].value='512GB';
 assert.equal((await request('/sales/external','POST',body)).status,400);
 body.lines[0].attributes[0].id=(await query("SELECT id FROM product_attributes WHERE store_id='store-b' LIMIT 1")).rows[0].id;
 assert.equal((await request('/sales/external','POST',body)).status,400);
 assert.equal(Number((await query("SELECT qty FROM stock_items WHERE id='device'")).rows[0].qty),4);
});
test('disabled automation prevents provisioning on segment changes and can be enabled later',async()=>{
 await query("INSERT INTO stores(id,client_account_id,trade_name,legal_name,document,attribute_automation_enabled) VALUES('optional','a','Optional','Optional','optional',false)");
 await query("INSERT INTO user_stores(id,user_id,store_id,role) VALUES('optional-member','user-a','optional','admin')");
 await query("UPDATE stores SET segment='assistencia_tecnica' WHERE id='optional'");
 const disabled=await request('/attributes/automation','GET',undefined,'optional');
 assert.equal(disabled.status,200);assert.equal(disabled.json.data.enabled,false);assert.equal(disabled.json.data.attributes.length,0);
 const enabled=await request('/attributes/automation','PUT',{enabled:true},'optional');
 assert.equal(enabled.status,200);assert.equal(enabled.json.data.attributes.length,2);
 const capacity=enabled.json.data.attributes.find(a=>a.name==='Capacidade');assert.ok(capacity.values.includes('256 GB'));
 await request('/attributes/automation','PUT',{enabled:false},'optional');
 assert.equal((await request('/attributes/automation','GET',undefined,'optional')).json.data.attributes.length,2);
});

after(async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));await db.close();});
