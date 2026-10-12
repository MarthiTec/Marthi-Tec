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

// Produto com dois aparelhos (IMEI) de custos diferentes.
await query("INSERT INTO stock_items(id,store_id,name,qty,cost,price,active,kind) VALUES('iphone','store-a','IPHONE 17 PRO MAX',0,0,7500,true,'device')");
for (const [imei, unitCost] of [['111111111111111', 6900], ['222222222222222', 7050]]) {
  const r = await call('/stock/iphone/entries', 'POST', { entry: { entryDate: '2026-09-28', qty: 1, unitCost, imeis: [imei], payment: 'none' } });
  assert.equal(r.status, 201, JSON.stringify(r.error));
}
const day = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
const sale = {
  customerName: 'Cliente Errado', sellerId: 'seller-1', paymentMethod: 'PIX', installments: 1, saleDate: day,
  lines: [{ stockId: 'iphone', name: 'IPHONE 17 PRO MAX', qty: 1, unitPrice: 7500, imei: '111111111111111' }],
};

let saleId;
test('a completed sale is corrected entirely: customer, seller, device, price, payment and date; same number, history kept', async () => {
  const created = await call('/sales/external', 'POST', sale);
  assert.equal(created.status, 201, JSON.stringify(created.error));
  saleId = created.data.id;
  assert.equal(await sold('111111111111111'), 1);

  const form = await call(`/sales/${saleId}/edit`);
  assert.equal(form.status, 200, JSON.stringify(form.error));
  assert.equal(form.data.saleDate, day);
  assert.deepEqual([form.data.lines[0].imei, form.data.paymentMethod, form.data.sellerId], ['111111111111111', 'PIX', 'seller-1']);

  const edited = await call(`/sales/${saleId}`, 'PUT', {
    ...sale, reason: 'Lançado com o aparelho e o cliente errados na planilha', customerId: 'cust-1', sellerId: 'seller-2',
    paymentMethod: 'Cartão de Crédito', installments: 3, lines: [{ ...sale.lines[0], imei: '222222222222222', unitPrice: 7400 }],
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.error));
  assert.equal(edited.data.id, saleId);

  const order = (await query("SELECT customer_name, seller_name, subtotal, cost_total, gross_profit, status, to_char(created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') d FROM sales_orders WHERE id=$1", [saleId])).rows[0];
  assert.deepEqual([order.customer_name, order.seller_name, Number(order.subtotal), Number(order.cost_total), Number(order.gross_profit), order.status, order.d], ['Cliente Certo', 'Gilvan', 7400, 7050, 350, 'completed', day]);
  // O aparelho errado voltou ao estoque; o certo saiu. Quantidade continua a mesma.
  assert.deepEqual([await sold('111111111111111'), await sold('222222222222222'), await qty('iphone')], [0, 1, 1]);
  // Pagamento corrigido: 3 parcelas a receber, sem entrada no caixa à vista; nada da venda antiga sobrou.
  const recs = (await query("SELECT amount, status, due_date FROM receivables WHERE sale_id=$1 ORDER BY due_date", [saleId])).rows;
  assert.deepEqual(recs.map((r) => r.status), ['open', 'open', 'open']);
  assert.equal(Math.round(recs.reduce((t, r) => t + Number(r.amount), 0) * 100), 740000);
  assert.equal(String(recs[0].due_date instanceof Date ? recs[0].due_date.toISOString() : recs[0].due_date).slice(0, 10), new Date(Date.parse(day + 'T12:00:00Z') + 30 * 86400000).toISOString().slice(0, 10));
  assert.equal((await query('SELECT count(*)::int n FROM finance_entries WHERE ref_id=$1', [saleId])).rows[0].n, 0);
  assert.equal((await query('SELECT count(*)::int n FROM sale_payments WHERE sale_id=$1', [saleId])).rows[0].n, 1);
  const revision = (await query('SELECT reason, operator_name, before, after FROM sale_revisions WHERE sale_id=$1', [saleId])).rows[0];
  assert.equal(revision.operator_name, 'Gestora');
  assert.equal(revision.before.sale.customer_name, 'Cliente Errado');
  assert.equal(revision.after.sale.customer_name, 'Cliente Certo');
  assert.equal((await call(`/sales/${saleId}/edit`)).data.revisions.length, 1);
});

test('only store management corrects sales; a reason is required', async () => {
  assert.equal((await call(`/sales/${saleId}`, 'PUT', { ...sale, reason: 'Teste' }, seller)).status, 403);
  assert.equal((await call(`/sales/${saleId}`, 'PUT', { ...sale, reason: '' })).status, 400);
});

test('a received installment blocks the correction until the receipt is reversed', async () => {
  const rec = (await query("SELECT id FROM receivables WHERE sale_id=$1 ORDER BY due_date LIMIT 1", [saleId])).rows[0];
  assert.equal((await call(`/finance/receivables/${rec.id}/receive`, 'POST', {})).status, 200);
  const blocked = await call(`/sales/${saleId}`, 'PUT', { ...sale, reason: 'Ajuste', lines: [{ ...sale.lines[0], imei: '222222222222222' }] });
  assert.equal(blocked.status, 409);
  assert.match(blocked.error.message, /parcela já recebida/);
  assert.equal(await sold('222222222222222'), 1, 'nothing changed');
});

test('a trade-in already resold stays in the corrected sale with the new credit; it cannot be swapped', async () => {
  await query("INSERT INTO stock_items(id,store_id,name,qty,cost,price,active,kind) VALUES('iphone11','store-a','IPHONE 11',0,0,1000,true,'device')");
  const withTrade = { ...sale, saleDate: undefined, lines: [{ ...sale.lines[0], imei: '111111111111111' }], tradeIn: { deviceName: 'IPHONE 11', imei: '333333333333333', capacity: '128GB', color: 'Branco', tradeValue: 600 } };
  const created = await call('/sales/external', 'POST', withTrade);
  assert.equal(created.status, 201, JSON.stringify(created.error));
  // O aparelho da troca é revendido.
  const resale = await call('/sales/external', 'POST', { ...sale, saleDate: undefined, lines: [{ stockId: 'iphone11', name: 'IPHONE 11', qty: 1, unitPrice: 1000, imei: '333333333333333' }] });
  assert.equal(resale.status, 201, JSON.stringify(resale.error));

  const kept = await call(`/sales/${created.data.id}`, 'PUT', { ...withTrade, reason: 'Valor da troca era 650', tradeIn: { ...withTrade.tradeIn, tradeValue: 650 } });
  assert.equal(kept.status, 200, JSON.stringify(kept.error));
  const trade = (await query("SELECT trade_value, status FROM sale_trade_ins WHERE sale_id=$1", [created.data.id])).rows;
  assert.deepEqual(trade.map((t) => [Number(t.trade_value), t.status]), [[650, 'received']]);
  assert.equal(Number((await query("SELECT unit_cost FROM stock_supplier_entries WHERE imeis @> '[\"333333333333333\"]'::jsonb")).rows[0].unit_cost), 650);
  assert.equal(await sold('333333333333333'), 1, 'the resale is untouched');

  const swapped = await call(`/sales/${created.data.id}`, 'PUT', { ...withTrade, reason: 'Troca era outro aparelho', tradeIn: { ...withTrade.tradeIn, imei: '444444444444444' } });
  assert.equal(swapped.status, 409);
});
