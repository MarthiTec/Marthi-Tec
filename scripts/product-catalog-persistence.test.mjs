import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import fs from 'node:fs';
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
after(async()=>{server.close();await once(server,'close');await pool.end();await db.close();});
test('one product and SKU persist all photos and variations in the correct store',async()=>{
 const images=Array.from({length:10},(_,i)=>`https://catalog.example.test/product/${i}.webp`);
 const variations=Array.from({length:8},(_,i)=>({id:'variation-'+i,attrs:{color:i%2?'Azul':'Laranja',capacity:i<4?'256 GB':'512 GB'},qty:1,cost:100,price:150+i,pickupPrices:{}}));
 const res=await request('/stock',{name:'Produto com grade',sku:'MASTER-ONE',skuAuto:false,showOnTotem:true,images,variations});
 const result=await res.json();assert.equal(res.status,201,JSON.stringify(result));const id=result.data.id;
 assert.equal(result.data.sku,'MASTER-ONE');assert.deepEqual(result.data.images,images);assert.equal(result.data.variations.length,8);
 assert.equal((await query('SELECT count(*)::int n FROM stock_items WHERE id=$1',[id])).rows[0].n,1);
 assert.equal((await query('SELECT count(*)::int n FROM stock_item_variations WHERE stock_item_id=$1 AND store_id=$2',[id,'store-a'])).rows[0].n,8);
 const reread=await (await request('/stock')).json();assert.deepEqual(reread.data.find(p=>p.id===id).images,images);
 const catalog=await (await fetch(base+'/totem/catalog?storeId=store-a')).json();
 const publicProduct=catalog.data.find(p=>p.id===id);
 assert.deepEqual(publicProduct.variations,result.data.variations);
 assert.deepEqual(publicProduct.images,images);
 assert.equal((await request('/stock',undefined,'store-b')).status,403);
 assert.equal((await request('/stock',{name:'Duplicate',sku:'MASTER-ONE',skuAuto:false})).status,409);
 const updated=await fetch(base+'/stock/'+id,{method:'PATCH',headers:{authorization:'Bearer '+token,'x-store-id':'store-a','content-type':'application/json'},body:JSON.stringify({images:images.slice(1),variations:variations.slice(1)})});
 assert.equal(updated.status,200);const row=(await updated.json()).data;assert.equal(row.sku,'MASTER-ONE');assert.equal(row.images.length,9);assert.equal(row.variations.length,7);
 assert.equal((await query('SELECT count(*)::int n FROM stock_items WHERE id=$1',[id])).rows[0].n,1);
});

test('legacy display variation IDs cannot collide while editing another product',async()=>{
 const baseVariation={id:'var_0',attrs:{color:'Preto'},qty:1,cost:100,price:150,pickupPrices:{}};
 const first=await request('/stock',{name:'Primeiro produto',sku:'FIRST',skuAuto:false,variations:[baseVariation]});
 const firstResult=await first.json();assert.equal(first.status,201,JSON.stringify(firstResult));
 const second=await request('/stock',{name:'Segundo produto',sku:'SECOND',skuAuto:false,variations:[baseVariation]});
 const secondResult=await second.json();assert.equal(second.status,201,JSON.stringify(secondResult));
 const secondRow=secondResult.data;
 const update=await fetch(base+'/stock/'+secondRow.id,{method:'PATCH',headers:{authorization:'Bearer '+token,'x-store-id':'store-a','content-type':'application/json'},body:JSON.stringify({variations:[baseVariation]})});
 const updateResult=await update.json();assert.equal(update.status,200,JSON.stringify(updateResult));
});
