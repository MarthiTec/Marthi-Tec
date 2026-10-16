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
const expected = async (id) => Number((await query('SELECT expected_cash FROM cash_sessions WHERE id=$1', [id])).rows[0].expected_cash);
const stockQty = async (id) => Number((await query('SELECT qty FROM stock_items WHERE id=$1', [id])).rows[0].qty);

let sessionId;
test('the PDV register lives in the database: open, aporte, sangria (with edit and delete), drawer', async () => {
  assert.equal((await call('/cash/sessions/open')).data, null);
  const opened = await call('/cash/sessions/open', 'POST', { openingFloat: 200, operatorName: 'Mariana' });
  assert.equal(opened.status, 201, JSON.stringify(opened.error));
  sessionId = opened.data.id;
  assert.deepEqual([opened.data.status, opened.data.expectedCash, opened.data.movements[0].kind], ['open', 200, 'open']);
  assert.equal((await call('/cash/sessions/open', 'POST', { openingFloat: 10 })).status, 409, 'one open register per store');
  const aporte = await call(`/cash/sessions/${sessionId}/aporte`, 'POST', { amount: 50, reason: 'Troco' });
  assert.equal(aporte.data.expectedCash, 250);
  assert.equal((await call(`/cash/sessions/${sessionId}/sangria`, 'POST', { amount: 999 })).status, 409, 'sangria above the drawer');
  const sangria = await call(`/cash/sessions/${sessionId}/sangria`, 'POST', { amount: 30, reason: 'Lanche', beneficiaryType: 'employee', beneficiaryName: 'Saulo' });
  assert.equal(sangria.data.expectedCash, 220);
  const moveId = sangria.data.movements.find((m) => m.kind === 'sangria').id;
  const edited = await call(`/cash/sessions/${sessionId}/movements/${moveId}`, 'PATCH', { amount: 40, reason: 'Transporte' });
  assert.equal(edited.status, 200, JSON.stringify(edited.error));
  assert.equal(edited.data.expectedCash, 210);
  assert.equal(edited.data.movements.find((m) => m.id === moveId).reason, 'Transporte');
  const removed = await call(`/cash/sessions/${sessionId}/movements/${moveId}`, 'DELETE');
  assert.equal(removed.data.expectedCash, 250);
  assert.equal((await call(`/cash/sessions/${sessionId}/movements/${opened.data.movements[0].id}`, 'DELETE')).status, 409, 'only sangria/aporte can be removed');
  assert.equal((await call(`/cash/sessions/${sessionId}/drawer`, 'POST', {})).data.movements.at(-1).kind, 'drawer');
  assert.equal(await expected(sessionId), 250);
});

test('every PDV sale enters the open register; only the cash part goes to the drawer; cancelling returns that cash', async () => {
  await query("INSERT INTO stock_items(id,store_id,name,qty,cost,price) VALUES('cash-stock','store-a','Capinha',10,10,50)");
  const card = await call('/pos/sales', 'POST', { idempotencyKey: 'cash-card-1', paymentName: 'Cartão de Crédito', cashAmount: 0, lines: [{ stockId: 'cash-stock', name: 'Capinha', qty: 1, unitPrice: 50 }] });
  assert.equal(card.status, 201, JSON.stringify(card.error));
  const split = await call('/pos/sales', 'POST', { idempotencyKey: 'cash-split-1', paymentName: 'Dinheiro + Pix', cashAmount: 30, lines: [{ stockId: 'cash-stock', name: 'Capinha', qty: 2, unitPrice: 50 }] });
  assert.equal(split.status, 201, JSON.stringify(split.error));
  const session = (await call(`/cash/sessions/${sessionId}`)).data;
  const sales = session.movements.filter((m) => m.kind === 'sale');
  assert.deepEqual(sales.map((m) => [m.amount, m.cashAmount]), [[50, 0], [100, 30]]);
  assert.equal(session.expectedCash, 280);
  assert.equal((await query('SELECT session_id FROM sales_orders WHERE id=$1', [split.data.id])).rows[0].session_id, sessionId);
  const cancelled = await call(`/sales/${split.data.id}/cancel`, 'POST', { reason: 'Desistiu' });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.error));
  assert.equal(await expected(sessionId), 250, 'the R$ 30 in cash left the drawer');
  assert.equal(await stockQty('cash-stock'), 9);
});

test('store credit (vale-compra) is issued, redeemed and cancelled in the database', async () => {
  const issued = await call('/cash/credits', 'POST', { customerName: 'Joana', amount: 40 });
  assert.equal(issued.status, 201, JSON.stringify(issued.error));
  assert.match(issued.data.code, /^VC-/);
  assert.equal(await expected(sessionId), 210);
  const used = await call(`/cash/credits/${issued.data.code.toLowerCase()}/use`, 'POST', { amount: 15 });
  assert.equal(used.status, 200, JSON.stringify(used.error));
  assert.deepEqual([used.data.remaining, used.data.status], [25, 'open']);
  assert.equal((await call(`/cash/credits/${issued.data.id}/use`, 'POST', { amount: 99 })).status, 409);
  assert.equal((await call(`/cash/credits/${issued.data.id}/cancel`, 'POST', {})).data.status, 'cancelled');
  assert.equal((await call(`/cash/credits/${issued.data.id}/use`, 'POST', { amount: 1 })).status, 404);
  assert.equal((await call('/cash/credits')).data.length, 1);
});

test('an exchange returns the item to stock, takes the new one out and settles the difference in cash or credit', async () => {
  await query("INSERT INTO stock_items(id,store_id,name,qty,cost,price) VALUES('cash-film','store-a','Película',5,5,30)");
  const before = await expected(sessionId);
  const pay = await call('/cash/exchanges', 'POST', { orderId: 'PED-1', customerName: 'Joana', returnLines: [{ stockId: 'cash-stock', name: 'Capinha', qty: 1, unitPrice: 50 }], outLines: [{ stockId: 'cash-film', name: 'Película', qty: 2, unitPrice: 30 }] });
  assert.equal(pay.status, 201, JSON.stringify(pay.error));
  assert.deepEqual([pay.data.returnTotal, pay.data.outTotal, pay.data.cashDelta], [50, 60, 10]);
  assert.deepEqual([await stockQty('cash-stock'), await stockQty('cash-film')], [10, 3]);
  assert.equal(await expected(sessionId), before + 10);
  const credit = await call('/cash/exchanges', 'POST', { customerName: 'Joana', settleAs: 'credit', returnLines: [{ stockId: 'cash-film', name: 'Película', qty: 1, unitPrice: 30 }], outLines: [] });
  assert.equal(credit.status, 201, JSON.stringify(credit.error));
  assert.ok(credit.data.creditId);
  assert.equal(credit.data.cashDelta, 0);
  assert.equal(await expected(sessionId), before + 10, 'credit for the customer: no cash leaves the drawer');
  assert.equal((await call('/cash/exchanges')).data.length, 2);
  assert.equal((await call('/cash/exchanges', 'POST', { returnLines: [], outLines: [{ stockId: 'cash-film', name: 'Película', qty: 99, unitPrice: 30 }] })).status, 409);
});

test('closing keeps the breakdown and the difference; a closed register can be reopened', async () => {
  const exp = await expected(sessionId);
  const closed = await call(`/cash/sessions/${sessionId}/close`, 'POST', { countedCash: exp - 5, breakdown: { countedPix: 100, countedCredit: 50 } });
  assert.equal(closed.status, 200, JSON.stringify(closed.error));
  assert.deepEqual([closed.data.status, closed.data.difference, closed.data.closeBreakdown.countedPix], ['closed', -5, 100]);
  assert.equal((await call(`/cash/sessions/${sessionId}/aporte`, 'POST', { amount: 1 })).status, 409);
  const reopened = await call(`/cash/sessions/${sessionId}/reopen`, 'POST', {});
  assert.deepEqual([reopened.data.status, reopened.data.reopenCount], ['open', 1]);
  assert.equal((await call('/cash/sessions')).data.length, 1);
});
