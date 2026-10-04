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


const pickupService=await import('../dist/services/pickup.js');
test('predefined pickup modes are persisted per store and order dates use Sao Paulo time',async()=>{
 const a=(await request('/pickup-methods')).json.data;
 assert.equal(a.length,3);assert.deepEqual(new Set(a.map(m=>m.kind)),new Set(['immediate','order','delivery']));
 assert.equal((await query("SELECT count(*)::int n FROM product_attribute_templates WHERE name='Tipo de Retirada'")).rows[0].n,0);
 const policy=a.find(m=>m.kind==='order').lead_days;
 assert.equal(pickupService.estimatedPickupDate(policy,new Date('2026-10-03T15:00:00Z')),'2026-10-05');
 assert.equal(pickupService.estimatedPickupDate(policy,new Date('2026-10-06T15:00:00Z')),'2026-10-07');
 assert.equal(pickupService.estimatedPickupDate(policy,new Date('2026-10-04T01:00:00Z')),'2026-10-05');
});
test('product prices and delivery address are validated and retained on the order',async()=>{
 const methods=(await request('/pickup-methods')).json.data;
 const order=methods.find(m=>m.kind==='order');const delivery=methods.find(m=>m.kind==='delivery');
 const created=await request('/stock','POST',{name:'Test device',kind:'device',qty:3,price:100,pickupPrices:{[order.id]:90,[delivery.id]:120}});
 assert.equal(created.status,201,JSON.stringify(created.json));const stock=created.json.data;
 assert.equal(stock.pickupPrices[order.id],90);
 const foreign=(await query("SELECT id FROM pickup_methods WHERE store_id='store-b' LIMIT 1")).rows[0].id;
 assert.equal((await request('/stock/'+stock.id,'PATCH',{pickupPrices:{[foreign]:1}})).status,400);
 const line={stockId:stock.id,name:'Test device',qty:1,unitPrice:1,pickupMethodId:delivery.id};
 assert.equal((await request('/sales/external','POST',{lines:[line],paymentMethod:'Pix'})).status,400);
 const address={zipCode:'25800000',street:'Rua Teste',number:'1',district:'Centro',city:'Tres Rios',state:'RJ'};
 const sale=await request('/sales/external','POST',{lines:[{...line,deliveryAddress:address}],paymentMethod:'Pix'});
 assert.equal(sale.status,201,JSON.stringify(sale.json));
 const saved=(await query('SELECT * FROM pickup_requests WHERE reference_id=$1',[sale.json.data.id])).rows[0];
 assert.equal(Number(saved.price),120);assert.equal(saved.address.street,address.street);
 const track=await fetch(base+'/pickup-tracking/'+saved.tracking_token);assert.equal(track.status,200);const publicData=(await track.json()).data;assert.equal(publicData.address,undefined);
 const ordered=await request('/sales/external','POST',{lines:[{...line,pickupMethodId:order.id,qty:10}],paymentMethod:'Pix',customerPhone:'24999999999'});
 assert.equal(ordered.status,201,JSON.stringify(ordered.json));assert.equal(Number((await query('SELECT qty FROM stock_items WHERE id=$1',[stock.id])).rows[0].qty),2);
 const pending=(await query('SELECT * FROM pickup_requests WHERE reference_id=$1',[ordered.json.data.id])).rows[0];assert.ok(pending.estimated_date);
 const wrong=await request('/pickup-requests/'+pending.id,'PATCH',{status:'completed'});assert.equal(wrong.status,409);
});

test('Totem quote persists the selected price, delivery tracking survives sale and preorder stock is reserved only when ready',async()=>{
 const methods=(await request('/pickup-methods')).json.data;
 const order=methods.find(m=>m.kind==='order');
 const created=await request('/stock','POST',{name:'Totem preorder',kind:'device',qty:1,price:100,showOnTotem:true,pickupPrices:{[order.id]:95}});
 assert.equal(created.status,201,JSON.stringify(created.json));const stock=created.json.data;
 const quote=await request(`/totem/pickup-quote?stockId=${stock.id}&methodId=${order.id}`);
 assert.equal(quote.status,200);assert.equal(quote.json.data.unitPrice,95);assert.ok(quote.json.data.estimatedDate);
 const lead=await request('/totem/leads','POST',{stockId:stock.id,pickupMethodId:order.id,customerName:'Test customer',customerPhone:'24999999999',productName:stock.name});
 assert.equal(lead.status,201,JSON.stringify(lead.json));assert.equal(lead.json.data.quotedPrice,95);
 const tickets=(await request('/pos/tickets')).json.data.items;
 const ticket=tickets.find(t=>t.id===lead.json.data.id);assert.equal(ticket.stockId,stock.id);assert.equal(ticket.pickupMethodId,order.id);assert.equal(ticket.cashPrice,95);
 const pending=(await query('SELECT * FROM pickup_requests WHERE tracking_token=$1',[lead.json.data.trackingToken])).rows[0];
 assert.equal((await request('/pickup-requests/'+pending.id,'PATCH',{status:'ready'})).status,409);
 const sale=await request('/sales/external','POST',{customerPhone:'24999999999',paymentMethod:'Pix',lines:[{stockId:stock.id,name:stock.name,qty:1,unitPrice:1,pickupMethodId:order.id,sourceTicketId:ticket.id}]});
 assert.equal(sale.status,201,JSON.stringify(sale.json));
 const linked=(await query('SELECT * FROM pickup_requests WHERE tracking_token=$1',[lead.json.data.trackingToken])).rows[0];assert.equal(linked.reference_id,sale.json.data.id);
 assert.equal((await query('SELECT count(*)::int n FROM pickup_requests WHERE tracking_token=$1',[lead.json.data.trackingToken])).rows[0].n,1);
 assert.equal((await query('SELECT qty FROM stock_items WHERE id=$1',[stock.id])).rows[0].qty,1);
 assert.equal((await request('/pickup-requests/'+linked.id,'PATCH',{status:'ready'})).status,200);
 const reserved=await request('/sales/external','POST',{paymentMethod:'Pix',lines:[{stockId:stock.id,name:stock.name,qty:1,unitPrice:100}]});assert.equal(reserved.status,400);
 assert.equal((await request('/pickup-requests/'+linked.id,'PATCH',{status:'completed'})).status,200);
 assert.equal((await query('SELECT qty FROM stock_items WHERE id=$1',[stock.id])).rows[0].qty,0);
 assert.equal((await request('/pickup-requests/'+linked.id,'PATCH',{status:'completed'})).status,409);
 const tracked=await fetch(base+'/pickup-tracking/'+lead.json.data.trackingToken);assert.equal((await tracked.json()).data.status,'completed');
});


test('PDV uses persisted pickup prices, applies discounts after quoting and safely retries the last unit',async()=>{
 const method=(await request('/pickup-methods')).json.data.find(m=>m.kind==='immediate');
 const created=await request('/stock','POST',{name:'Last device',kind:'device',qty:1,price:100,pickupPrices:{[method.id]:80}});
 assert.equal(created.status,201);const stock=created.json.data;
 const body={idempotencyKey:'pickup-last-unit',paymentName:'Pix',discount:10,lines:[{stockId:stock.id,name:stock.name,qty:1,unitPrice:1,pickupMethodId:method.id}]};
 const sale=await request('/pos/sales','POST',body);assert.equal(sale.status,201,JSON.stringify(sale.json));
 const row=(await query('SELECT * FROM sales_orders WHERE id=$1',[sale.json.data.id])).rows[0];assert.equal(Number(row.total_amount),70);
 assert.equal((await query('SELECT qty FROM stock_items WHERE id=$1',[stock.id])).rows[0].qty,0);
 const retry=await request('/pos/sales','POST',body);assert.equal(retry.status,200,JSON.stringify(retry.json));assert.equal(retry.json.data.id,sale.json.data.id);
});

after(async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));await db.close();});
