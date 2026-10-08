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
