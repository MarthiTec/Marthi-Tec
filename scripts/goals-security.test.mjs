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
const call = (path, { method = 'GET', token, body } = {}) => fetch(base + path, {
  method,
  headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('PATCH /goals/:id never discloses another store\'s goal, even when the id is guessed correctly', async () => {
  const created = await call('/goals', {
    method: 'POST',
    token: tokenA,
    body: { name: 'Meta sigilosa da Loja A', goalType: 'revenue', targetValue: 50000, startDate: '2026-01-01', endDate: '2026-12-31' },
  });
  const createdBody = await created.json();
  assert.equal(created.status, 201, JSON.stringify(createdBody));
  const goal = createdBody.data;
  assert.ok(goal.id);

  // Store B guesses/knows store A's goal id exactly (low-entropy id) and tries to touch it.
  const crossPatch = await call(`/goals/${goal.id}`, { method: 'PATCH', token: tokenB, body: { name: 'Hijacked' } });
  assert.equal(crossPatch.status, 404, 'cross-tenant PATCH must 404, never leak the other store\'s goal');
  const crossBody = await crossPatch.json();
  assert.equal(crossBody.success, false);
  assert.ok(!JSON.stringify(crossBody).includes('Meta sigilosa'), 'store A goal name must never appear in store B\'s response');

  // The goal must remain untouched and owned by store A.
  const ownRead = await call('/goals', { token: tokenA });
  const stillThere = (await ownRead.json()).data.find((g) => g.id === goal.id);
  assert.ok(stillThere);
  assert.equal(stillThere.name, 'Meta sigilosa da Loja A');

  // The rightful owner can still patch it normally.
  const ownPatch = await call(`/goals/${goal.id}`, { method: 'PATCH', token: tokenA, body: { name: 'Meta renomeada' } });
  assert.equal(ownPatch.status, 200);
  assert.equal((await ownPatch.json()).data.name, 'Meta renomeada');
});
