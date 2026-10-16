import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
const db = new PGlite();
for (const file of fs.readdirSync('apps/api/src/db/migrations').filter((x) => x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync('apps/api/src/db/migrations/' + file, 'utf8'));
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const auth = await import('../dist/services/authService.js');
const query = async (sql, args = []) => { const result = await db.query(sql, args); return { ...result, rowCount: result.affectedRows ?? result.rows.length }; };
pool.query = query;
pool.connect = async () => ({ query, release() {} });
for (const n of ['a', 'b']) {
  await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES($1,$1,$1,$1,$1,'','Test')`, [n]);
  await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES($1,$2,$1,$1,$1)`, ['store-' + n, n]);
  await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES($1,$2,$3,$1,'admin',true)`, ['user-' + n, n, n + '@example.com']);
  await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES($1,$2,$3,'admin')`, ['membership-' + n, 'user-' + n, 'store-' + n]);
}
const token = await auth.createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'user-a', role: 'admin', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path, method = 'GET', body) => {
  const res = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

let caixa, banco;

test('the default system opens only modules the user is allowed into, and goes back to automatic when the module is removed', async () => {
  const blocked = await call('/employees', 'POST', { name: 'Caixa 1', role: 'operator', accessAreas: ['pdv'], homeArea: 'os' });
  assert.equal(blocked.status, 400);
  assert.match(blocked.error.message, /sistema padrão/);
  const created = await call('/employees', 'POST', { name: 'Caixa 1', role: 'operator', accessAreas: ['pdv', 'os'], homeArea: 'os' });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  assert.equal(created.data.homeArea, 'os');
  assert.equal((await call('/employees')).data.find((e) => e.id === created.data.id).homeArea, 'os');
  // Tirou a OS das áreas (tela de permissões, sem mexer no sistema padrão): volta para automático.
  const edited = await call(`/employees/${created.data.id}`, 'PATCH', { accessAreas: ['pdv'] });
  assert.equal(edited.status, 200, JSON.stringify(edited.error));
  assert.equal(edited.data.homeArea, '');
  assert.equal((await call(`/employees/${created.data.id}`, 'PATCH', { homeArea: 'pdv' })).data.homeArea, 'pdv');
  assert.equal((await call(`/employees/${created.data.id}`, 'PATCH', { homeArea: 'erp' })).status, 400);
  const admin = await call('/employees', 'POST', { name: 'Gerente', role: 'admin', accessAreas: [], homeArea: 'erp' });
  assert.equal(admin.status, 201, 'an administrator can open any system');
});
