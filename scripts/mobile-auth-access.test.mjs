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

await query(
  `INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name)
   VALUES('acc','Loja','Loja','00','a@example.com','','Test')`,
);
await query(
  `INSERT INTO stores(id,client_account_id,trade_name,legal_name,document)
   VALUES('store-a','acc','Loja A','Loja A','00')`,
);
await query(
  `INSERT INTO users(id,client_account_id,email,name,global_role,active)
   VALUES('user-a','acc','a@example.com','Admin','admin',true)`,
);
await query(
  `INSERT INTO user_stores(id,user_id,store_id,role) VALUES('us-a','user-a','store-a','admin')`,
);
await query(
  `INSERT INTO users(id,client_account_id,email,name,global_role,active)
   VALUES('user-s','acc','seller@example.com','Seller','operator',true)`,
);
await query(
  `INSERT INTO user_stores(id,user_id,store_id,role) VALUES('us-s','user-s','store-a','seller')`,
);
await query(
  `INSERT INTO employees(id,store_id,name,email,user_email,role,is_system_user,access_areas,permissions,active)
   VALUES('emp-s','store-a','Seller','seller@example.com','seller@example.com','seller',true,'["os","pdv"]'::jsonb,'{}'::jsonb,true)`,
);

const adminToken = await auth.createSessionToken({
  id: 'user-a',
  email: 'a@example.com',
  name: 'Admin',
  role: 'admin',
  clientAccountId: 'acc',
  picture: null,
  provider: 'password',
});
const sellerToken = await auth.createSessionToken({
  id: 'user-s',
  email: 'seller@example.com',
  name: 'Seller',
  role: 'operator',
  clientAccountId: 'acc',
  picture: null,
  provider: 'password',
});

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path, token) => {
  const res = await fetch(base + path, {
    headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a' },
  });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};

after(async () => {
  server.close();
  await once(server, 'close');
  await pool.end();
  await db.close();
});

test('auth/access returns fullAccess for store admin', async () => {
  const res = await call('/auth/access', adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.data.fullAccess, true);
  assert.equal(res.data.storeId, 'store-a');
  assert.ok(Array.isArray(res.data.accessAreas));
});

test('auth/access returns employee areas for seller', async () => {
  const res = await call('/auth/access', sellerToken);
  assert.equal(res.status, 200);
  assert.equal(res.data.fullAccess, false);
  assert.deepEqual([...res.data.accessAreas].sort(), ['os', 'pdv']);
});

test('auth/access requires bearer token', async () => {
  const res = await fetch(base + '/auth/access', { headers: { 'x-store-id': 'store-a' } });
  assert.equal(res.status, 401);
});

test('dashboard/summary still works for authenticated store', async () => {
  const res = await call('/dashboard/summary?days=7', adminToken);
  assert.equal(res.status, 200);
  assert.equal(typeof res.data.revenuePeriod, 'number');
  assert.equal(typeof res.data.openOs, 'number');
  assert.ok(Array.isArray(res.data.series));
  assert.equal(res.data.series.length, 7);
});
