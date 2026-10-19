import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
const db = new PGlite();
for (const file of fs.readdirSync('apps/api/src/db/migrations').filter((x) => x.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync('apps/api/src/db/migrations/' + file, 'utf8'));
}
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const auth = await import('../dist/services/authService.js');
const query = async (sql, args = []) => {
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });

await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('acc','L','L','00','a@example.com','','T')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-a','acc','Loja','Loja','00')`);
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','acc','a@example.com','Admin','admin',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('us-a','user-a','store-a','admin')`);
await query(
  `INSERT INTO work_orders(id,store_id,customer_name,item_name,defect,status,history)
   VALUES('OS-1','store-a','Cliente','iPhone','Tela','open','[]'::jsonb)`,
);

const token = await auth.createSessionToken({
  id: 'user-a', email: 'a@example.com', name: 'Admin', role: 'admin', clientAccountId: 'acc', picture: null, provider: 'password',
});
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path, method = 'GET', body) => {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('lists work orders with status filter', async () => {
  const res = await call('/work-orders?status=open');
  assert.equal(res.status, 200);
  assert.ok(res.data.some((o) => o.id === 'OS-1'));
});

test('allows valid status transition and records history', async () => {
  const res = await call('/work-orders/OS-1/status', 'POST', { status: 'diagnosis', note: 'Início' });
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'diagnosis');
  assert.ok(res.data.history.some((h) => h.toValue === 'diagnosis' && h.note === 'Início'));
});

test('rejects invalid status transition', async () => {
  const res = await call('/work-orders/OS-1/status', 'POST', { status: 'delivered' });
  assert.equal(res.status, 409);
  assert.equal(res.error.code, 'INVALID_STATUS_TRANSITION');
});
