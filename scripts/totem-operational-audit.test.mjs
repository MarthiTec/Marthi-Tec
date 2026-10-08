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
test('a legacy production pos_tickets with required payment no longer blocks totem orders',async()=>{
 // Produção tinha pos_tickets antiga com "payment" obrigatório e sem default.
 await query('ALTER TABLE pos_tickets ADD COLUMN IF NOT EXISTS payment TEXT');
 await query("UPDATE pos_tickets SET payment='À vista' WHERE payment IS NULL");
 await query('ALTER TABLE pos_tickets ALTER COLUMN payment SET NOT NULL');
 await db.exec(fs.readFileSync('apps/api/src/db/migrations/0057_pos_tickets_legacy_not_null.sql','utf8'));
 const method=(await request('/pickup-methods')).json.data.find(m=>m.kind==='immediate');
 const item=(await request('/stock','POST',{name:'Legacy schema device',qty:1,price:4650,showOnTotem:true,pickupPrices:{[method.id]:4650}})).json.data;
 const lead=await request('/totem/leads','POST',{stockId:item.id,pickupMethodId:method.id,customerName:'Cliente legado',customerPhone:'24981244253',destination:'cashier'});
 assert.equal(lead.status,201,JSON.stringify(lead.json));
 const nullable=(await query("SELECT is_nullable FROM information_schema.columns WHERE table_name='pos_tickets' AND column_name='payment'")).rows[0].is_nullable;
 assert.equal(nullable,'YES');
});
test('concluding on WhatsApp sends the configured message from the store number straight to the customer phone',async()=>{
 await query(`UPDATE stores SET whatsapp_settings=$1::jsonb WHERE id='store-a'`,[JSON.stringify({enabled:true,baseUrl:'https://evo.test',instance:'loja-a',apiKey:'store-key',storeNumber:'',notifyCustomer:false,locationLabel:''})]);
 const current=(await request('/store/totem-settings')).json.data;
 const template='Oi, {nome}! 🎉\nAqui é *{vendedor}*, da *{loja}*.\n📱 *{produto}*\n✨ {atributos}\n💳 Pagamento: *{pagamento}*\n📦 Retirada: {retirada}\n🎟️ Cupom: {cupom}';
 assert.equal((await request('/store/totem-settings','PUT',{...current,storeName:'Cell Ponto',assistant:{...current.assistant,name:'Mariana'},customerWhatsAppMessage:template})).status,200);
 const method=(await request('/pickup-methods')).json.data.find(m=>m.kind==='immediate');
 const item=(await request('/stock','POST',{name:'IPHONE 16',qty:1,price:4650,showOnTotem:true,pickupPrices:{[method.id]:4650}})).json.data;
 const original=globalThis.fetch;const sent=[];
 globalThis.fetch=async(url,init)=>{if(String(url).startsWith('https://evo.test/message/sendText/')){sent.push({url:String(url),apikey:init.headers.apikey,body:JSON.parse(init.body)});return new Response(JSON.stringify({key:{id:'MSG-1'}}),{status:201,headers:{'content-type':'application/json'}});}return original(url,init);};
 try{
  const lead=await request('/totem/leads','POST',{destination:'whatsapp',stockId:item.id,pickupMethodId:method.id,customerName:'MATHEUS SILVA',customerPhone:'(24) 98124-4253',productName:item.name});
  assert.equal(lead.status,201,JSON.stringify(lead.json));
  assert.equal(lead.json.data.customerNotified,true);assert.equal(lead.json.data.whatsappStatus,'accepted');
 }finally{globalThis.fetch=original;}
 assert.equal(sent.length,1,'only the customer receives a message');
 assert.equal(sent[0].url,'https://evo.test/message/sendText/loja-a');assert.equal(sent[0].apikey,'store-key');
 assert.equal(sent[0].body.number,'5524981244253');
 const text=sent[0].body.text;
 assert.match(text,/^Oi, Matheus! 🎉/);assert.match(text,/\*Mariana\*, da \*Cell Ponto\*/);assert.match(text,/📱 \*IPHONE 16\*/);
 assert.match(text,/Pagamento: \*À vista\*/);assert.match(text,/Retirada: /);
 assert.ok(!text.includes('{'),'no raw placeholder reaches the customer');assert.ok(!text.includes('Cupom'),'a line whose placeholders are all empty is dropped');
 assert.equal((await request('/totem/leads','POST',{destination:'whatsapp',stockId:item.id,pickupMethodId:method.id,customerName:'Sem telefone',customerPhone:''})).status,400);
});
test('a cart order quotes every item on the server, shares one ticket code and sends a single WhatsApp listing all items',async()=>{
 const current=(await request('/store/totem-settings')).json.data;
 assert.equal((await request('/store/totem-settings','PUT',{...current,customerWhatsAppMessage:['Oi, {nome}!','📱 *{produto}*','{itens}','💰 Total: *{valor}*'].join('\n')})).status,200);
 const method=(await request('/pickup-methods')).json.data.find(m=>m.kind==='immediate');
 const burger=(await request('/stock','POST',{name:'X-Burger',qty:10,price:30,showOnTotem:true,pickupPrices:{[method.id]:30}})).json.data;
 const soda=(await request('/stock','POST',{name:'Refrigerante',qty:10,price:8,showOnTotem:true,pickupPrices:{[method.id]:8}})).json.data;
 const original=globalThis.fetch;const sent=[];
 globalThis.fetch=async(url,init)=>{if(String(url).startsWith('https://evo.test/message/sendText/')){sent.push(JSON.parse(init.body));return new Response(JSON.stringify({key:{id:'MSG-CART'}}),{status:201,headers:{'content-type':'application/json'}});}return original(url,init);};
 let lead;
 try{
  lead=await request('/totem/leads','POST',{destination:'whatsapp',customerName:'ana paula',customerPhone:'24999990000',payment:'À vista',
   items:[{stockId:burger.id,pickupMethodId:method.id,qty:2},{stockId:soda.id,pickupMethodId:method.id,qty:1}]});
 }finally{globalThis.fetch=original;}
 assert.equal(lead.status,201,JSON.stringify(lead.json));
 assert.equal(lead.json.data.total,68,'2 × 30 + 8, priced by the server');
 assert.equal(lead.json.data.ticketIds.length,2);
 const rows=(await query('SELECT id,code,product_name,configuration FROM pos_tickets WHERE id = ANY($1::text[]) ORDER BY id',[lead.json.data.ticketIds])).rows;
 assert.equal(new Set(rows.map(r=>r.code)).size,1,'every cart line shares the same ticket code');
 assert.deepEqual(rows.map(r=>r.configuration.qty).sort(),[1,2]);
 assert.ok(rows.every(r=>r.configuration.cartId===lead.json.data.id&&r.configuration.whatsappStatus==='accepted'));
 assert.equal(sent.length,1,'one message for the whole cart');
 assert.match(sent[0].text,/Oi, Ana!/);
 assert.match(sent[0].text,/2x X-Burger \+ 1x Refrigerante/);
 assert.match(sent[0].text,/R\$\s?68,00/);
 const forged=await request('/totem/leads','POST',{destination:'cashier',customerName:'Teste',items:[{stockId:'nao-existe',pickupMethodId:method.id,qty:1}]});
 assert.equal(forged.status,404);
});
