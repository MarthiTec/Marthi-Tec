import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import fs from 'node:fs';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
process.env.JWT_SECRET='store-address-secret-'.repeat(4);
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/test';
const db=new PGlite();
for(const file of fs.readdirSync('apps/api/src/db/migrations').filter(x=>x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync('apps/api/src/db/migrations/'+file,'utf8'));
const {app}=await import('../dist/app.js');
const {pool}=await import('../dist/db/pool.js');
const auth=await import('../dist/services/authService.js');
const query=async(sql,args=[])=>{const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows??result.rows.length};};
pool.query=query;pool.connect=async()=>({query,release(){}});
for(const id of ['platform','shop','other']) {
 await query("INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name,status) VALUES($1,$1,$1,$1,$2,'','Owner','active')",[id,id+'@example.com']);
 await query("INSERT INTO stores(id,client_account_id,trade_name,legal_name,document,zip_code,street,number,district,city,state,is_matrix,active) VALUES($1,$2,$1,$1,$1,'25802-180','Rua Velha','10','Centro','Três Rios','RJ',true,true)",['store-'+id,id]);
 await query("INSERT INTO users(id,client_account_id,email,name,global_role,active,password_hash) VALUES($1,$2,$3,$1,$4,true,'salt:hash')",['user-'+id,id,id+'@example.com',id==='platform'?'superadmin':'admin']);
}
await query("INSERT INTO user_stores(id,user_id,store_id,role,is_default) VALUES('us-shop','user-shop','store-shop','admin',true)");
// Filial desativada do cliente: nenhuma edição pelo /admin pode religá-la.
await query("INSERT INTO stores(id,client_account_id,trade_name,legal_name,document,is_matrix,active) VALUES('store-shop-branch','shop','Filial','Filial','branch-doc',false,false)");
// Outra conta com o mesmo e-mail do cliente editado: não pode ser alterada junto.
await query("UPDATE client_accounts SET email='shop@example.com' WHERE id='other'");
const admin=await auth.createSessionToken({id:'user-platform',email:'platform@example.com',name:'Platform',role:'superadmin',clientAccountId:'platform'});
const owner=await auth.createSessionToken({id:'user-shop',email:'shop@example.com',name:'Shop',role:'admin',clientAccountId:'shop'});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}/api/v1`;
const call=(method,path,body,token=admin)=>fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
const address={zipCode:'25802-180',street:'Rua Doutor Walmir Peçanha',number:'119',complement:'Loja 2',district:'Centro',city:'Três Rios',state:'rj',cityCode:'3306008'};

test('toggle-access requires an authenticated platform administrator',async()=>{
 assert.equal((await call('POST','/admin/clients/toggle-access',{email:'shop@example.com',active:false},null)).status,401);
 assert.equal((await call('POST','/admin/clients/toggle-access',{email:'shop@example.com',active:false},owner)).status,403);
 assert.equal((await query("SELECT active FROM users WHERE id='user-shop'")).rows[0].active,true);
});

test('/admin lists the matrix store address and saves an edited address to the database',async()=>{
 const list=await (await call('GET','/admin/clients')).json();
 const shop=list.data.find(c=>c.clientId==='shop');
 assert.equal(shop.storeId,'store-shop');
 assert.equal(shop.address.street,'Rua Velha');
 await query("INSERT INTO store_licenses(id,store_id,client_account_id,plan_id,modules,status) VALUES('lic-shop','store-shop','shop','start',ARRAY['erp'],'active')");
 // Mesmo corpo que a tela de edição envia (plano, módulos, pagamento, observações, endereço).
 const r=await call('PUT','/admin/clients/shop',{tradeName:'Shop',email:'shop@example.com',phone:'',planId:'golden',modules:['totem','erp'],monthlyAmount:597,status:'active',paymentOk:true,notes:'',storeId:'store-shop',address});
 assert.equal(r.status,200,await r.clone().text());
 const lic=(await query("SELECT plan_id,modules FROM store_licenses WHERE id='lic-shop'")).rows[0];
 assert.equal(lic.plan_id,'scale');
 assert.deepEqual(lic.modules,['totem','erp']);
 const row=(await query("SELECT zip_code,street,number,complement,district,city,state,ibge_city_code FROM stores WHERE id='store-shop'")).rows[0];
 assert.deepEqual(row,{zip_code:'25802-180',street:'Rua Doutor Walmir Peçanha',number:'119',complement:'Loja 2',district:'Centro',city:'Três Rios',state:'RJ',ibge_city_code:'3306008'});
 const again=(await (await call('GET','/admin/clients')).json()).data.find(c=>c.clientId==='shop');
 assert.equal(again.address.street,'Rua Doutor Walmir Peçanha');
 assert.equal(again.address.cityCode,'3306008');
});

test('editing a client touches only that account and does not reactivate a disabled branch',async()=>{
 await call('PUT','/admin/clients/shop',{tradeName:'Shop Renomeada',email:'shop@example.com',status:'active'});
 assert.equal((await query("SELECT trade_name FROM client_accounts WHERE id='other'")).rows[0].trade_name,'other');
 assert.equal((await query("SELECT active FROM stores WHERE id='store-shop-branch'")).rows[0].active,false);
 assert.equal((await query("SELECT trade_name FROM stores WHERE id='store-shop-branch'")).rows[0].trade_name,'Filial');
 assert.equal((await query("SELECT street FROM stores WHERE id='store-other'")).rows[0].street,'Rua Velha');
});

test('invalid UF is refused and a store of another account cannot be targeted',async()=>{
 assert.equal((await call('PUT','/admin/clients/shop',{address:{...address,state:'Rio'}})).status,400);
 const r=await call('PUT','/admin/clients/shop',{storeId:'store-other',address:{...address,street:'Invasão'}});
 assert.equal(r.status,422);
 assert.equal((await query("SELECT street FROM stores WHERE id='store-other'")).rows[0].street,'Rua Velha');
});

test('merchant store update saves complement, tax regime and IBGE code; other account store is 404',async()=>{
 const r=await call('PATCH','/stores/store-shop',{complement:'Sala 5',taxRegime:'lucro_presumido',ibgeCityCode:'33.06008',state:'rj'},owner);
 assert.equal(r.status,200);
 const row=(await query("SELECT complement,tax_regime,ibge_city_code,state FROM stores WHERE id='store-shop'")).rows[0];
 assert.deepEqual(row,{complement:'Sala 5',tax_regime:'lucro_presumido',ibge_city_code:'3306008',state:'RJ'});
 assert.equal((await call('PATCH','/stores/store-other',{street:'Invasão'},owner)).status,404);
 assert.equal((await query("SELECT street FROM stores WHERE id='store-other'")).rows[0].street,'Rua Velha');
});

test('client created by /admin keeps the informed address (no fixed placeholder address)',async()=>{
 const r=await call('POST','/admin/clients',{clientId:'CLI-NEWSHOP',tradeName:'New Shop',document:'11.222.333/0001-81',email:'new@example.com',monthlyAmount:0,address});
 assert.equal(r.status,201);
 const row=(await query("SELECT street,city,state,ibge_city_code FROM stores WHERE client_account_id='CLI-NEWSHOP'")).rows[0];
 assert.deepEqual(row,{street:'Rua Doutor Walmir Peçanha',city:'Três Rios',state:'RJ',ibge_city_code:'3306008'});
 const blank=await call('POST','/admin/clients',{clientId:'CLI-BLANK',tradeName:'Blank',document:'22.333.444/0001-81',email:'blank@example.com',monthlyAmount:0});
 assert.equal(blank.status,201);
 assert.equal((await query("SELECT street FROM stores WHERE client_account_id='CLI-BLANK'")).rows[0].street,'');
 // Sem documento, ou com o CNPJ de outro cliente, nada é sobrescrito.
 assert.equal((await call('POST','/admin/clients',{tradeName:'Sem Doc',email:'nodoc@example.com',monthlyAmount:0})).status,422);
 assert.equal((await call('POST','/admin/clients',{clientId:'CLI-COPY',tradeName:'Copia',document:'11222333000181',email:'copy@example.com',monthlyAmount:0})).status,409);
 assert.equal((await query("SELECT trade_name FROM client_accounts WHERE id='CLI-NEWSHOP'")).rows[0].trade_name,'New Shop');
 // Limpeza do que o teste inseriu (DELETE pelo próprio endpoint).
 for(const id of ['CLI-NEWSHOP','CLI-BLANK']) assert.equal((await call('DELETE','/admin/clients/'+id)).status,200);
 assert.equal((await query("SELECT count(*)::int n FROM client_accounts WHERE id IN ('CLI-NEWSHOP','CLI-BLANK')")).rows[0].n,0);
});

after(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();});
