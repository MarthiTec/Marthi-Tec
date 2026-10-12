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
await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','Test')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-a','a','Loja','Loja','1')`);
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Gestora','admin',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin')`);
const token = await auth.createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Gestora', role: 'admin', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path, method = 'GET', body) => {
  const res = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

const cor = (await call('/attributes', 'POST', { name: 'Cor', values: ['roxo-profundo', 'prateado', 'Prateado', 'Azul'] })).data.id;
const variation = (value, condition = 'new') => ({ attrs: { [cor]: value }, condition, qty: 1, price: 1000, cost: 800 });
const product = async (name, variations) => {
  const res = await call('/stock', 'POST', { name, kind: 'device', price: 1000, showOnTotem: true, variations });
  assert.equal(res.status, 201, JSON.stringify(res.error));
  return res.data.id;
};
const colors = async (id) => (await query('SELECT attrs FROM stock_item_variations WHERE stock_item_id=$1 ORDER BY id', [id])).rows.map((r) => r.attrs[cor]).sort();
const productColors = async (id) => (await query('SELECT variations FROM stock_items WHERE id=$1', [id])).rows[0].variations.map((v) => v.attrs[cor]).sort();
const attribute = async () => (await call('/attributes')).data.find((a) => a.id === cor);
const save = (values, renames) => call(`/attributes/${cor}`, 'PATCH', { values, renames });

test('renaming a value keeps its id and the products follow the new name', async () => {
  const p = await product('IPHONE 14 PRO', [variation('roxo-profundo'), variation('Azul')]);
  const idBefore = (await query("SELECT id FROM product_attribute_values WHERE attribute_id=$1 AND value='roxo-profundo'", [cor])).rows[0].id;
  const res = await save(['Roxo-profundo', 'prateado', 'Prateado', 'Azul'], [{ from: 'roxo-profundo', to: 'Roxo-profundo' }]);
  assert.equal(res.status, 200, JSON.stringify(res.error));
  assert.deepEqual((await attribute()).values, ['Roxo-profundo', 'prateado', 'Prateado', 'Azul']);
  assert.equal((await query("SELECT id FROM product_attribute_values WHERE attribute_id=$1 AND value='Roxo-profundo'", [cor])).rows[0].id, idBefore);
  assert.deepEqual(await colors(p), ['Azul', 'Roxo-profundo']);
  assert.deepEqual(await productColors(p), ['Azul', 'Roxo-profundo']);
});

test('renaming to an existing value merges both (e.g. "prateado" into "Prateado")', async () => {
  const p = await product('IPHONE 17 PRO MAX', [variation('prateado')]);
  const res = await save(['Roxo-profundo', 'Prateado', 'Azul'], [{ from: 'prateado', to: 'Prateado' }]);
  assert.equal(res.status, 200, JSON.stringify(res.error));
  assert.deepEqual((await attribute()).values, ['Roxo-profundo', 'Prateado', 'Azul']);
  assert.deepEqual(await colors(p), ['Prateado']);
});

test('a merge that would leave a product with two identical variations is refused and nothing changes', async () => {
  await query("INSERT INTO product_attribute_values(id,attribute_id,value,price_delta,sort) VALUES('ATV-x',$1,'azul',0,9)", [cor]);
  const p = await product('IPHONE 16', [variation('azul'), variation('Azul')]);
  const res = await save(['Roxo-profundo', 'Prateado', 'Azul'], [{ from: 'azul', to: 'Azul' }]);
  assert.equal(res.status, 409);
  assert.match(res.error.message, /IPHONE 16/);
  assert.deepEqual(await colors(p), ['Azul', 'azul']);
  assert.ok((await attribute()).values.includes('azul'));
});
