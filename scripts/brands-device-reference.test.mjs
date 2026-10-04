import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';
import { parseAppleModels, matchReference, APPLE_REFERENCE_URL } from '../dist/services/deviceReference.js';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
const db = new PGlite();
for (const file of fs.readdirSync('apps/api/src/db/migrations').filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(`apps/api/src/db/migrations/${file}`, 'utf8'));
}
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const { createSessionToken } = await import('../dist/services/authService.js');
const query = async (sql, args = []) => { const result = await db.query(sql, args); return { ...result, rowCount: result.affectedRows ?? result.rows.length }; };
pool.query = query;
pool.connect = async () => ({ query, release() {} });
for (const n of ['a', 'b']) {
  await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES($1,$1,$1,$1,$1,'','Test')`, [n]);
  await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES($1,$2,$1,$1,$1)`, ['store-' + n, n]);
  await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES($1,$2,$3,$1,'admin',true)`, ['user-' + n, n, n + '@example.com']);
  await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES($1,$2,$3,'admin')`, ['membership-' + n, 'user-' + n, 'store-' + n]);
}
const token = await createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'user-a', role: 'admin', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
async function request(path, method = 'GET', body, store = 'store-a') {
  const response = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': store, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, json: await response.json() };
}

test('brands persist per store, reject duplicates and preserve products on rename', async () => {
  const created = await request('/brands', 'POST', { name: 'Minha Marca' });
  assert.equal(created.status, 201);
  const brand = created.json.data;
  assert.equal((await request('/brands', 'POST', { name: '  MINHA MARCA  ' })).status, 409);
  assert.equal((await request('/brands', 'GET', undefined, 'store-b')).status, 403);
  await query(`INSERT INTO stock_items(id,store_id,name,brand,qty,price) VALUES ('item-a','store-a','Produto',$1,1,123.45)`, [brand.slug]);
  assert.equal((await request('/brands/' + brand.id, 'DELETE')).status, 409);
  const renamed = await request('/brands/' + brand.id, 'PATCH', { name: 'Marca Renomeada' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.data.productCount, 1);
  const row = (await query("SELECT brand, price FROM stock_items WHERE id = 'item-a'")).rows[0];
  assert.equal(row.brand, 'marca renomeada');
  assert.equal(Number(row.price), 123.45);
  assert.equal((await request('/brands/' + brand.id, 'PATCH', { active: false })).json.data.active, false);
  const disposable = (await request('/brands', 'POST', { name: 'Marca temporária' })).json.data;
  assert.equal((await request('/brands/' + disposable.id, 'DELETE')).status, 200);
});

test('migration converts former options and existing stock brands into editable records, idempotently', async () => {
  await db.exec(fs.readFileSync('apps/api/src/db/migrations/0034_store_brands.sql', 'utf8'));
  await db.exec(fs.readFileSync('apps/api/src/db/migrations/0034_store_brands.sql', 'utf8'));
  assert.equal((await query("SELECT count(*)::int AS count FROM store_brands WHERE store_id='store-b'")).rows[0].count, 5);
  assert.equal((await query("SELECT count(*)::int AS count FROM store_brands WHERE store_id='store-a' AND slug='marca renomeada'")).rows[0].count, 1);
});

const fixture = `<h2>iPhone 17 Pro Max</h2><p>Capacidade: 256&nbsp;GB, 512&nbsp;GB, 1&nbsp;TB, 2&nbsp;TB</p><p>Cores: Prateado, Laranja-c&oacute;smico, Azul-intenso</p><a href="/pt-br/125091">Especificações técnicas</a><h2>iPhone 17 Pro</h2><p>Capacidade: 256 GB, 512 GB, 1 TB</p><p>Cores: Prateado, Laranja-c&oacute;smico, Azul-intenso</p>`;
test('official reference parses accents, picks exact model and never returns a price', async () => {
  const models = parseAppleModels(fixture);
  const model = matchReference('IPHONE 17 PRO MAX', models);
  assert.deepEqual(model.colors, ['Prateado', 'Laranja-cósmico', 'Azul-intenso']);
  assert.deepEqual(model.capacities, ['256GB', '512GB', '1TB', '2TB']);
  assert.equal(matchReference('iPhone 17 Pro M', models), null);
  assert.equal(matchReference('iPhone 17 Pro Max 256 GB usado', models).model, model.model);
  await query('INSERT INTO device_reference_sources(source_url,data) VALUES($1,$2::jsonb)', [APPLE_REFERENCE_URL, JSON.stringify(models)]);
  const result = await request('/device-reference?name=IPHONE%2017%20PRO%20MAX');
  assert.equal(result.status, 200);
  assert.deepEqual(result.json.data.capacities, model.capacities);
  assert.equal('price' in result.json.data, false);
  assert.equal((await fetch(base + '/device-reference?name=iPhone')).status, 401);
});

test('trade-in keeps the registered brand and retailer cost, and rejects a brand from another store', async () => {
  await query(`INSERT INTO customers(id,store_id,name,phone,phone_digits) VALUES('customer-a','store-a','Cliente','','')`);
  await query(`INSERT INTO sellers(id,store_id,name) VALUES('seller-a','store-a','Vendedor')`);
  await query(`INSERT INTO stock_items(id,store_id,name,brand,qty,cost,price) VALUES('sale-item','store-a','Produto','apple',3,10,100)`);
  const payload = { customerId: 'customer-a', sellerId: 'seller-a', paymentMethod: 'Pix', lines: [{ stockId: 'sale-item', name: 'Produto', qty: 1, unitPrice: 100 }], tradeIn: { deviceName: 'iPhone 17 Pro Max', brand: 'apple', color: 'Azul-intenso', capacity: '2TB', tradeValue: 20 } };
  const sale = await request('/sales/external', 'POST', payload);
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  const stock = (await query('SELECT brand,color,capacity,cost,price FROM stock_items WHERE id=$1', [sale.json.data.tradeInStockId])).rows[0];
  assert.equal(stock.brand, 'apple'); assert.equal(stock.capacity, '2TB'); assert.equal(stock.color, 'Azul-intenso');
  assert.equal(Number(stock.cost), 20); assert.equal(Number(stock.price), 0);
  await query(`INSERT INTO store_brands(id,store_id,slug,name) VALUES('foreign-brand','store-b','foreign','Foreign')`);
  assert.equal((await request('/sales/external', 'POST', { ...payload, tradeIn: { ...payload.tradeIn, brand: 'foreign' } })).status, 400);
  assert.equal(Number((await query("SELECT qty FROM stock_items WHERE id='sale-item'")).rows[0].qty), 2);
});

after(async () => { await new Promise(resolve => server.close(resolve)); await db.close(); await pool.end(); });
