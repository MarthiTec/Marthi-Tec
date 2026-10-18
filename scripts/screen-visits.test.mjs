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
await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','Test'),('b','b','b','b','b','','Outra')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-a','a','Loja','Loja','1'),('store-b','b','Outra','Outra','2')`);
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Gestora','admin',true),('user-s','a','s@example.com','Vendedor','seller',true),('user-b','b','b@example.com','Outra','admin',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin'),('m-s','user-s','store-a','seller'),('m-b','user-b','store-b','admin')`);
const admin = await auth.createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Gestora', role: 'admin', clientAccountId: 'a' });
const seller = await auth.createSessionToken({ id: 'user-s', email: 's@example.com', name: 'Vendedor', role: 'seller', clientAccountId: 'a' });
const other = await auth.createSessionToken({ id: 'user-b', email: 'b@example.com', name: 'Outra', role: 'admin', clientAccountId: 'b' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path, method = 'GET', body, token = admin, store = 'store-a') => {
  const res = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': store, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('conta as aberturas de tela e devolve as mais acessadas em ordem', async () => {
  for (const path of ['/painel/produtos', '/painel/produtos', '/painel/produtos', '/painel/venda-externa', '/painel/venda-externa', '/painel/catalogo']) {
    assert.equal((await call('/screen-visits', 'POST', { path })).status, 200);
  }
  const top = (await call('/screen-visits/top?limit=10')).data;
  assert.deepEqual(top.map((row) => [row.path, row.visits]), [['/painel/produtos', 3], ['/painel/venda-externa', 2], ['/painel/catalogo', 1]]);
  const rows = (await query('SELECT * FROM screen_visits WHERE store_id = $1', ['store-a'])).rows;
  assert.equal(rows.length, 3, 'gravado no banco, uma linha por tela');
});

test('limita a 10 e recusa caminho inválido', async () => {
  for (let i = 0; i < 12; i++) await call('/screen-visits', 'POST', { path: `/painel/tela-${i}` });
  assert.equal((await call('/screen-visits/top')).data.length, 10);
  assert.equal((await call('/screen-visits', 'POST', { path: 'https://evil.example' })).status, 400);
  assert.equal((await call('/screen-visits', 'POST', { path: '/painel/<script>' })).status, 400);
});

test('cada usuário e cada loja só veem as próprias contagens', async () => {
  await call('/screen-visits', 'POST', { path: '/painel/pdv' }, seller);
  assert.deepEqual((await call('/screen-visits/top', 'GET', null, seller)).data.map((row) => row.path), ['/painel/pdv']);
  await call('/screen-visits', 'POST', { path: '/painel/financeiro' }, other, 'store-b');
  assert.deepEqual((await call('/screen-visits/top', 'GET', null, other, 'store-b')).data.map((row) => row.path), ['/painel/financeiro']);
  assert.ok(!(await call('/screen-visits/top')).data.some((row) => row.path === '/painel/financeiro' || row.path === '/painel/pdv'));
  // Usuária da loja B não consegue ler a loja A trocando o cabeçalho.
  assert.equal((await call('/screen-visits/top', 'GET', null, other, 'store-a')).status, 403);
});

test('zerar apaga só as contagens do usuário na loja', async () => {
  assert.equal((await call('/screen-visits', 'DELETE')).status, 200);
  assert.equal((await call('/screen-visits/top')).data.length, 0);
  assert.equal((await call('/screen-visits/top', 'GET', null, seller)).data.length, 1);
  assert.equal((await call('/screen-visits/top', 'GET', null, other, 'store-b')).data.length, 1);
});
