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

// iPhone 18 Pro Max: Preto custa R$ 8.900 (custo do produto = o da primeira variação), Bordô custa R$ 11.000.
const cor = (await call('/attributes', 'POST', { name: 'Cor', values: ['Preto', 'Bordô'] })).data?.id;
const cap = (await call('/attributes', 'POST', { name: 'Capacidade', values: ['256GB'] })).data?.id;
assert.ok(cor && cap, 'store has color and capacity attributes');
const created = await call('/stock', 'POST', {
  name: 'IPHONE 18 PRO MAX', kind: 'device', qty: 0, price: 9200,
  variations: [
    { attrs: { [cor]: 'Preto', [cap]: '256GB' }, price: 9200, cost: 8900, qty: 1, minQty: 0, condition: 'new' },
    { attrs: { [cor]: 'Bordô', [cap]: '256GB' }, price: 11250, cost: 11000, qty: 6, minQty: 0, condition: 'new' },
  ],
});
assert.equal(created.status, 201, JSON.stringify(created.error));
const stockId = created.data.id;
const bordo = [{ id: cor, name: 'Cor', value: 'Bordô' }, { id: cap, name: 'Capacidade', value: '256GB' }];
const saleCost = async (id) => (await query('SELECT cost_total, gross_profit FROM sales_orders WHERE id=$1', [id])).rows[0];

test('external sale of the Bordô takes the Bordô cost (R$ 11.000), not the product cost of the Preto', async () => {
  const sale = await call('/sales/external', 'POST', { sellerId: 'seller-1', paymentMethod: 'PIX', lines: [{ stockId, name: 'IPHONE 18 PRO MAX', qty: 1, unitPrice: 11250, attributes: bordo }] });
  assert.equal(sale.status, 201, JSON.stringify(sale.error));
  const order = await saleCost(sale.data.id);
  assert.deepEqual([Number(order.cost_total), Number(order.gross_profit)], [11000, 250]);
  const line = (await query('SELECT unit_cost FROM sales_order_lines WHERE sale_id=$1', [sale.data.id])).rows[0];
  assert.equal(Number(line.unit_cost), 11000);
});

test('PDV sale records the cost too (before, the PDV saved no cost and the whole sale counted as profit)', async () => {
  const sale = await call('/pos/sales', 'POST', { idempotencyKey: 'variation-cost-pdv-1', paymentName: 'Pix', lines: [{ stockId, name: 'IPHONE 18 PRO MAX', qty: 1, unitPrice: 11250, attributes: bordo }] });
  assert.equal(sale.status, 201, JSON.stringify(sale.error));
  const order = await saleCost(sale.data.id);
  assert.deepEqual([Number(order.cost_total), Number(order.gross_profit)], [11000, 250]);
});

test('a phone with a supplier entry uses the cost of that exact unit (by IMEI) in both sales', async () => {
  const entry = await call(`/stock/${stockId}/entries`, 'POST', { variation: { attrs: { [cor]: 'Bordô', [cap]: '256GB' }, condition: 'new' }, entry: { qty: 1, unitCost: 10800, imeis: ['359000000000018'], payment: 'none' } });
  assert.equal(entry.status, 201, JSON.stringify(entry.error));
  const sale = await call('/pos/sales', 'POST', { idempotencyKey: 'variation-cost-pdv-2', paymentName: 'Pix', lines: [{ stockId, name: 'IPHONE 18 PRO MAX', qty: 1, unitPrice: 11250, attributes: bordo, imei: '359000000000018' }] });
  assert.equal(sale.status, 201, JSON.stringify(sale.error));
  assert.equal(Number((await saleCost(sale.data.id)).cost_total), 10800);
});

test('the cost audit finds sales recorded with the wrong cost and fixes only the chosen ones, keeping history', async () => {
  // Venda antiga: gravada com o custo do produto (Preto) e uma do PDV sem custo, como antes da correção.
  const old = await call('/sales/external', 'POST', { sellerId: 'seller-1', paymentMethod: 'PIX', lines: [{ stockId, name: 'IPHONE 18 PRO MAX', qty: 1, unitPrice: 11250, attributes: bordo }] });
  assert.equal(old.status, 201, JSON.stringify(old.error));
  await query('UPDATE sales_order_lines SET unit_cost = 8900, total_cost = 8900 WHERE sale_id = $1', [old.data.id]);
  await query('UPDATE sales_orders SET cost_total = 8900, gross_profit = 2350 WHERE id = $1', [old.data.id]);
  const pdv = await call('/pos/sales', 'POST', { idempotencyKey: 'variation-cost-pdv-old', paymentName: 'Pix', lines: [{ stockId, name: 'IPHONE 18 PRO MAX', qty: 1, unitPrice: 11250, attributes: bordo }] });
  await query('UPDATE sales_order_lines SET unit_cost = 0, total_cost = 0 WHERE order_id = $1', [pdv.data.id]);
  await query('UPDATE sales_orders SET cost_total = 0, gross_profit = 0 WHERE id = $1', [pdv.data.id]);

  // Sem entrada (aparelho do saldo inicial), vale o custo da variação: hoje a média das entradas do Bordô.
  const vcost = (await call('/stock')).data.find((p) => p.id === stockId).variations.find((v) => Object.values(v.attrs).includes('Bordô')).cost;
  assert.equal(vcost, 10960);
  const audit = await call('/sales/cost-audit?days=30');
  assert.equal(audit.status, 200, JSON.stringify(audit.error));
  const found = Object.fromEntries(audit.data.sales.map((s) => [s.id, [s.recordedCost, s.cost, s.profit]]));
  assert.deepEqual(found[old.data.id], [8900, vcost, 11250 - vcost]);
  assert.deepEqual(found[pdv.data.id], [0, vcost, 11250 - vcost]);
  assert.equal(audit.data.wrong, 2, 'the sales recorded after the fix are already right');

  assert.equal((await call('/sales/cost-audit', 'GET', undefined, seller)).status, 403);
  const applied = await call('/sales/cost-audit/apply', 'POST', { saleIds: [old.data.id] });
  assert.deepEqual(applied.data.updated.map((u) => u.id), [old.data.id]);
  assert.deepEqual(Object.values(await saleCost(old.data.id)).map(Number), [vcost, 11250 - vcost]);
  assert.deepEqual(Object.values(await saleCost(pdv.data.id)).map(Number), [0, 0], 'only the chosen sale changes');
  const rev = (await query('SELECT reason, before, after FROM sale_revisions WHERE sale_id = $1', [old.data.id])).rows[0];
  assert.deepEqual([rev.before.cost, rev.after.cost], [8900, vcost]);
  assert.equal((await call('/sales/cost-audit?days=30')).data.wrong, 1);
});
