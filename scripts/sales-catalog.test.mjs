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
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Gestora','admin',true),('user-s','a','s@example.com','Vendedor','seller',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin'),('m-s','user-s','store-a','seller')`);
await query(`INSERT INTO sellers(id,store_id,name) VALUES('seller-1','store-a','Mariana'),('seller-2','store-a','Gilvan')`);
await query(`INSERT INTO customers(id,store_id,name,phone,phone_digits) VALUES('cust-1','store-a','Cliente Certo','','')`);
const admin = await auth.createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Gestora', role: 'admin', clientAccountId: 'a' });
const seller = await auth.createSessionToken({ id: 'user-s', email: 's@example.com', name: 'Vendedor', role: 'seller', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path, method = 'GET', body, token = admin) => {
  const res = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};
const sold = async (imei) => (await query("SELECT count(*)::int n FROM stock_sold_units WHERE imei=$1 AND reverted_at IS NULL", [imei])).rows[0].n;
const qty = async (id) => Number((await query('SELECT qty FROM stock_items WHERE id=$1', [id])).rows[0].qty);
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

const cor = (await call('/attributes', 'POST', { name: 'Cor', values: ['Preto', 'Azul'] })).data.id;
const cap = (await call('/attributes', 'POST', { name: 'Capacidade', values: ['128GB', '256GB'] })).data.id;
const iphone = (await call('/stock', 'POST', {
  name: 'IPHONE 15', kind: 'device', qty: 0, price: 2850, images: ['https://cdsassets.apple.com/x/iphone-15.png'],
  variations: [
    { attrs: { [cor]: 'Preto', [cap]: '128GB' }, price: 2850, cost: 2400, qty: 0, minQty: 0, condition: 'used' },
    { attrs: { [cor]: 'Azul', [cap]: '256GB' }, price: 3300, cost: 2900, qty: 0, minQty: 0, condition: 'used' },
  ],
})).data;
const pretoId = iphone.variations[0].id;
for (const [imei, battery] of [['351000000000101', 87], ['351000000000102', 91]]) {
  const r = await call(`/stock/${iphone.id}/entries`, 'POST', { variation: { id: pretoId, attrs: { [cor]: 'Preto', [cap]: '128GB' }, condition: 'used' }, entry: { qty: 1, unitCost: 2400, imeis: [imei], batteryLevel: battery, payment: 'none' } });
  assert.equal(r.status, 201, JSON.stringify(r.error));
}
const capinha = (await call('/stock', 'POST', { name: 'CAPINHA MAGSAFE', kind: 'product', qty: 0, price: 89, cost: 20 })).data;
const store = { title: 'Novidades da semana', subtitle: 'Seminovos com garantia', accent: '#e4572e', productIds: [iphone.id, capinha.id] };

let catalog;
test('the store saves a catalog and the customer opens it by link, without login, with live prices, colors, capacity and battery', async () => {
  const created = await call('/sales-catalogs', 'POST', store);
  assert.equal(created.status, 201, JSON.stringify(created.error));
  catalog = created.data;
  const res = await fetch(`${base}/public/sales-catalogs/${catalog.token}`);
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.catalog.title, 'Novidades da semana');
  assert.equal(data.catalog.token, undefined, 'the token is not repeated in the page data');
  assert.deepEqual(data.items.map((i) => i.name), ['IPHONE 15'], 'sold-out products are hidden');
  const item = data.items[0];
  assert.equal(item.image, 'https://cdsassets.apple.com/x/iphone-15.png');
  assert.equal(item.price, 2850);
  assert.equal(item.condition, 'Usado');
  assert.deepEqual(item.variants.map((v) => [v.color, v.capacity, v.batteries, v.price]), [['Preto', '128GB', [91, 87], 2850]]);
  assert.equal(item.isNew, true);
  const text = JSON.stringify(data);
  assert.doesNotMatch(text, /2400|3511?0000000010/, 'no cost and no IMEI reach the customer');
});

test('the live preview shows unsaved choices; prices can be hidden; the link can be replaced', async () => {
  const preview = await call('/sales-catalogs/preview', 'POST', { productIds: [capinha.id, iphone.id], hideSoldOut: false });
  assert.deepEqual(preview.data.items.map((i) => [i.name, i.soldOut]), [['CAPINHA MAGSAFE', true], ['IPHONE 15', false]]);
  const saved = await call(`/sales-catalogs/${catalog.id}`, 'PATCH', { ...store, showPrices: false });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  const hidden = (await (await fetch(`${base}/public/sales-catalogs/${catalog.token}`)).json()).data;
  assert.equal(hidden.items[0].price, 0);
  const relinked = (await call(`/sales-catalogs/${catalog.id}/new-link`, 'POST')).data;
  assert.notEqual(relinked.token, catalog.token);
  assert.equal((await fetch(`${base}/public/sales-catalogs/${catalog.token}`)).status, 404, 'the old link stops working');
  assert.equal((await fetch(`${base}/public/sales-catalogs/${relinked.token}`)).status, 200);
});

test('only products of the store; sellers cannot delete; management can', async () => {
  await query("INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-z','a','Outra','Outra','9')");
  await query("INSERT INTO stock_items(id,store_id,name,qty,cost,price,active,kind) VALUES('foreign','store-z','DE OUTRA LOJA',3,1,999,true,'product')");
  const preview = await call('/sales-catalogs/preview', 'POST', { productIds: ['foreign', iphone.id] });
  assert.deepEqual(preview.data.items.map((i) => i.name), ['IPHONE 15']);
  assert.equal((await call(`/sales-catalogs/${catalog.id}`, 'DELETE', undefined, seller)).status, 403);
  assert.equal((await call(`/sales-catalogs/${catalog.id}`, 'DELETE')).status, 200);
  assert.equal((await call('/sales-catalogs')).data.length, 0);
});
