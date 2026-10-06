import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('confirmed cleanup preserves demo and credentials, excludes extra user and empties only reviewed inventory',async()=>{
 const db=new PGlite();try{
 for(const f of fs.readdirSync('apps/api/src/db/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('apps/api/src/db/migrations/'+f,'utf8'));
 await db.exec(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('PRT-MUM5YWBG8DSR','Real','Real legal','38.297.104/0001-82','real@example.test','keep-phone','Gilvan'),('ACC-MARTHI-DEMO','Demo','Demo','demo-doc','','','');
 INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('STR-CELL-PONTO','PRT-MUM5YWBG8DSR','Real','Real legal','00000000000000'),('STR-DEMO-01','ACC-MARTHI-DEMO','Demo','Demo','demo'),('STR-DEMO-02','ACC-MARTHI-DEMO','Incorrect branch','Incorrect branch','branch');
 INSERT INTO users(id,client_account_id,email,name,password_hash) VALUES('gilvan','PRT-MUM5YWBG8DSR','gilvan@test','Gilvan','unchanged-g'),('mariana','PRT-MUM5YWBG8DSR','mariana@test','Mariana','unchanged-m'),('706cde99-34bb-4894-ab0f-d1818ab07103','PRT-MUM5YWBG8DSR','marina@test','Marina','unchanged-inactive');
 INSERT INTO product_attributes(id,store_id,name) VALUES('ATTR-COR','STR-CELL-PONTO','Cor'),('ATTR-CAP','STR-CELL-PONTO','Capacidade'),('ATTR-RET-CELLPONTO','STR-CELL-PONTO','Tipo de Retirada');`);
 const ids=["STK-960a59274324fcad", "STK-24769d4e91ef9181", "STK-f5b7785d6914772d", "STK-3487895380247313", "STK-b31dbe896e9896a9", "STK-ad449c50f6f6ff69", "STK-CP-ACS-PEL3D", "STK-CP-IPH14", "STK-CP-CON-IPH12", "STK-CP-IPH16P", "STK-CP-IPH11", "STK-CP-ACS-CABO1M", "STK-CP-REDMI13P", "STK-CP-IPH15", "STK-CP-TEL-IPH13", "STK-CP-BAT-IPH13", "STK-CP-IPH15PM", "STK-CP-IPH16PM", "STK-CP-IPH13", "STK-CP-IPH12", "STK-CP-ACS-FONT20W", "STK-CP-TEL-IPH14P", "STK-CP-ACS-CAPACLR"];
 for(const id of ids)await db.query('INSERT INTO stock_items(id,store_id,name) VALUES($1,$2,$1)',[id,'STR-CELL-PONTO']);
 await db.query('INSERT INTO stock_items(id,store_id,name) VALUES($1,$2,$1)',['demo-product','STR-DEMO-01']);
 await db.exec(fs.readFileSync('scripts/repair-cellponto-confirmed-catalog.sql','utf8'));
 assert.equal((await db.query("SELECT count(*)::int n FROM stock_items WHERE store_id='STR-CELL-PONTO'")).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM stock_items WHERE store_id='STR-DEMO-01'")).rows[0].n,1);
 assert.equal((await db.query("SELECT count(*)::int n FROM users WHERE client_account_id='PRT-MUM5YWBG8DSR' AND active")).rows[0].n,2);
 assert.equal((await db.query("SELECT active FROM stores WHERE id='STR-DEMO-02'")).rows[0].active,false);
 assert.equal((await db.query("SELECT document FROM stores WHERE id='STR-CELL-PONTO'")).rows[0].document,'38.297.104/0001-82');
 assert.equal((await db.query("SELECT count(*)::int n FROM product_attributes WHERE store_id='STR-CELL-PONTO' AND active")).rows[0].n,2);
 assert.equal((await db.query("SELECT password_hash FROM users WHERE id='mariana'")).rows[0].password_hash,'unchanged-m');
 await db.query('INSERT INTO stock_items(id,store_id,name) VALUES($1,$2,$1)',['new-real-product','STR-CELL-PONTO']);
 await assert.rejects(()=>db.exec(fs.readFileSync('scripts/repair-cellponto-confirmed-catalog.sql','utf8')));await db.exec('ROLLBACK');
 assert.equal((await db.query("SELECT count(*)::int n FROM stock_items WHERE id='new-real-product'")).rows[0].n,1);
 }finally{await db.close();}
});
