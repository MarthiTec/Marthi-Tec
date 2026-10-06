import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('targeted cleanup preserves the real product, snapshots test rows, and refuses business history',async()=>{
 const db=new PGlite();
 try {
  for(const file of fs.readdirSync('apps/api/src/db/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('apps/api/src/db/migrations/'+file,'utf8'));
  await db.exec(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('PRT-MUM5YWBG8DSR','Real','Real','38.297.104/0001-82','','','');
   INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('STR-CELL-PONTO','PRT-MUM5YWBG8DSR','Real','Real','38.297.104/0001-82');
   INSERT INTO stock_items(id,store_id,name,price) VALUES('real-product','STR-CELL-PONTO','iPhone 17 Pro Max',7500),('STK-CP-IPH14','STR-CELL-PONTO','Test',1);`);
  const cleanup=fs.readFileSync('scripts/cleanup-cellponto-test-products.sql','utf8');
  await db.exec(cleanup);
  assert.equal((await db.query('SELECT id FROM stock_items')).rows[0].id,'real-product');
  const snapshot=(await db.query("SELECT details FROM audit_logs WHERE id='totem-test-products-20261006'")).rows[0].details;
  assert.equal(snapshot.products[0].id,'STK-CP-IPH14');
  await db.exec(cleanup);
  await db.exec(`INSERT INTO stock_items(id,store_id,name) VALUES('STK-CP-IPH14','STR-CELL-PONTO','Test');
   INSERT INTO stock_movements(id,store_id,stock_item_id,type,qty) VALUES('history','STR-CELL-PONTO','STK-CP-IPH14','in',1);`);
  await assert.rejects(()=>db.exec(cleanup),/business history/);
  await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int n FROM stock_items')).rows[0].n,2);
 } finally {await db.close();}
});
