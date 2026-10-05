import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('legacy production invoices upgrade without losing dates, stock links or average cost',async()=>{
 const db=new PGlite();
 try {
  for(const file of fs.readdirSync('apps/api/src/db/migrations').filter(f=>f.endsWith('.sql')&&f<'0039').sort())await db.exec(fs.readFileSync('apps/api/src/db/migrations/'+file,'utf8'));
  await db.exec(`DROP TABLE stock_invoice_lines,stock_invoices CASCADE;
   CREATE TYPE legacy_invoice_kind AS ENUM ('entry','exit');
   CREATE TYPE legacy_invoice_status AS ENUM ('draft','posted','cancelled');
   CREATE TABLE stock_invoices(id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),kind legacy_invoice_kind NOT NULL,number TEXT NOT NULL DEFAULT '',status legacy_invoice_status NOT NULL DEFAULT 'draft',document_purpose TEXT NOT NULL DEFAULT 'normal',supplier_id TEXT,customer_name TEXT NOT NULL DEFAULT '',issued_at VARCHAR NOT NULL,notes TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),posted_at TIMESTAMPTZ);
   CREATE TABLE stock_invoice_lines(id TEXT PRIMARY KEY,invoice_id TEXT NOT NULL REFERENCES stock_invoices(id),stock_id TEXT NOT NULL REFERENCES stock_items(id),name TEXT NOT NULL,qty INTEGER NOT NULL,unit_cost NUMERIC NOT NULL DEFAULT 0,unit_price NUMERIC NOT NULL DEFAULT 0);
   ALTER TABLE price_tables DROP COLUMN created_at;
   ALTER TABLE payment_methods DROP COLUMN created_at;
   INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('legacy','Legacy','Legacy','legacy','legacy@example.com','','Test');
   INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('legacy-store','legacy','Legacy','Legacy','legacy');
   INSERT INTO stock_items(id,store_id,name,cost) VALUES('legacy-stock','legacy-store','Existing product',100);
   INSERT INTO stock_invoices(id,store_id,kind,issued_at,customer_name) VALUES('legacy-invoice','legacy-store','entry','2026-10-01','Existing customer');
   INSERT INTO stock_invoice_lines(id,invoice_id,stock_id,name,qty,unit_cost) VALUES('legacy-line','legacy-invoice','legacy-stock','Existing product',1,100);`);
  const upgrade=fs.readFileSync('apps/api/src/db/migrations/0039_product_pricing_and_receipts.sql','utf8');
  const compatibility=fs.readFileSync('apps/api/src/db/migrations/0045_legacy_schema_compatibility.sql','utf8');
  await db.exec(upgrade);await db.exec(compatibility);
  const invoice=(await db.query("SELECT *,issue_date::text AS date_text FROM stock_invoices WHERE id='legacy-invoice'")).rows[0];
  assert.equal(invoice.date_text,'2026-10-01');
  assert.equal(invoice.details.customerName,'Existing customer');
  assert.equal((await db.query("SELECT stock_item_id FROM stock_invoice_lines WHERE id='legacy-line'")).rows[0].stock_item_id,'legacy-stock');
  await db.exec("UPDATE stock_items SET avg_cost=123 WHERE id='legacy-stock'");
  await db.exec(upgrade);await db.exec(compatibility);
  assert.equal(Number((await db.query("SELECT avg_cost FROM stock_items WHERE id='legacy-stock'")).rows[0].avg_cost),123);
  await db.exec("INSERT INTO stock_invoices(id,store_id,kind,issue_date) VALUES('new-invoice','legacy-store','entry','2026-10-05'); INSERT INTO stock_invoice_lines(id,invoice_id,stock_item_id,qty,unit_cost) VALUES('new-line','new-invoice','legacy-stock',1,100)");
  const line=(await db.query("SELECT stock_id,name FROM stock_invoice_lines WHERE id='new-line'")).rows[0];
  assert.equal(line.stock_id,'legacy-stock');assert.equal(line.name,'Existing product');
  assert.equal((await db.query("SELECT issued_at FROM stock_invoices WHERE id='new-invoice'")).rows[0].issued_at,'2026-10-05');
  const timestamps=await db.query("SELECT table_name FROM information_schema.columns WHERE column_name='created_at' AND table_name IN ('price_tables','payment_methods')");assert.equal(timestamps.rows.length,2);
 }finally{await db.close();}
});
