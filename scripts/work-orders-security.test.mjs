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

for (const n of ['a', 'b']) {
  await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES($1,$1,$1,$1,$1,'','Test')`, [n]);
  await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES($1,$2,$1,$1,$1)`, ['store-' + n, n]);
  await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES($1,$2,$3,$1,'admin',true)`, ['user-' + n, n, n + '@example.com']);
  await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES($1,$2,$3,'admin')`, ['membership-' + n, 'user-' + n, 'store-' + n]);
}
const tokenA = await auth.createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'user-a', role: 'admin', clientAccountId: 'a' });
const tokenB = await auth.createSessionToken({ id: 'user-b', email: 'b@example.com', name: 'user-b', role: 'admin', clientAccountId: 'b' });

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = (path, { method = 'GET', token, storeId, body } = {}) => fetch(base + path, {
  method,
  headers: {
    ...(token ? { authorization: 'Bearer ' + token } : {}),
    ...(storeId ? { 'x-store-id': storeId } : {}),
    'content-type': 'application/json',
  },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('work orders reject requests with no auth token at all, even when x-store-id is supplied', async () => {
  assert.equal((await call('/work-orders')).status, 401);
  // The historical bug: omitting the token but supplying x-store-id used to silently grant
  // access to that store's data with zero authentication. This must now be rejected.
  assert.equal((await call('/work-orders', { storeId: 'store-a' })).status, 401);
  assert.equal((await call('/work-orders', { method: 'POST', storeId: 'store-a', body: { customerName: 'x', itemName: 'y', defect: 'z' } })).status, 401);
});

test('an authenticated user from store B cannot list, read, or write store A work orders', async () => {
  const created = await call('/work-orders', {
    method: 'POST',
    token: tokenA,
    body: { customerName: 'Cliente A', customerDocument: '000.000.000-00', itemName: 'iPhone 12', defect: 'Tela quebrada' },
  });
  assert.equal(created.status, 201);
  const os = (await created.json()).data;
  assert.ok(os.id);

  // store-b has no membership on store-a, so requireAuth itself must refuse any attempt to
  // address store-a's data, regardless of x-store-id.
  assert.equal((await call('/work-orders', { token: tokenB, storeId: 'store-a' })).status, 403);
  assert.equal((await call(`/work-orders/${os.id}`, { token: tokenB, storeId: 'store-a' })).status, 403);

  // Without forcing x-store-id, store-b's own token simply resolves to store-b, where the
  // store-a record does not exist — must be a clean 404, never someone else's data.
  const crossRead = await call(`/work-orders/${os.id}`, { token: tokenB });
  assert.equal(crossRead.status, 404);

  const crossList = await call('/work-orders', { token: tokenB });
  assert.equal(crossList.status, 200);
  const listBody = await crossList.json();
  assert.ok(!listBody.data.some((o) => o.id === os.id), 'store B must never see store A work orders in its own listing');

  // The rightful owner (store A) can read it back.
  const ownRead = await call(`/work-orders/${os.id}`, { token: tokenA });
  assert.equal(ownRead.status, 200);
  assert.equal((await ownRead.json()).data.customerName, 'Cliente A');
});
