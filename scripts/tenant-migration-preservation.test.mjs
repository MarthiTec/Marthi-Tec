import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('incoming migrations preserve existing tenants, stock identities, credentials and empty catalogs',async()=>{
 const db=new PGlite();
 try{
 const files=fs.readdirSync('apps/api/src/db/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const file of files.filter(f=>f<'0046'))await db.exec(fs.readFileSync('apps/api/src/db/migrations/'+file,'utf8'));
 await db.exec(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('real-account','Empresa real','Empresa real','real-doc','test@example.com','','Test');
 INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('STR-PRT-REAL','real-account','Empresa real','Empresa real','real-store-doc');
 INSERT INTO users(id,client_account_id,email,name,password_hash,global_role) VALUES('real-user','real-account','real@example.com','Real user','preserve-password','admin');
 INSERT INTO stock_items(id,store_id,name,qty,price) VALUES('real-stock-1','STR-PRT-REAL','Same name',2,100),('real-stock-2','STR-PRT-REAL','Same name',3,200);`);
 for(const file of files.filter(f=>f>='0046'))await db.exec(fs.readFileSync('apps/api/src/db/migrations/'+file,'utf8'));
 assert.equal((await db.query("SELECT count(*)::int n FROM stores WHERE id='STR-PRT-REAL'")).rows[0].n,1);
 assert.deepEqual((await db.query('SELECT id,qty FROM stock_items ORDER BY id')).rows,[{id:'real-stock-1',qty:2},{id:'real-stock-2',qty:3}]);
 assert.equal((await db.query("SELECT password_hash FROM users WHERE id='real-user'")).rows[0].password_hash,'preserve-password');
 assert.equal((await db.query("SELECT count(*)::int n FROM client_accounts WHERE id IN ('PRT-CELL-PONTO','PRT-MUM5YWBG8DSR')")).rows[0].n,0);
 await assert.rejects(()=>db.query("UPDATE stores SET client_account_id='another-account' WHERE id='STR-PRT-REAL'"));
 }finally{await db.close();}
});

test('reviewed Cell Ponto link repair preserves inventory and passwords and restores strict ownership',async()=>{
 const db=new PGlite();try{
 for(const file of fs.readdirSync('apps/api/src/db/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('apps/api/src/db/migrations/'+file,'utf8'));
 await db.exec(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('ACC-MARTHI-DEMO','Wrong label','Wrong label','demo-doc','','',''),('PRT-MUM5YWBG8DSR','Cell Ponto','Cell Ponto','38.297.104/0001-82','','','');
 INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('STR-CELL-PONTO','ACC-MARTHI-DEMO','Cell Ponto','Cell Ponto','cp-doc'),('STR-DEMO-01','ACC-MARTHI-DEMO','Marthi Demonstration','Demo legal','demo-store');
 INSERT INTO users(id,client_account_id,email,name,password_hash,global_role) VALUES('mariana','PRT-MUM5YWBG8DSR','marianaveigatav@gmail.com','Mariana','keep-mariana','admin'),('gilvan','ACC-MARTHI-DEMO','gilvanteodo@gmail.com','Gilvan','keep-gilvan','admin'),('marina','ACC-MARTHI-DEMO','marinaveigatav@gmail.com','Marina','keep-marina','admin');
 INSERT INTO stock_items(id,store_id,name,qty,price) VALUES('keep-stock','STR-CELL-PONTO','Actual stock',7,110);
 BEGIN;`);
 await db.exec(fs.readFileSync('scripts/repair-cellponto-account-links.sql','utf8'));await db.exec('COMMIT');
 assert.equal((await db.query("SELECT client_account_id FROM stores WHERE id='STR-CELL-PONTO'")).rows[0].client_account_id,'PRT-MUM5YWBG8DSR');
 assert.equal((await db.query("SELECT count(*)::int n FROM user_stores WHERE store_id='STR-CELL-PONTO' AND is_default")).rows[0].n,3);
 assert.equal((await db.query("SELECT qty FROM stock_items WHERE id='keep-stock'")).rows[0].qty,7);
 await db.exec("INSERT INTO stock_items(id,store_id,name,qty,price,cost) VALUES('STK-CP-IPH16PM','STR-CELL-PONTO','Generated unchanged',7,6990,5900),('STK-CP-IPH16P','STR-CELL-PONTO','Edited stock',9,6290,5300)");
 const hidden=await db.query(fs.readFileSync('scripts/quarantine-generated-cellponto-stock.sql','utf8'));assert.deepEqual(hidden.rows,[{id:'STK-CP-IPH16PM'}]);
 assert.equal((await db.query("SELECT active FROM stock_items WHERE id='STK-CP-IPH16PM'")).rows[0].active,false);
 assert.equal((await db.query("SELECT active FROM stock_items WHERE id='STK-CP-IPH16P'")).rows[0].active,true);

 assert.deepEqual((await db.query('SELECT password_hash FROM users ORDER BY id')).rows.map(r=>r.password_hash),['keep-gilvan','keep-mariana','keep-marina']);
 await assert.rejects(()=>db.query("UPDATE stores SET client_account_id='ACC-MARTHI-DEMO' WHERE id='STR-CELL-PONTO'"));
 }finally{await db.close();}
});
