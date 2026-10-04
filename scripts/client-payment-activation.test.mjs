import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import fs from 'node:fs';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
process.env.JWT_SECRET='payment-test-secret-'.repeat(4);
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/test';
const db=new PGlite();
for(const file of fs.readdirSync('apps/api/src/db/migrations').filter(x=>x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync('apps/api/src/db/migrations/'+file,'utf8'));
const {app}=await import('../dist/app.js');
const {pool}=await import('../dist/db/pool.js');
const auth=await import('../dist/services/authService.js');
const {confirmExistingClientPayment}=await import('../dist/services/clientPaymentActivation.js');
const query=async(sql,args=[])=>{const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows??result.rows.length};};
pool.query=query;pool.connect=async()=>({query,release(){}});
for(const id of ['platform','customer','pending','incomplete']) {
 await query("INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES($1,$1,$1,$1,$2,'','Owner')",[id,id+'@example.com']);
 await query("INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES($1,$2,$1,$1,$1)",['store-'+id,id]);
 await query("INSERT INTO users(id,client_account_id,email,name,global_role,active,password_hash) VALUES($1,$2,$3,$1,$4,true,$5)",['user-'+id,id,id+'@example.com',id==='platform'?'superadmin':'admin',id==='pending'?'LOCKED_PENDING_ACTIVATION':'salt:existing-hash']);
 if(id!=='incomplete') await query("INSERT INTO store_licenses(id,store_id,client_account_id,plan_id,modules,final_price) VALUES($1,$2,$3,'bronze',ARRAY['erp'],0)",['license-'+id,'store-'+id,id]);
}
await db.exec(`CREATE TYPE payment_test_module AS ENUM ('erp'); ALTER TABLE store_licenses ALTER COLUMN modules DROP DEFAULT; ALTER TABLE store_licenses ALTER COLUMN modules TYPE payment_test_module[] USING modules::text[]::payment_test_module[];`);
const admin=await auth.createSessionToken({id:'user-platform',email:'platform@example.com',name:'Platform',role:'superadmin',clientAccountId:'platform'});
const ordinary=await auth.createSessionToken({id:'user-customer',email:'customer@example.com',name:'Customer',role:'admin',clientAccountId:'customer'});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}/api/v1`;
const confirm=(body,token=admin)=>fetch(base+'/partners/payment-confirm',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
const input={protocol:'customer',paymentMethod:'pix',transactionRef:'real-reference'};
test('manual confirmation requires authenticated platform administrator',async()=>{
 assert.equal((await confirm(input,null)).status,401);
 assert.equal((await confirm(input,ordinary)).status,403);
 assert.equal((await query('SELECT * FROM client_payment_confirmations')).rows.length,0);
});
test('confirmation survives re-reading and preserves store, plan, zero price and existing password',async()=>{
 const r=await confirm(input);assert.equal(r.status,200);assert.equal((await r.json()).data.status,'acesso_ativado');
 for(let i=0;i<2;i++){const response=await fetch(base+'/admin/clients',{headers:{authorization:'Bearer '+admin}});assert.equal(response.status,200);const all=await response.json();const customer=all.data.find(x=>x.clientId==='customer');assert.equal(customer.paymentOk,true);assert.equal(customer.monthlyAmount,0);assert.equal(customer.passwordConfigured,true);}
 assert.equal((await query("SELECT count(*)::int n FROM stores WHERE client_account_id='customer'")).rows[0].n,1);
 const l=(await query("SELECT *,modules::text[] as modules FROM store_licenses WHERE client_account_id='customer'")).rows[0];assert.equal(l.plan_id,'bronze');assert.deepEqual(l.modules,['erp']);
 assert.equal((await query("SELECT password_hash FROM users WHERE id='user-customer'")).rows[0].password_hash,'salt:existing-hash');
});
test('repeating confirmation does not duplicate records or generate password tokens',async()=>{
 assert.equal((await (await confirm(input)).json()).data.alreadyProcessed,true);
 assert.equal((await query("SELECT count(*)::int n FROM client_payment_confirmations WHERE client_account_id='customer'")).rows[0].n,1);
 assert.equal((await query("SELECT count(*)::int n FROM auth_tokens WHERE client_id='customer'")).rows[0].n,0);
});
test('pending owner receives a durable token without setting a fake password',async()=>{
 const result=await confirmExistingClientPayment({protocol:'pending',paymentMethod:'pix',actorId:'user-platform'});
 assert.equal(result.status,'acesso_pendente');assert.ok(result.rawToken);
 assert.equal((await query("SELECT count(*)::int n FROM auth_tokens WHERE client_id='pending'")).rows[0].n,1);
 assert.equal((await query("SELECT password_hash FROM users WHERE id='user-pending'")).rows[0].password_hash,'LOCKED_PENDING_ACTIVATION');
});
test('missing license rolls back and cannot report a successful release',async()=>{
 assert.equal((await confirm({protocol:'incomplete',paymentMethod:'pix'})).status,409);
 assert.equal((await query("SELECT count(*)::int n FROM client_payment_confirmations WHERE client_account_id='incomplete'")).rows[0].n,0);
});
test('unknown customer cannot fabricate company data',async()=>{
 assert.equal((await confirm({protocol:'unknown',email:'unknown@example.com',tradeName:'Invented',paymentMethod:'pix'})).status,404);
 assert.equal((await query("SELECT count(*)::int n FROM client_accounts WHERE id='unknown'")).rows[0].n,0);
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();});
