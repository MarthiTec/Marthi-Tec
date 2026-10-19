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
  `INSERT INTO audit_logs(id,store_id,user_id,action,entity,entity_id,details)
   VALUES('AUD-1','store-a','user-a','stock.price_change','stock_item','stk-1',$1::jsonb)`,
  [JSON.stringify({ before: { price: 10 }, after: { price: 12 }, password: 'should-hide', token: 'abc' })],
);

const token = await auth.createSessionToken({
  id: 'user-a', email: 'a@example.com', name: 'Admin', role: 'admin', clientAccountId: 'acc', picture: null, provider: 'password',
});
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path) => {
  const res = await fetch(base + path, { headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a' } });
  const json = await res.json();
  return { status: res.status, data: json.data };
};
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('lists audit logs for store', async () => {
  const res = await call('/audit-logs');
  assert.equal(res.status, 200);
  assert.ok(res.data.some((row) => row.id === 'AUD-1'));
});

test('redacts secrets from audit details', async () => {
  const res = await call('/audit-logs?action=price_change');
  assert.equal(res.status, 200);
  const row = res.data.find((r) => r.id === 'AUD-1');
  assert.equal(row.details.password, '[redacted]');
  assert.equal(row.details.token, '[redacted]');
  assert.equal(row.details.after.price, 12);
});
