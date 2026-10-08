import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('legacy enum status columns become text with their defaults; Evolution tables are untouched', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TYPE ticket_status AS ENUM ('open','sold','cancelled');
    CREATE TYPE "InstanceConnectionStatus" AS ENUM ('open','close','connecting');
    CREATE TABLE sales_orders (id TEXT PRIMARY KEY, status ticket_status NOT NULL DEFAULT 'open'::ticket_status);
    CREATE TABLE pos_tickets (id TEXT PRIMARY KEY, status ticket_status);
    CREATE INDEX idx_sales_orders_status ON sales_orders(status);
    CREATE TABLE "Instance" (id TEXT PRIMARY KEY, "connectionStatus" "InstanceConnectionStatus" NOT NULL DEFAULT 'open');
    INSERT INTO sales_orders(id,status) VALUES ('old','sold');
  `);
  await db.exec(fs.readFileSync('apps/api/src/db/migrations/0061_legacy_enums_to_text.sql', 'utf8'));
  const types = Object.fromEntries((await db.query(`SELECT table_name||'.'||column_name AS k, data_type, column_default FROM information_schema.columns WHERE column_name IN ('status','connectionStatus')`)).rows.map((r) => [r.k, r]));
  assert.equal(types['sales_orders.status'].data_type, 'text');
  assert.equal(types['sales_orders.status'].column_default, "'open'::text");
  assert.equal(types['pos_tickets.status'].data_type, 'text');
  assert.equal(types['Instance.connectionStatus'].data_type, 'USER-DEFINED', 'Evolution table keeps its enum');
  await db.query(`INSERT INTO sales_orders(id,status) VALUES ('new','completed')`);
  await db.query(`INSERT INTO sales_orders(id) VALUES ('default')`);
  assert.deepEqual((await db.query('SELECT id,status FROM sales_orders ORDER BY id')).rows, [
    { id: 'default', status: 'open' }, { id: 'new', status: 'completed' }, { id: 'old', status: 'sold' },
  ]);
  // Rodar de novo não faz nada (não há mais enum nessas tabelas).
  await db.exec(fs.readFileSync('apps/api/src/db/migrations/0061_legacy_enums_to_text.sql', 'utf8'));
  await db.close();
});

test('legacy required columns get the current default or become optional, so sales are saved again', async () => {
  const db = new PGlite();
  for (const file of fs.readdirSync('apps/api/src/db/migrations').filter((f) => f.endsWith('.sql') && f < '0062').sort()) {
    await db.exec(fs.readFileSync(`apps/api/src/db/migrations/${file}`, 'utf8'));
  }
  // Como no banco herdado: product_name obrigatório sem padrão e um campo antigo obrigatório em pos_quotes.
  await db.exec(`
    ALTER TABLE sales_orders ALTER COLUMN product_name DROP DEFAULT;
    ALTER TABLE sales_orders ALTER COLUMN product_name SET NOT NULL;
    ALTER TABLE pos_quotes ADD COLUMN IF NOT EXISTS quote_number TEXT;
    ALTER TABLE pos_quotes ALTER COLUMN quote_number SET NOT NULL;
  `);
  await db.exec(fs.readFileSync('apps/api/src/db/migrations/0062_legacy_required_columns.sql', 'utf8'));
  const info = Object.fromEntries((await db.query(`SELECT table_name||'.'||column_name AS k, is_nullable, column_default FROM information_schema.columns WHERE (table_name,column_name) IN (('sales_orders','product_name'),('pos_quotes','quote_number'),('sales_orders','id'))`)).rows.map((r) => [r.k, r]));
  assert.equal(info['sales_orders.product_name'].column_default, "''::text");
  assert.equal(info['pos_quotes.quote_number'].is_nullable, 'YES');
  assert.equal(info['sales_orders.id'].is_nullable, 'NO', 'primary keys are untouched');
  await db.query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','a')`);
  await db.query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('s','a','s','s','s')`);
  await db.query(`INSERT INTO sales_orders(id,store_id,status) VALUES('SO-1','s','completed')`);
  assert.equal((await db.query(`SELECT product_name FROM sales_orders WHERE id='SO-1'`)).rows[0].product_name, '');
  await db.close();
});
