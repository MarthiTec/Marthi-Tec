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




test('settings save fails honestly and never changes stored settings on a database error',async()=>{
 const before=(await request('/store/totem-settings')).json.data;
 const original=pool.query;
 pool.query=async(sql,args)=>{if(sql.includes('UPDATE stores SET totem_exit_password'))throw new Error('test write failure');return original(sql,args);};
 try {assert.equal((await request('/store/totem-settings','PUT',{storeName:'Must not save'})).status,500);}finally{pool.query=original;}
 assert.equal((await request('/store/totem-settings')).json.data.storeName,before.storeName);
});
test('custom kiosk header survives a database reread and stays in its own store',async()=>{
 const before=(await request('/store/totem-settings')).json.data;
 const saved=await request('/store/totem-settings','PUT',{...before,headerSubtitle:'Assistência técnica · Centro',attractLayout:'logoPromo',attractContent:'background'});
 assert.equal(saved.status,200,JSON.stringify(saved.json));
 assert.equal((await request('/store/totem-settings')).json.data.attractLayout,'logoPromo');
 assert.equal((await request('/totem/settings')).json.data.attractContent,'background');
 assert.equal((await request('/store/totem-settings')).json.data.headerSubtitle,'Assistência técnica · Centro');
 const others=(await query("SELECT count(*)::int n FROM stores WHERE totem_settings->>'headerSubtitle'=$1",['Assistência técnica · Centro'])).rows[0].n;
 assert.equal(others,1);
});
test('Totem request is canonical, tenant scoped, idempotent and WhatsApp failure retains the cashier queue',async()=>{
 const method=(await request('/pickup-methods')).json.data.find(m=>m.kind==='immediate');
 const item=(await request('/stock','POST',{name:'Audit device',qty:2,price:150,showOnTotem:true,pickupPrices:{[method.id]:140}})).json.data;
 const body={requestKey:'audit-lead-one',destination:'whatsapp',stockId:item.id,pickupMethodId:method.id,customerName:'Audit customer',customerPhone:'24999999999',productName:'Forged name',priceLabel:'R$ 1,00'};
 const first=await request('/totem/leads','POST',body);assert.equal(first.status,201,JSON.stringify(first.json));
 assert.equal(first.json.data.productName,'Audit device');assert.equal(first.json.data.quotedPrice,140);assert.equal(first.json.data.priceLabel,(140).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));
 assert.equal(first.json.data.whatsappStatus,'unconfirmed');assert.ok(first.json.data.notificationWarning);
 const second=await request('/totem/leads','POST',body);assert.equal(second.status,200);assert.equal(second.json.data.id,first.json.data.id);
 assert.equal((await query('SELECT count(*)::int n FROM pos_tickets WHERE request_key=$1',[body.requestKey])).rows[0].n,1);
 assert.equal((await query('SELECT product_name FROM pos_tickets WHERE id=$1',[first.json.data.id])).rows[0].product_name,'Audit device');
 const ticket=(await request('/pos/tickets')).json.data.items.find(t=>t.id===first.json.data.id);assert.equal(ticket.cashPrice,140);assert.equal(ticket.status,'open');
 assert.equal((await request('/totem/leads','POST',{...body,requestKey:'audit-bad-attribute',attributes:[{id:'foreign',name:'Cor',value:'Azul'}]})).status,400);
 const foreign=(await request('/stock','POST',{name:'Hidden item',qty:1,price:10,showOnTotem:false})).json.data;
 assert.equal((await request('/totem/leads','POST',{...body,requestKey:'audit-hidden',stockId:foreign.id})).status,404);
 assert.equal((await request('/totem/leads','POST',{...body,requestKey:'audit-store-change'},'store-b')).status,404);
 const publicCatalog=(await request('/totem/catalog')).json.data;assert.ok(publicCatalog.some(i=>i.id===item.id));assert.ok(!publicCatalog.some(i=>i.id===foreign.id));
});
test('18 installments use the same machine fee in public settings and the canonical order',async()=>{
 const machine=[{id:'machine',active:true,isDefaultTotem:true,defaultBrandId:'visa',brands:[{id:'visa',active:true,installments:[{installment:12,rate:16.8}]}]}];
 await query("INSERT INTO store_module_state(store_id,module_key,data,revision,updated_by) VALUES($1,'card-rates',$2::jsonb,1,'user-a')",['store-a',JSON.stringify(machine)]);
 const settings=(await request('/totem/settings')).json.data;assert.equal(settings.cardInstallmentRates['18'],16.8);
 const method=(await request('/pickup-methods')).json.data.find(m=>m.kind==='immediate');
 const item=(await request('/stock','POST',{name:'Installment device',qty:1,price:7500,showOnTotem:true,pickupPrices:{[method.id]:7500}})).json.data;
 const result=await request('/totem/leads','POST',{stockId:item.id,pickupMethodId:method.id,customerName:'Local audit',payment:'Parcelado',installment:'18x',destination:'cashier'});
 assert.equal(result.status,201,JSON.stringify(result.json));assert.equal(result.json.data.priceLabel,'18x · 18 X '+(486.67).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));
});
test('public revision changes for price updates only in the selected store',async()=>{
 const first=(await request('/totem/revision')).json.data.revision;
 const other=(await request('/totem/revision','GET',undefined,'store-b')).json.data.revision;
 await query("UPDATE stock_items SET price=price+1,updated_at=now() WHERE store_id='store-a'");
 assert.notEqual((await request('/totem/revision')).json.data.revision,first);
 assert.equal((await request('/totem/revision','GET',undefined,'store-b')).json.data.revision,other);
});
test('finance rejects a bank account from another store without settling or creating an entry',async()=>{
 await query("INSERT INTO bank_accounts(id,store_id,name) VALUES('foreign-account','store-b','Private account')");
 const bill=await request('/finance/payables','POST',{description:'Audit bill',amount:100,dueDate:'2026-10-10'});assert.equal(bill.status,201,JSON.stringify(bill.json));
 const wrong=await request('/finance/payables/'+bill.json.data.id+'/pay','POST',{amount:100,accountId:'foreign-account'});assert.equal(wrong.status,400,JSON.stringify(wrong.json));
 const saved=(await query('SELECT * FROM payables WHERE id=$1',[bill.json.data.id])).rows[0];assert.equal(saved.status,'open');assert.equal(Number(saved.paid_amount),0);
 assert.equal((await query('SELECT count(*)::int n FROM finance_entries WHERE ref_id=$1',[bill.json.data.id])).rows[0].n,0);
});
after(async()=>{server.close();await db.close();});

test('people, permissions and price tables survive rereads and remain store scoped',async()=>{
 for(const [resource,table,payload] of [
  ['customers','customers',{name:'Audit buyer',phone:'21988887777',email:'buyer@example.com'}],
  ['suppliers','suppliers',{name:'Audit supplier',city:'Rio',active:true}],
  ['sellers','sellers',{name:'Audit seller',commissionPercent:2.5,active:true}],
  ['employees','employees',{name:'Audit employee',role:'operator',isSystemUser:false,permissions:{erp_customers:{view:true,edit:false}},accessAreas:['erp'],active:true}],
  ['price-tables','price_tables',{name:'Audit wholesale',percent:-8,active:true}]
 ]) {
  const made=await request('/'+resource,'POST',payload);assert.equal(made.status,201,JSON.stringify(made.json));
  const id=made.json.data.id;assert.ok(id);
  assert.equal((await query('SELECT store_id FROM '+table+' WHERE id=$1',[id])).rows[0].store_id,'store-a');
  const reread=await request('/'+resource);assert.equal(reread.status,200);assert.ok(reread.json.data.some(row=>row.id===id));
  const changed=await request('/'+resource+'/'+id,'PATCH',{name:payload.name+' updated'});assert.equal(changed.status,200,JSON.stringify(changed.json));
  assert.equal((await query('SELECT name FROM '+table+' WHERE id=$1',[id])).rows[0].name,payload.name+' updated');
 }
 const employee=(await query("SELECT permissions FROM employees WHERE name='Audit employee updated'")).rows[0];
 assert.deepEqual(employee.permissions,{erp_customers:{view:true,edit:false}});
 const pt=(await request('/price-tables','POST',{name:'Retail',percent:0})).json.data;
 const method=(await request('/payments','POST',{name:'Audit Pix',type:'pix',priceTableId:pt.id})).json.data;
 const target=(await request('/price-tables','POST',{name:'New terms',percent:3})).json.data;
 assert.equal((await request('/payments/'+method.id,'PATCH',{priceTableId:target.id})).status,200);
 assert.equal((await query('SELECT price_table_id FROM payment_methods WHERE id=$1',[method.id])).rows[0].price_table_id,target.id);
 await query("INSERT INTO price_tables(id,store_id,name,percent) VALUES('foreign-table','store-b','Private',0)");
 assert.equal((await request('/payments/'+method.id,'PATCH',{priceTableId:'foreign-table'})).status,400);
 assert.equal((await request('/suppliers','POST',{name:'Anonymous'},'store-b')).status,403);
});

test('customers without phones remain independent; active, address and document fields persist without foreign disclosure',async()=>{
 const first=await request('/customers','POST',{name:'No phone one',active:false,neighborhood:'Centro'});
 const second=await request('/customers','POST',{name:'No phone two'});
 assert.equal(first.status,201,JSON.stringify(first.json));assert.equal(second.status,201,JSON.stringify(second.json));assert.notEqual(first.json.data.id,second.json.data.id);
 assert.equal(first.json.data.active,false);assert.equal(first.json.data.phoneDigits,null);
 assert.equal((await request('/customers/'+first.json.data.id,'PATCH',{complement:'Sala 2',documentType:'cnpj',active:true,neighborhood:'Bairro'})).status,200);
 const saved=(await query('SELECT * FROM customers WHERE id=$1',[first.json.data.id])).rows[0];assert.equal(saved.complement,'Sala 2');assert.equal(saved.document_type,'cnpj');assert.equal(saved.active,true);assert.equal(saved.district,'Bairro');
 await query("INSERT INTO customers(id,store_id,name,phone,phone_digits) VALUES('foreign-customer','store-b','Private','','foreign')");
 const forbidden=await request('/customers/foreign-customer','PATCH',{name:'Attack'});assert.equal(forbidden.status,404);assert.equal(forbidden.json.data,undefined);
 const duplicate=await request('/customers','POST',{name:'Duplicate phone',phone:'21988887777'});assert.equal(duplicate.status,409);
 assert.equal((await query("SELECT name FROM customers WHERE phone_digits='21988887777' AND store_id='store-a'")).rows[0].name,'Audit buyer updated');
});
