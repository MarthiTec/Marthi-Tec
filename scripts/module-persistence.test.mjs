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

after(async()=>{server.close();await once(server,'close');await pool.end();await db.close();});
await query("INSERT INTO user_stores(id,user_id,store_id,role) VALUES('platform-member','user-platform','store-platform','admin'),('customer-member','user-customer','store-customer','admin')");
const request=(path,method='GET',body,token=admin)=>fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
const good=async(path,method,body,token)=>{const res=await request(path,method,body,token);const json=await res.json();assert.equal(res.status,200,JSON.stringify(json));return json.data;};
test('perfil grava nome, telefone, endereço, foto e tema para qualquer ID real',async()=>{
 const body={displayName:'Nome atualizado',phone:'21999999999',address:'Endereço real',photo:'data:image/png;base64,test',theme:'dark',role:'superadmin'};
 const saved=await good('/me/profile','PUT',body,ordinary);assert.equal(saved.role,'admin');
 const reread=await good('/me/profile','GET',undefined,ordinary);
 for(const key of ['displayName','phone','address','photo','theme'])assert.equal(reread[key],body[key]);
 await good('/me/profile','PUT',{photo:null,theme:'light'},ordinary);
 const cleared=await good('/me/profile','GET',undefined,ordinary);assert.equal(cleared.photo,null);assert.equal(cleared.theme,'light');
});
test('recebimentos rejeita acesso anônimo e administrador comum',async()=>{
 assert.equal((await request('/admin/payout-settings','GET',undefined,null)).status,401);
 assert.equal((await request('/admin/payout-settings','GET',undefined,ordinary)).status,403);
});
test('dados bancários persistem sem inventar validação de titularidade',async()=>{
 const body={bankCode:'001',bankName:'Banco informado',agency:'0001',accountNumber:'9988',accountType:'corrente',holderName:'Titular informado',holderDocument:'12345678901',validationStatus:'validado'};
 await good('/admin/payout-settings/bank','PUT',body);
 const saved=await good('/admin/payout-settings');assert.equal(saved.bankAccount.accountNumber,'9988');assert.equal(saved.bankAccount.validationStatus,'pendente');
});
test('Pix persiste e não afirma consulta ao DICT',async()=>{
 await good('/admin/payout-settings/pix','PUT',{keyType:'email',keyValue:'recebimento@example.com',isValidated:true});
 const saved=await good('/admin/payout-settings');assert.equal(saved.pix.keyValue,'recebimento@example.com');assert.equal(saved.pix.isValidated,false);assert.equal(saved.pix.receiverInstitution,undefined);
 assert.equal((await request('/admin/payout-settings/pix','PUT',{keyType:'aleatoria',keyValue:'invalid'})).status,400);
 assert.equal((await good('/admin/payout-settings')).pix.keyValue,'recebimento@example.com');
});
let promoId;
test('campanha persiste regras completas e respeita isolamento entre lojas',async()=>{
 const body={name:'Campanha cadastrada',active:true,kind:'percent',criteria:{stockIds:[]},discountPercent:10,tiers:[],giftStockId:'',giftMinQty:1,priority:1,accumulative:false,stockIds:[],note:'Regra do usuário'};
 const saved=await good('/promotions','POST',body);promoId=saved.id;
 assert.equal((await good('/promotions'))[0].discountPercent,10);assert.deepEqual(await good('/promotions','GET',undefined,ordinary),[]);
 assert.equal((await request('/promotions','POST',{...body,id:promoId},ordinary)).status,404);
 assert.equal((await good('/promotions'))[0].name,body.name);
});
test('exclusão de campanha é persistente e limitada à loja proprietária',async()=>{
 assert.equal((await request('/promotions/'+promoId,'DELETE',undefined,ordinary)).status,404);
 await good('/promotions/'+promoId,'DELETE');assert.deepEqual(await good('/promotions'),[]);
});
test('estado dos módulos persiste com isolamento e rejeita sobrescrita concorrente',async()=>{
 const first=await good('/module-state/operations');assert.deepEqual(first,{data:null,revision:0});
 const saved=await good('/module-state/operations','PUT',{revision:0,data:[{id:'one',label:'Atalho cadastrado',href:'/caixa'}]});assert.equal(saved.revision,1);
 assert.equal((await good('/module-state/operations')).data[0].label,'Atalho cadastrado');
 assert.deepEqual(await good('/module-state/operations','GET',undefined,ordinary),{data:null,revision:0});
 assert.equal((await request('/module-state/operations','PUT',{revision:0,data:[]})).status,409);
 assert.equal((await request('/module-state/operations','PUT',{revision:1,data:[]})).status,200);
 assert.equal((await request('/module-state/operations','PUT',{revision:1,data:[{id:'stale'}]})).status,409);
 assert.deepEqual((await good('/module-state/operations')).data,[]);
});
test('senha administrativa do caixa é persistida como hash e nunca retornada ao navegador',async()=>{
 assert.equal((await request('/module-state/cash-settings','PUT',{revision:0,data:{requirePasswordToDeleteItem:true}})).status,400);
 const saved=await good('/module-state/cash-settings','PUT',{revision:0,data:{requirePasswordToDeleteItem:true,deleteItemPassword:'SenhaDefinida!2026'}});
 assert.equal(saved.data.deleteItemPassword,'');assert.equal(saved.data.deletePasswordConfigured,true);assert.equal(saved.data.deletePasswordHash,undefined);
 const stored=(await query("SELECT data FROM store_module_state WHERE store_id='store-platform' AND module_key='cash-settings'")).rows[0].data;
 assert.ok(stored.deletePasswordHash);assert.equal(stored.deleteItemPassword,undefined);assert.ok(!JSON.stringify(stored).includes('SenhaDefinida!2026'));
 assert.equal((await good('/module-state/cash-settings/verify-password','POST',{password:'SenhaDefinida!2026'})).valid,true);
 assert.equal((await good('/module-state/cash-settings/verify-password','POST',{password:'errada'})).valid,false);
 assert.equal((await good('/module-state/cash-settings/verify-password','POST',{password:'SenhaDefinida!2026'},ordinary)).valid,false);
 await good('/module-state/cash-settings','PUT',{revision:1,data:{requirePasswordToDeleteItem:true,deleteItemPassword:'',deletePasswordHash:'forged'}});
 assert.equal((await good('/module-state/cash-settings/verify-password','POST',{password:'SenhaDefinida!2026'})).valid,true);
});
test('catálogo comercial preserva preço zero e reflete alterações no catálogo público',async()=>{
 const catalog=await good('/admin/commercial-plans');assert.ok(catalog.length>0);
 const plan=catalog[0];await good('/admin/commercial-plans/'+plan.id,'PUT',{...plan,price:'R$ 0,00',priceNumeric:0,name:'Plano atualizado'});
 const publicPlans=await good('/commercial-plans','GET',undefined,null);const updated=publicPlans.find(p=>p.id===plan.id);assert.equal(updated.priceNumeric,0);assert.equal(updated.name,'Plano atualizado');
 assert.equal((await request('/admin/commercial-plans/'+plan.id,'PUT',plan,ordinary)).status,403);
});
test('ajuste de inventário grava estoque e movimentos uma única vez',async()=>{
 await query("INSERT INTO stock_items(id,store_id,name,sku,qty,price,cost,unit) VALUES('inventory-a','store-platform','Produto A','A',5,100,70,'UN'),('inventory-b','store-platform','Produto B','B',8,200,120,'UN')");
 const payload={balanceId:'count-persisted',items:[{stockId:'inventory-a',expectedQty:5,countedQty:3}]};
 const first=await good('/stock/inventory-adjustments','POST',payload);assert.equal(first.totalUnitsDelta,-2);
 const repeat=await good('/stock/inventory-adjustments','POST',payload);assert.equal(repeat.alreadyApplied,true);
 assert.equal(Number((await query("SELECT qty FROM stock_items WHERE id='inventory-a'")).rows[0].qty),3);
 assert.equal((await query("SELECT * FROM stock_movements WHERE stock_id='inventory-a'")).rows.length,1);
});
test('inventário desfaz o lote inteiro se um saldo mudar e rejeita produto de outra loja',async()=>{
 const payload={balanceId:'count-conflict',items:[{stockId:'inventory-a',expectedQty:3,countedQty:2},{stockId:'inventory-b',expectedQty:7,countedQty:6}]};
 assert.equal((await request('/stock/inventory-adjustments','POST',payload)).status,409);
 assert.equal(Number((await query("SELECT qty FROM stock_items WHERE id='inventory-a'")).rows[0].qty),3);
 assert.equal((await query("SELECT * FROM stock_movements WHERE stock_id='inventory-a'")).rows.length,1);
 assert.equal((await request('/stock/inventory-adjustments','POST',{balanceId:'foreign',items:[{stockId:'inventory-a',expectedQty:3,countedQty:2}]},ordinary)).status,404);
});
test('cadastro público rejeita módulos acima do catálogo antes de registrar contratação',async()=>{
 const payload={planId:'bronze',modules:['erp','os','pdv'],documentType:'cnpj',document:'12345678000199',legalName:'Empresa do cadastro',tradeName:'Loja do cadastro',email:'cadastro@example.com',phone:'21999999999',zipCode:'20000000',street:'Rua cadastrada',number:'1',district:'Centro',city:'Rio de Janeiro',state:'RJ',contactName:'Responsável',payNow:true,paymentMethod:'pix'};
 assert.equal((await request('/partners/signup','POST',payload,null)).status,400);
 assert.equal((await query('SELECT id FROM partner_signups')).rows.length,0);
});
