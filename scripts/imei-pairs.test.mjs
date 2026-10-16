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

await query("INSERT INTO stock_items(id,store_id,name,qty,cost,price,kind) VALUES('dual','store-a','GALAXY A55',0,0,1800,'device'),('other','store-a','MOTO G85',0,0,1500,'device')");

test('a dual-SIM phone keeps its 2nd IMEI without changing the quantity; no IMEI repeats in the store', async () => {
  const entry = await call('/stock/dual/entries', 'POST', { entry: { qty: 2, unitCost: 1200, imeis: ['350000000000011', '350000000000029'], secondaryImeis: { '350000000000011': '350000000000037' }, payment: 'none' } });
  assert.equal(entry.status, 201, JSON.stringify(entry.error));
  const product = (await call('/stock')).data.find((item) => item.id === 'dual');
  assert.equal(product.qty, 2, 'the 2nd IMEI does not add a unit');
  assert.deepEqual(product.supplierEntries[0].secondaryImeis, { '350000000000011': '350000000000037' });
  const reused = await call('/stock/other/entries', 'POST', { entry: { qty: 1, unitCost: 900, imeis: ['350000000000037'], payment: 'none' } });
  assert.equal(reused.status, 409, 'a 2nd IMEI cannot be used as another phone');
  assert.match(reused.error.message, /GALAXY A55/);
  const sameAsMain = await call('/stock/other/entries', 'POST', { entry: { qty: 1, unitCost: 900, imeis: ['350000000000045'], secondaryImeis: { '350000000000045': '350000000000011' }, payment: 'none' } });
  assert.equal(sameAsMain.status, 409, 'nor can a main IMEI be used as a 2nd IMEI');
  const notInEntry = await call('/stock/other/entries', 'POST', { entry: { qty: 1, unitCost: 900, imeis: ['350000000000052'], secondaryImeis: { '350000000000060': '350000000000078' }, payment: 'none' } });
  assert.equal(notInEntry.status, 400);
});

test('selling by the 2nd IMEI takes out the right unit, and the sale is found by either IMEI', async () => {
  const sale = await call('/pos/sales', 'POST', { idempotencyKey: 'dual-sale-1', paymentName: 'Pix', lines: [{ stockId: 'dual', name: 'GALAXY A55', qty: 1, unitPrice: 1800, imei: '350000000000037' }] });
  assert.equal(sale.status, 201, JSON.stringify(sale.error));
  const sold = (await query("SELECT imei FROM stock_sold_units WHERE sale_id=$1 AND reverted_at IS NULL", [sale.data.id])).rows.map((row) => row.imei);
  assert.deepEqual(sold, ['350000000000011'], 'the main IMEI of that phone left the stock');
  const bySecond = (await call('/sales/search?imei=000000037')).data.items.map((item) => item.id);
  const byMain = (await call('/sales/search?imei=000000011')).data.items.map((item) => item.id);
  assert.deepEqual([bySecond, byMain], [[sale.data.id], [sale.data.id]]);
});
