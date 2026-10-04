import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import fs from 'node:fs';
import nodemailer from 'nodemailer';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
process.env.JWT_SECRET='test-only-secret-'.repeat(4);
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/test';
const db=new PGlite();
for(const file of fs.readdirSync('apps/api/src/db/migrations').filter(x=>x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync('apps/api/src/db/migrations/'+file,'utf8'));
const {app}=await import('../dist/app.js');
const {pool}=await import('../dist/db/pool.js');
const auth=await import('../dist/services/authService.js');
const query=async(sql,args=[])=>{const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows??result.rows.length};};
pool.query=query;pool.connect=async()=>({query,release(){}});
for(const n of ['a','b']) {
 await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES($1,$1,$1,$1,$1,'','Test')`,[n]);
 await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES($1,$2,$1,$1,$1)`,['store-'+n,n]);
 await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES($1,$2,$3,$1,'admin',true)`,['user-'+n,n,n+'@example.com']);
 await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES($1,$2,$3,'admin')`,['membership-'+n,'user-'+n,'store-'+n]);
 await query(`INSERT INTO stock_items(id,store_id,name,qty,cost,price) VALUES($1,$2,$1,5,20,50)`,['stock-'+n,'store-'+n]);
 await query(`INSERT INTO customers(id,store_id,name,phone,phone_digits) VALUES($1,$2,$1,'','')`,['customer-'+n,'store-'+n]);
 await query(`INSERT INTO sellers(id,store_id,name) VALUES($1,$2,$1)`,['seller-'+n,'store-'+n]);
}
const token=await auth.createSessionToken({id:'user-a',email:'a@example.com',name:'user-a',role:'admin',clientAccountId:'a'});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}/api/v1`;
const request=(path,body,store='store-a')=>fetch(base+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'x-store-id':store,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const payload={customerId:'customer-a',sellerId:'seller-a',paymentMethod:'Pix',lines:[{stockId:'stock-a',name:'Injected name',qty:1,unitPrice:50}]};
let saleId;
test('communication endpoints require authentication and reject foreign stores', async () => {
 for (const path of ['/whatsapp/status','/whatsapp/qrcode','/store/whatsapp-settings','/store/smtp-settings']) {
  assert.equal((await fetch(base+path)).status,401);
  assert.equal((await request(path,null,'store-b')).status,403);
 }
});
test('communication settings persist only in the selected store and preserve masked secrets', async () => {
 const put=(path,body)=>fetch(base+path,{method:'PUT',headers:{authorization:'Bearer '+token,'x-store-id':'store-a','content-type':'application/json'},body:JSON.stringify(body)});
 const wa={enabled:true,baseUrl:'https://evolution.example.com',instance:'store-a',apiKey:'test-only-api-key',storeNumber:'11999999999'};
 const saved=await put('/store/whatsapp-settings',wa);assert.equal(saved.status,200);const body=await saved.json();assert.equal(body.data.apiKey,'••••••••');
 assert.equal((await put('/store/whatsapp-settings',{...wa,apiKey:'••••••••'})).status,200);
 const row=(await query('SELECT whatsapp_settings FROM stores WHERE id=$1',['store-a'])).rows[0];assert.equal(row.whatsapp_settings.apiKey,wa.apiKey);
 assert.ok(!(await query('SELECT whatsapp_settings FROM stores WHERE id=$1',['store-b'])).rows[0].whatsapp_settings?.apiKey);
 const smtp={enabled:true,host:'smtp.example.com',port:587,secure:false,user:'store-a@example.com',pass:'test-only-password',from:'Loja A <store-a@example.com>'};
 assert.equal((await put('/store/smtp-settings',smtp)).status,200);
 assert.equal((await put('/store/smtp-settings',{...smtp,pass:'••••••••'})).status,200);
 const email=(await query('SELECT smtp_settings FROM stores WHERE id=$1',['store-a'])).rows[0].smtp_settings;assert.equal(email.pass,smtp.pass);assert.equal(email.secure,false);
 const original=pool.query;pool.query=async(sql,args)=>{if(sql.includes('UPDATE stores SET whatsapp_settings'))throw new Error('Simulated database failure');return original(sql,args);};
 try {assert.equal((await put('/store/whatsapp-settings',{...wa,instance:'not-saved'})).status,500);}finally{pool.query=original;}
 assert.equal((await query('SELECT whatsapp_settings FROM stores WHERE id=$1',['store-a'])).rows[0].whatsapp_settings.instance,'store-a');
});
test('Evolution uses the selected store credentials and records accepted, rejected and unknown sends', async () => {
 const original=globalThis.fetch;let providerBody={key:{id:'test-provider-id'}},providerStatus=201,networkError=false;
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://evolution.example.com')){
   assert.equal(init.headers.apikey,'test-only-api-key');assert.ok(String(url).includes('/store-a'));assert.equal(JSON.parse(init.body).number,'5511999999999');
   if(networkError)throw new Error('Connection interrupted');
   return new Response(JSON.stringify(providerBody),{status:providerStatus,headers:{'content-type':'application/json'}});
  }return original(url,init);
 };
 try {
  const result=await request('/whatsapp/test',{number:'11999999999',message:'Isolated test'});assert.equal(result.status,200,JSON.stringify(await result.json()));
  providerBody={};assert.equal((await request('/whatsapp/test',{number:'11999999999'})).status,502);
  providerStatus=401;assert.equal((await request('/whatsapp/test',{number:'11999999999'})).status,502);
  networkError=true;assert.equal((await request('/whatsapp/test',{number:'11999999999'})).status,502);
  const logs=(await query("SELECT status,store_id FROM communication_delivery_logs WHERE channel='whatsapp' ORDER BY created_at")).rows;
  assert.deepEqual(logs.map(r=>r.status),['accepted','unknown','failed','unknown']);assert.ok(logs.every(r=>r.store_id==='store-a'));
 }finally{globalThis.fetch=original;}
});
test('SMTP test uses the store sender, readable HTML and verified TLS without real delivery', async () => {
 const original=nodemailer.createTransport;let reject=false;
 nodemailer.createTransport=(config)=>{assert.equal(config.host,'smtp.example.com');assert.equal(config.secure,false);assert.equal(config.tls.rejectUnauthorized,true);assert.equal(config.auth.pass,'test-only-password');return {verify:async()=>true,sendMail:async(mail)=>{
  assert.equal(mail.from,'Loja A <store-a@example.com>');assert.ok(mail.html.includes('bgcolor="#ffffff"'));assert.ok(!mail.html.includes('#0f172a'));
  return {accepted:reject?[]:[mail.to],rejected:reject?[mail.to]:[],messageId:'test-smtp-id'};
 }};};
 try {
  assert.equal((await request('/store/smtp-settings/test',{recipient:'test@example.com'})).status,200);
  reject=true;assert.equal((await request('/store/smtp-settings/test',{recipient:'test@example.com'})).status,502);
 }finally{nodemailer.createTransport=original;}
});
after(async()=>{server.close();await once(server,'close');await pool.end();await db.close();});
test('external sale commits stock, payment, receivable and finance in one store',async()=>{
 const response=await request('/sales/external',payload);const json=await response.json();assert.equal(response.status,201,JSON.stringify(json));saleId=json.data.id;
 assert.equal((await query('SELECT qty FROM stock_items WHERE id=$1',['stock-a'])).rows[0].qty,4);
 const order=(await query('SELECT * FROM sales_orders WHERE id=$1',[saleId])).rows[0];assert.equal(order.store_id,'store-a');assert.equal(Number(order.final_amount),50);
 for(const table of ['sale_payments','receivables']) assert.equal((await query(`SELECT * FROM ${table} WHERE sale_id=$1`,[saleId])).rows.length,1);
 assert.equal((await query('SELECT * FROM finance_entries WHERE ref_id=$1',[saleId])).rows[0].store_id,'store-a');
 assert.equal((await query('SELECT * FROM sales_order_lines WHERE sale_id=$1',[saleId])).rows[0].name,'stock-a');
 assert.equal(Number((await query('SELECT cost FROM stock_movements WHERE ref_id=$1',[saleId])).rows[0].cost),20);
});
test('foreign customers, sellers, stock and store headers are rejected without writing',async()=>{
 const before=Number((await query('SELECT count(*) AS n FROM sales_orders')).rows[0].n);
 for(const p of [{...payload,customerId:'customer-b'},{...payload,sellerId:'seller-b'},{...payload,lines:[{...payload.lines[0],stockId:'stock-b'}]}]) assert.equal((await request('/sales/external',p)).status,400);
 assert.equal((await request('/sales/external',payload,'store-b')).status,403);
 assert.equal(Number((await query('SELECT count(*) AS n FROM sales_orders')).rows[0].n),before);
 assert.equal((await query('SELECT qty FROM stock_items WHERE id=$1',['stock-b'])).rows[0].qty,5);
});
test('duplicate stock lines cannot oversell and negative totals roll back',async()=>{
 for(const p of [{...payload,lines:[{...payload.lines[0],qty:3},{...payload.lines[0],qty:3}]},{...payload,discount:100}]) assert.equal((await request('/sales/external',p)).status,400);
 assert.equal((await query('SELECT qty FROM stock_items WHERE id=$1',['stock-a'])).rows[0].qty,4);
});
test('database itself rejects foreign tenant relationships',async()=>{
 await assert.rejects(query('UPDATE sales_orders SET customer_id=$1 WHERE id=$2',['customer-b',saleId]),/another store/);
 await assert.rejects(query(`INSERT INTO user_stores(id,user_id,store_id) VALUES('invalid','user-a','store-b')`),/different accounts/);
 await assert.rejects(query(`INSERT INTO sales_order_lines(id,sale_id,stock_item_id,name) VALUES('invalid',$1,'stock-b','invalid')`,[saleId]),/another store/);
});
test('receipt uses stored company and has no cost or profit fields',async()=>{
 const response=await request('/sales/'+saleId+'/receipt');const json=await response.json();assert.equal(response.status,200,JSON.stringify(json));assert.equal(json.data.store.name,'store-a');assert.ok(!JSON.stringify(json.data).includes('grossProfit'));
 assert.equal((await request('/sales/'+saleId+'/receipt',null,'store-b')).status,403);
});

test('same request cannot charge or decrement stock twice',async()=>{
 const p={...payload,requestId:'test-idempotency-123456'};
 const first=await (await request('/sales/external',p)).json();const second=await (await request('/sales/external',p)).json();assert.equal(first.data.id,second.data.id);
 assert.equal((await query('SELECT qty FROM stock_items WHERE id=$1',['stock-a'])).rows[0].qty,3);
});
test('installments remain pending until received and cancel restores stock',async()=>{
 const response=await request('/sales/external',{...payload,installments:3});const json=await response.json();assert.equal(response.status,201,JSON.stringify(json));const id=json.data.id;
 assert.equal((await query('SELECT * FROM finance_entries WHERE ref_id=$1',[id])).rows.length,0);
 const recs=(await query('SELECT amount FROM receivables WHERE sale_id=$1',[id])).rows;assert.equal(recs.length,3);assert.equal(Math.round(recs.reduce((sum,r)=>sum+Number(r.amount),0)*100),5000);
 const cancel=await request('/sales/'+id+'/cancel',{reason:'Teste'});assert.equal(cancel.status,200,JSON.stringify(await cancel.json()));
 assert.equal((await query('SELECT * FROM finance_entries WHERE ref_id=$1',[id])).rows.length,0);
 assert.equal((await query('SELECT qty FROM stock_items WHERE id=$1',['stock-a'])).rows[0].qty,3);
 assert.equal((await request('/sales/'+id+'/cancel',{reason:'Teste'})).status,409);
});
test('employee registration cannot take over another account email',async()=>{
 const response=await request('/employees',{name:'Tentativa',isSystemUser:true,userEmail:'b@example.com',accessPassword:'TestPassword123',role:'admin'});
 assert.equal(response.status,409,JSON.stringify(await response.json()));
 assert.equal((await query('SELECT name FROM users WHERE id=$1',['user-b'])).rows[0].name,'user-b');
 assert.equal((await query('SELECT * FROM employees')).rows.length,0);
});

test('trade-in is persisted in the sale store without an invented resale markup',async()=>{
 const response=await request('/sales/external',{...payload,tradeIn:{deviceName:'Used phone',tradeValue:10}});const json=await response.json();assert.equal(response.status,201,JSON.stringify(json));
 const stock=(await query('SELECT * FROM stock_items WHERE id=$1',[json.data.tradeInStockId])).rows[0];assert.equal(stock.store_id,'store-a');assert.equal(Number(stock.cost),10);assert.equal(Number(stock.price),0);
});

test('catalog and customers API read only the active store',async()=>{
 for(const path of ['/stock','/customers']){const response=await request(path);const json=await response.json();assert.equal(response.status,200,JSON.stringify(json));assert.ok(json.data.some(r=>r.id.endsWith('-a')));assert.ok(!json.data.some(r=>r.id.endsWith('-b')));}
});

test('record ownership cannot be moved to another company',async()=>{
 await assert.rejects(query('UPDATE stock_items SET store_id=$1 WHERE id=$2',['store-b','stock-a']),/another store/);
 await assert.rejects(query('UPDATE users SET client_account_id=$1 WHERE id=$2',['b','user-a']),/reassigned/);
});

test('employee permissions follow membership and disabling removes store access',async()=>{
 const response=await request('/employees',{name:'Operator',isSystemUser:true,userEmail:'operator@example.com',accessPassword:'TestPassword123',role:'operator'});const json=await response.json();assert.equal(response.status,201,JSON.stringify(json));
 const user=(await query('SELECT * FROM users WHERE email=$1',['operator@example.com'])).rows[0];const operatorToken=await auth.createSessionToken({id:user.id,email:user.email,name:user.name,role:'operator',clientAccountId:'a'});
 const headers={authorization:'Bearer '+operatorToken,'x-store-id':'store-a','content-type':'application/json'};
 assert.equal((await fetch(base+'/employees',{method:'POST',headers,body:JSON.stringify({name:'Unauthorized'})})).status,403);
 assert.equal((await fetch(base+'/stock',{headers})).status,200);
 const disabled=await fetch(base+'/employees/'+json.data.id,{method:'PATCH',headers:{...headers,authorization:'Bearer '+token},body:JSON.stringify({active:false})});assert.equal(disabled.status,200,JSON.stringify(await disabled.json()));
 assert.equal((await fetch(base+'/stock',{headers})).status,403);
});

test('PDV persists payment and stock once and rejects duplicate-line overselling',async()=>{
 await query("INSERT INTO stock_items(id,store_id,name,qty,cost,price) VALUES('pdv-stock','store-a','PDV',5,10,20)");
 const body={idempotencyKey:'pdv-idempotency-123',lines:[{stockId:'pdv-stock',name:'PDV',qty:1,unitPrice:20}],paymentName:'Pix'};
 const first=await request('/pos/sales',body);const saved=await first.json();assert.equal(first.status,201,JSON.stringify(saved));
 const second=await request('/pos/sales',body);assert.equal((await second.json()).data.id,saved.data.id);
 const row=(await query('SELECT * FROM sales_orders WHERE id=$1',[saved.data.id])).rows[0];assert.equal(Number(row.final_amount),20);
 assert.equal((await query('SELECT * FROM sale_payments WHERE sale_id=$1',[saved.data.id])).rows.length,1);
 assert.equal((await query("SELECT qty FROM stock_items WHERE id='pdv-stock'")).rows[0].qty,4);
 assert.equal((await request('/pos/sales',{...body,idempotencyKey:'over-sell',lines:[{...body.lines[0],qty:3},{...body.lines[0],qty:3}]})).status,400);
});

test('cash session events require an owned open session and persist canonical fields',async()=>{
 const open=await request('/pos/sessions/open',{openingFloat:100});const json=await open.json();assert.equal(open.status,201,JSON.stringify(json));const id=json.data.id;
 assert.equal((await request('/pos/sessions/open',{openingFloat:5})).status,409);
 const row=(await query('SELECT * FROM cash_sessions WHERE id=$1',[id])).rows[0];assert.equal(Number(row.initial_amount),100);
 assert.equal((await request('/pos/sessions/'+id+'/aporte',{amount:20})).status,200);
 assert.equal((await request('/pos/sessions/foreign/aporte',{amount:20})).status,404);
 assert.equal(Number((await query('SELECT expected_cash FROM cash_sessions WHERE id=$1',[id])).rows[0].expected_cash),120);
 assert.equal((await request('/pos/sessions/'+id+'/close',{countedCash:120})).status,200);
 assert.equal((await request('/pos/sessions/'+id+'/sangria',{amount:5})).status,404);
});

test('financial settlement and reversal preserve actual partial payments and fees',async()=>{
 const account=await request('/finance/accounts',{id:'account-a',name:'Account',initialBalance:100});assert.equal(account.status,201,JSON.stringify(await account.json()));
 await query("INSERT INTO bank_accounts(id,store_id,name,current_balance) VALUES('account-b','store-b','Foreign',100)");
 const bill=await request('/finance/payables',{id:'bill-a',description:'Bill',amount:100,dueDate:'2026-10-10',accountId:'account-a'});assert.equal(bill.status,201,JSON.stringify(await bill.json()));
 const paid=await request('/finance/payables/bill-a/pay',{amount:30,interestAmount:2});assert.equal(paid.status,200,JSON.stringify(await paid.json()));
 assert.equal(Number((await query("SELECT current_balance FROM bank_accounts WHERE id='account-a'")).rows[0].current_balance),68);
 assert.equal((await request('/finance/payables/bill-a/reverse',{})).status,200);
 assert.equal(Number((await query("SELECT current_balance FROM bank_accounts WHERE id='account-a'")).rows[0].current_balance),100);
 assert.equal((await request('/finance/payables/bill-a/reverse',{})).status,409);
 const foreign=await fetch(base+'/finance/accounts/account-b',{method:'PATCH',headers:{authorization:'Bearer '+token,'x-store-id':'store-a','content-type':'application/json'},body:JSON.stringify({name:'Injected'})});const foreignBody=await foreign.json();assert.ok(!foreignBody.data || foreignBody.data.id !== 'account-b');
 assert.equal((await query("SELECT name FROM bank_accounts WHERE id='account-b'")).rows[0].name,'Foreign');
});

test('public totem cannot change settings and cannot pick an arbitrary default store',async()=>{
 assert.equal((await fetch(base+'/totem/settings',{method:'PUT',headers:{'content-type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(base+'/totem/catalog')).status,400);
 const response=await fetch(base+'/totem/settings?storeId=store-a');const json=await response.json();assert.equal(response.status,200,JSON.stringify(json));assert.equal(json.data.exitPassword,undefined);
});

test('receipt email reads the persisted sale and its store SMTP, and rejects foreign sale ids', async()=>{
 const original=nodemailer.createTransport;let count=0;
 nodemailer.createTransport=config=>{assert.equal(config.auth.user,'store-a@example.com');return {sendMail:async mail=>{count++;assert.equal(mail.from,'Loja A <store-a@example.com>');assert.ok(mail.html.includes('stock-a'));assert.ok(mail.html.includes('bgcolor="#ffffff"'));assert.ok(!mail.html.includes('grossProfit'));return {accepted:[mail.to],rejected:[],messageId:'receipt-test-id'};}};};
 try {
  assert.equal((await request('/sales/'+saleId+'/send-receipt-email',{recipient:'test@example.com'})).status,200);
  assert.equal((await request('/sales/foreign-id/send-receipt-email',{recipient:'test@example.com'})).status,404);
  assert.equal(count,1);
  const history=await (await request('/store/communication-deliveries')).json();assert.ok(history.data.length>=1);
  const rows=(await query('SELECT store_id FROM communication_delivery_logs')).rows;assert.ok(rows.every(row=>row.store_id==='store-a'));
 }finally{nodemailer.createTransport=original;}
});
