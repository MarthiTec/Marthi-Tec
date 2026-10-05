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
