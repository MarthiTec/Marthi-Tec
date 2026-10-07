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
const query = async (sql, args = []) => {
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });

await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','Test')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document,totem_exit_password) VALUES('store-a','a','Loja A','Loja A','1','senha-da-loja')`);

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const unlock = (password) =>
  fetch(base + '/totem/unlock', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-store-id': 'store-a' },
    body: JSON.stringify({ password }),
  });

after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('the public totem never receives the exit password', async () => {
  const res = await fetch(base + '/totem/settings', { headers: { 'x-store-id': 'store-a' } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.exitPassword, undefined);
});

test('the server checks the configured exit password', async () => {
  assert.equal((await unlock('1234')).status, 403);
  assert.equal((await unlock('cellponto')).status, 403);
  const ok = await unlock('senha-da-loja');
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).data.unlocked, true);
});

test('repeated wrong passwords are throttled per store', async () => {
  let last;
  for (let i = 0; i < 11; i += 1) last = await unlock('errada-' + i);
  assert.equal(last.status, 429);
  // Even the right password waits until the window expires.
  assert.equal((await unlock('senha-da-loja')).status, 429);
});
