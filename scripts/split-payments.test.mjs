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

await query("INSERT INTO stock_items(id,store_id,name,qty,cost,price,active,kind) VALUES('watch','store-a','APPLE WATCH SE',5,1800,2500,true,'product')");
const sale = {
  customerName: 'Cliente Misto', sellerId: 'seller-1', paymentMethod: 'PIX', installments: 1,
  surcharge: 68, cardInterest: 68,
  lines: [{ stockId: 'watch', name: 'APPLE WATCH SE', qty: 1, unitPrice: 2500 }],
  payments: [
    { method: 'PIX', amount: 1000, installments: 1 },
    { method: 'Dinheiro', amount: 500, installments: 1 },
    { method: 'Cartão de Crédito', amount: 1068, installments: 3, cardInterest: 68 },
  ],
};

let saleId;
test('one sale paid with PIX, cash and a 3x card: each payment gets its own receivable, cash book entry and pickup', async () => {
  const created = await call('/sales/external', 'POST', sale);
  assert.equal(created.status, 201, JSON.stringify(created.error));
  saleId = created.data.id;
  assert.equal(created.data.paymentMethod, 'PIX + Dinheiro + Cartão de Crédito 3x');

  const order = (await query('SELECT total_amount, card_interest, cash_amount, payment_name, external_cash_status FROM sales_orders WHERE id=$1', [saleId])).rows[0];
  assert.deepEqual([Number(order.total_amount), Number(order.card_interest), Number(order.cash_amount), order.external_cash_status], [2568, 68, 500, 'pending_pickup']);
  const payments = (await query('SELECT method_name, amount, installments, card_interest FROM sale_payments WHERE sale_id=$1 ORDER BY created_at, id', [saleId])).rows;
  assert.deepEqual(payments.map((p) => [p.method_name, Number(p.amount), p.installments, Number(p.card_interest)]), [['PIX', 1000, 1, 0], ['Dinheiro', 500, 1, 0], ['Cartão de Crédito', 1068, 3, 68]]);

  const recs = (await query('SELECT amount, status FROM receivables WHERE sale_id=$1', [saleId])).rows;
  assert.deepEqual(recs.filter((r) => r.status === 'paid').map((r) => Number(r.amount)).sort((a, b) => a - b), [500, 1000]);
  const open = recs.filter((r) => r.status === 'open');
  assert.equal(open.length, 3);
  assert.equal(Math.round(open.reduce((t, r) => t + Number(r.amount), 0) * 100), 106800);
  const book = (await query('SELECT amount FROM finance_entries WHERE ref_id=$1', [saleId])).rows.map((r) => Number(r.amount)).sort((a, b) => a - b);
  assert.deepEqual(book, [500, 1000], 'only what was received now goes to the cash book');
  assert.equal((await call('/finance/pickups')).data.pendingCashBalance, 500, 'only the cash part waits for pickup');

  const receipt = (await call(`/sales/${saleId}/receipt`)).data;
  const text = JSON.stringify(receipt);
  assert.match(text, /PIX R\$\s?1\.000,00 \+ Dinheiro R\$\s?500,00 \+ Cartão de Crédito R\$\s?1\.068,00 \(3x de R\$\s?356,00\)/);
  const found = (await call('/sales/search?q=Cliente Misto&includeExternal=1')).data;
  if (found?.items?.length) assert.equal(found.items[0].payment, 'PIX + Dinheiro + Cartão de Crédito · 3x');
});

test('payments that do not add up to the total are refused, and nothing is recorded', async () => {
  const before = Number((await query('SELECT qty FROM stock_items WHERE id=$1', ['watch'])).rows[0].qty);
  const wrong = await call('/sales/external', 'POST', { ...sale, payments: [{ method: 'PIX', amount: 1000 }, { method: 'Dinheiro', amount: 500 }] });
  assert.equal(wrong.status, 400);
  assert.match(wrong.error.message, /soma dos pagamentos/);
  assert.equal(Number((await query('SELECT qty FROM stock_items WHERE id=$1', ['watch'])).rows[0].qty), before);
});

test('the correction form brings each payment back with the agreed amount (card interest is recalculated)', async () => {
  const form = await call(`/sales/${saleId}/edit`);
  assert.equal(form.status, 200, JSON.stringify(form.error));
  assert.deepEqual(form.data.payments, [
    { method: 'PIX', amount: 1000, installments: 1 },
    { method: 'Dinheiro', amount: 500, installments: 1 },
    { method: 'Cartão de Crédito', amount: 1000, installments: 3 },
  ]);
  const edited = await call(`/sales/${saleId}`, 'PUT', { ...sale, reason: 'Cliente pagou tudo no PIX', surcharge: 0, cardInterest: 0, payments: [{ method: 'PIX', amount: 2500 }] });
  assert.equal(edited.status, 200, JSON.stringify(edited.error));
  const order = (await query('SELECT total_amount, cash_amount, external_cash_status, payment_name FROM sales_orders WHERE id=$1', [saleId])).rows[0];
  assert.deepEqual([Number(order.total_amount), order.cash_amount, order.payment_name], [2500, null, 'PIX']);
  assert.equal((await query('SELECT count(*)::int n FROM sale_payments WHERE sale_id=$1', [saleId])).rows[0].n, 1);
  assert.equal((await call('/finance/pickups')).data.pendingCashBalance, 0);
});
