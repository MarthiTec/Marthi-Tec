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

const phone = (await call('/stock', 'POST', { name: 'GALAXY S25', kind: 'device', qty: 2, price: 4200, cost: 3500 })).data;
const customer = { name: 'Joana Lima', document: '123.456.789-09', phone: '(32) 99999-1234', email: 'joana@example.com', zipCode: '36000-000', street: 'Rua A', number: '10', district: 'Centro', city: 'Juiz de Fora', state: 'mg' };
const pub = (token, path = '', body) => fetch(`${base}/public/sales-catalogs/${token}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined).then(async (r) => ({ status: r.status, ...(await r.json()) }));

test('catálogo novo usa capa moderna e é página de venda por padrão; capa e modo ficam no banco', async () => {
  const created = await call('/sales-catalogs', 'POST', { title: 'Vitrine', productIds: [phone.id] });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  assert.equal(created.data.mode, 'sales');
  assert.equal(created.data.coverStyle, 'hero');
  const updated = await call(`/sales-catalogs/${created.data.id}`, 'PATCH', { title: 'Vitrine', productIds: [phone.id], coverStyle: 'mosaic', mode: 'catalog' });
  assert.equal(updated.status, 200, JSON.stringify(updated.error));
  const row = (await query('SELECT mode, cover_style FROM sales_catalogs WHERE id = $1', [created.data.id])).rows[0];
  assert.deepEqual(row, { mode: 'catalog', cover_style: 'mosaic' });
  assert.equal((await call(`/sales-catalogs/${created.data.id}`, 'PATCH', { title: 'Vitrine', coverStyle: 'neon' })).status, 400, 'estilo desconhecido é recusado');
});

test('catálogo digital: cliente vê, se cadastra, mas não faz pedido; página de venda aceita pedido', async () => {
  const digital = (await call('/sales-catalogs', 'POST', { title: 'Só vitrine', productIds: [phone.id], mode: 'catalog' })).data;
  const page = await pub(digital.token);
  assert.equal(page.data.catalog.mode, 'catalog');
  assert.equal(page.data.items.length, 1);
  const blocked = await pub(digital.token, '/orders', { customer, items: [{ productId: phone.id, attributes: [] }] });
  assert.equal(blocked.status, 400);
  assert.match(blocked.error.message, /só para consulta/);
  const signup = await pub(digital.token, '/orders', { kind: 'signup', customer: { ...customer, phone: '(32) 98888-0000' } });
  assert.equal(signup.status, 201, JSON.stringify(signup.error));
  const shop = (await call('/sales-catalogs', 'POST', { title: 'Loja online', productIds: [phone.id] })).data;
  const ordered = await pub(shop.token, '/orders', { customer: { ...customer, phone: '(32) 97777-0000' }, items: [{ productId: phone.id, attributes: [] }] });
  assert.equal(ordered.status, 201, JSON.stringify(ordered.error));
});

test('configuração de tela fica no banco, por usuário e por loja', async () => {
  assert.equal((await call('/user-preferences/sales-catalog.screen')).data.value, null);
  const saved = await call('/user-preferences/sales-catalog.screen', 'PUT', { value: { tab: 'look', availability: 'order', currentId: 'CAT-1' } });
  assert.equal(saved.status, 200);
  assert.deepEqual((await call('/user-preferences/sales-catalog.screen')).data.value, { tab: 'look', availability: 'order', currentId: 'CAT-1' });
  await call('/user-preferences/sales-catalog.screen', 'PUT', { value: { tab: 'preview' } });
  assert.deepEqual((await call('/user-preferences/sales-catalog.screen')).data.value, { tab: 'preview' }, 'gravar de novo substitui');
  assert.equal((await call('/user-preferences/sales-catalog.screen', 'GET', null, seller)).data.value, null, 'outro usuário não herda');
  assert.equal((await call('/user-preferences/sales-catalog.screen', 'GET', null, other, 'store-b')).data.value, null, 'outra loja não vê');
  assert.equal((await call('/user-preferences/sales-catalog.screen', 'GET', null, other, 'store-a')).status, 403, 'não lê trocando a loja');
  assert.equal((await call('/user-preferences/x y', 'PUT', { value: {} })).status, 400);
  assert.equal((await call('/user-preferences/grande', 'PUT', { value: { blob: 'x'.repeat(25_000) } })).status, 413);
  const rows = (await query('SELECT store_id, user_id, key FROM user_preferences')).rows;
  assert.deepEqual(rows, [{ store_id: 'store-a', user_id: 'user-a', key: 'sales-catalog.screen' }]);
});
