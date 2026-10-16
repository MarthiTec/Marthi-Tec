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
const balance = async (id) => Number((await query('SELECT current_balance FROM bank_accounts WHERE id=$1', [id])).rows[0].current_balance);
const localDay = (value) => new Date(new Date(value).getTime() - 3 * 3600000).toISOString().slice(0, 10);
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

let caixa, banco;
test('bank accounts are read, created and deactivated in the store database', async () => {
  caixa = (await call('/finance/accounts', 'POST', { name: 'Caixa', type: 'cash', initialBalance: 1000 })).data.id;
  banco = (await call('/finance/accounts', 'POST', { name: 'Banco', type: 'checking', initialBalance: 0 })).data.id;
  const temp = (await call('/finance/accounts', 'POST', { name: 'Temporária', type: 'digital' })).data.id;
  assert.equal((await call('/finance/accounts/' + temp, 'DELETE')).status, 200);
  assert.deepEqual((await call('/finance/accounts')).data.map((a) => a.name).sort(), ['Banco', 'Caixa']);
  assert.ok((await call('/finance/accounts')).data.every((a) => a.updatedAt));
});

test('a bill paid on an earlier day keeps that day in the cash book', async () => {
  const bill = (await call('/finance/payables', 'POST', { description: 'Luz', category: 'Luz', amount: 400.97, dueDate: '2026-10-01' })).data;
  const paid = await call(`/finance/payables/${bill.id}/pay`, 'POST', { paymentDate: '2026-10-01', accountId: caixa });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.status, 'paid');
  const entry = (await query('SELECT created_at, amount FROM finance_entries WHERE ref_id=$1', [bill.id])).rows[0];
  assert.equal(localDay(entry.created_at), '2026-10-01');
  assert.equal(Number(entry.amount), 400.97);
  assert.equal(await balance(caixa), 1000 - 400.97);
});

test('treasury moves money between the store accounts and rejects invalid or foreign accounts', async () => {
  const before = { caixa: await balance(caixa), banco: await balance(banco) };
  const move = await call('/finance/treasury', 'POST', { kind: 'transfer', fromAccountId: caixa, toAccountId: banco, amount: 300, description: 'Depósito do dia', at: '2026-10-02T15:00:00Z' });
  assert.equal(move.status, 201, JSON.stringify(move.error));
  assert.deepEqual([await balance(caixa), await balance(banco)], [before.caixa - 300, before.banco + 300]);
  assert.equal((await call('/finance/treasury', 'POST', { kind: 'transfer', fromAccountId: caixa, toAccountId: caixa, amount: 10 })).status, 400);
  await query("INSERT INTO bank_accounts(id,store_id,name) VALUES('acc-b','store-b','Conta B')");
  assert.equal((await call('/finance/treasury', 'POST', { kind: 'deposit', toAccountId: 'acc-b', amount: 10 })).status, 400);
  const list = (await call('/finance/treasury')).data;
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].kind, list[0].amount, list[0].fromAccountId, list[0].toAccountId], ['transfer', 300, caixa, banco]);
});

test('advances enter the cash book, are applied and only the unused part is refunded', async () => {
  const created = await call('/finance/advances', 'POST', { kind: 'customer', partyName: 'Cliente Sinal', amount: 500, accountId: caixa });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const id = created.data.id;
  const cashBefore = await balance(caixa);
  assert.equal((await call(`/finance/advances/${id}/apply`, 'POST', { amount: 600 })).status, 422);
  assert.equal((await call(`/finance/advances/${id}/apply`, 'POST', { amount: 200 })).data.usedAmount, 200);
  const refunded = await call(`/finance/advances/${id}/refund`, 'POST');
  assert.equal(refunded.data.status, 'refunded');
  assert.equal(await balance(caixa), cashBefore - 300);
  const entries = (await query('SELECT type, amount FROM finance_entries WHERE ref_id=$1 ORDER BY created_at', [id])).rows.map((r) => `${r.type} ${Number(r.amount)}`);
  assert.deepEqual(entries, ['in 500', 'out 300']);
  assert.equal((await call(`/finance/advances/${id}/apply`, 'POST', { amount: 1 })).status, 409);
});

test('dashboard summary is computed from the database and matches it', async () => {
  await query("INSERT INTO stock_items(id,store_id,name,qty,min_qty,cost,price,active) VALUES('s1','store-a','A',5,1,10,20,true),('s2','store-a','B',0,0,10,20,true)");
  await query("INSERT INTO payables(id,store_id,description,amount,paid_amount,due_date,status) VALUES('p-open','store-a','Aluguel',1000,250,'2026-12-10','partial')");
  const res = await call('/dashboard/summary?days=7');
  assert.equal(res.status, 200, JSON.stringify(res.error));
  const sum = async (sql) => Number((await query(sql)).rows[0].v);
  assert.equal(res.data.cashBalance, await sum("SELECT COALESCE(sum(CASE WHEN type='in' THEN amount ELSE -amount END),0) v FROM finance_entries WHERE store_id='store-a'"));
  assert.equal(res.data.payablesOpen, 750);
  assert.equal(res.data.skuCount, 2);
  assert.equal(res.data.stockUnits, 5);
  assert.equal(res.data.lowStock, 1);
  assert.equal(res.data.series.length, 7);
  assert.equal(res.data.treasury, (await balance(caixa)) + (await balance(banco)));
  assert.equal((await fetch(base + '/dashboard/summary', { headers: { 'x-store-id': 'store-a' } })).status, 401);
});

test('DRE counts each settled bill once (cash book), by category and by month in Brasília', async () => {
  const bill = (await call('/finance/receivables', 'POST', { description: 'Venda a prazo', category: 'Vendas', amount: 1000, dueDate: '2026-09-15' })).data;
  assert.equal((await call(`/finance/receivables/${bill.id}/receive`, 'POST', { paymentDate: '2026-09-15' })).status, 200);
  const dre = (await call('/finance/dre?month=2026-09')).data;
  const sum = async (type) => Number((await query(`SELECT COALESCE(sum(amount),0) v FROM finance_entries WHERE store_id='store-a' AND type=$1 AND to_char(created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')='2026-09'`, [type])).rows[0].v);
  assert.equal(dre.revenue, await sum('in'));
  assert.equal(dre.revenue, 1000);
  assert.equal(dre.expenses, await sum('out'));
  assert.deepEqual(dre.lines.find((line) => line.label === 'Receita · Vendas'), { label: 'Receita · Vendas', amount: 1000, kind: 'revenue' });
  assert.equal(dre.result, dre.revenue - dre.expenses);
  assert.equal((await call('/finance/dre?month=2026-9')).status, 400);
});

test('a purchase paid on a past entry date leaves the cash on that day; older ones are moved by migration 0089', async () => {
  await query("INSERT INTO stock_items(id,store_id,name,qty,cost,price,active) VALUES('s-entry','store-a','Aparelho',0,0,2000,true)");
  const posted = await call('/stock/s-entry/entries', 'POST', { entry: { entryDate: '2026-09-28', qty: 1, unitCost: 1280, imeis: ['900000000000777'], payment: 'paid' } });
  assert.equal(posted.status, 201, JSON.stringify(posted.error));
  const entry = (await query('SELECT f.created_at FROM finance_entries f WHERE f.ref_id=$1', [posted.data.payableId])).rows[0];
  assert.equal(localDay(entry.created_at), '2026-09-28');
  // Como ficou em produção antes da correção: saída do caixa no dia do lançamento.
  await query("UPDATE finance_entries SET created_at = now() WHERE ref_id=$1", [posted.data.payableId]);
  await query("UPDATE payables SET created_at = now() WHERE id=$1", [posted.data.payableId]);
  for (let i = 0; i < 2; i += 1) await db.exec(fs.readFileSync('apps/api/src/db/migrations/0089_entry_purchase_cash_date.sql', 'utf8'));
  const fixed = (await query('SELECT created_at FROM finance_entries WHERE ref_id=$1', [posted.data.payableId])).rows[0];
  assert.equal(localDay(fixed.created_at), '2026-09-28');
});

test('bills follow ERP rules: a settled bill needs a reversal before delete or amount change; history shows the settlement', async () => {
  const bill = (await call('/finance/payables', 'POST', { description: 'Aluguel', category: 'Aluguel', amount: 4345, dueDate: '2026-10-10' })).data;
  assert.equal((await call(`/finance/payables/${bill.id}/pay`, 'POST', { paymentDate: '2026-10-10' })).status, 200);
  const history = (await call(`/finance/movements?refId=${bill.id}`)).data;
  assert.deepEqual(history.map((m) => [m.type, m.amount]), [['out', 4345]]);
  const blocked = await call(`/finance/payables/${bill.id}`, 'DELETE');
  assert.equal(blocked.status, 409);
  assert.match(blocked.error.message, /estorne/);
  assert.equal((await call(`/finance/payables/${bill.id}`, 'PATCH', { amount: 4000 })).status, 409);
  assert.equal((await call(`/finance/payables/${bill.id}`, 'PATCH', { description: 'Aluguel loja 119A', amount: 4345 })).status, 200, 'other fields can be edited');
  assert.equal((await call(`/finance/payables/${bill.id}/revert`, 'POST', {})).status, 200);
  assert.equal((await call(`/finance/movements?refId=${bill.id}`)).data.length, 0);
  assert.equal((await call(`/finance/payables/${bill.id}`, 'PATCH', { amount: 4000 })).status, 200);
  assert.equal((await call(`/finance/payables/${bill.id}`, 'DELETE')).status, 200);
  assert.equal((await query('SELECT count(*)::int n FROM payables WHERE id=$1', [bill.id])).rows[0].n, 0);
});

test('editing a bill from the form: empty fields clear the link, omitted fields stay', async () => {
  const bill = (await call('/finance/payables', 'POST', { description: 'Internet', category: 'Internet', amount: 179.8, dueDate: '2026-10-25', notes: 'contrato 12 meses', documentNumber: 'BOL-1' })).data;
  // O formulário manda fornecedor avulso e conta bancária em branco como ''.
  const edited = await call(`/finance/payables/${bill.id}`, 'PATCH', { description: 'Internet loja', supplierId: '', supplierName: 'Giga', amount: 189.9, dueDate: '2026-10-25', accountId: '', notes: '' });
  assert.equal(edited.status, 200, JSON.stringify(edited.error));
  const row = (await query('SELECT description, supplier_id, amount, account_id, notes, document_number FROM payables WHERE id=$1', [bill.id])).rows[0];
  assert.equal(row.description, 'Internet loja');
  assert.equal(row.supplier_id, null);
  assert.equal(Number(row.amount), 189.9);
  assert.equal(row.account_id, null);
  assert.equal(row.notes, '', 'notes erased in the form are erased');
  assert.equal(row.document_number, 'BOL-1', 'fields not sent are kept');
  const receivable = (await call('/finance/receivables', 'POST', { description: 'Conserto', category: 'Serviços OS', amount: 350, dueDate: '2026-10-20' })).data;
  assert.equal((await call(`/finance/receivables/${receivable.id}`, 'PATCH', { customerId: '', customerName: 'Cliente', accountId: '', amount: 380 })).status, 200);
});

test('bills created by a stock entry or a sale are corrected at their origin', async () => {
  await query("INSERT INTO stock_items(id,store_id,name,qty,cost,price,active) VALUES('s-origin','store-a','Aparelho origem',0,0,2000,true)");
  const entry = await call('/stock/s-origin/entries', 'POST', { entry: { entryDate: '2026-10-05', qty: 1, unitCost: 1500, imeis: ['900000000000888'], payment: 'pending' } });
  assert.equal(entry.status, 201, JSON.stringify(entry.error));
  const fromEntry = await call(`/finance/payables/${entry.data.payableId}`, 'DELETE');
  assert.equal(fromEntry.status, 409);
  assert.match(fromEntry.error.message, /entrada de estoque/);
  const listed = (await call('/finance/payables')).data.find((p) => p.id === entry.data.payableId);
  assert.ok(listed.stockEntryId);

  await query("INSERT INTO sales_orders(id,store_id,customer_name,subtotal,final_amount,status,sale_type) VALUES('VND-ORIGIN','store-a','Cliente',100,100,'completed','external')");
  await query("INSERT INTO receivables(id,store_id,description,amount,due_date,status,sale_id) VALUES('REC-ORIGIN','store-a','Parcela',100,'2026-11-10','open','VND-ORIGIN')");
  const fromSale = await call('/finance/receivables/REC-ORIGIN', 'DELETE');
  assert.equal(fromSale.status, 409);
  assert.match(fromSale.error.message, /VND-ORIGIN/);
  assert.equal((await call('/finance/receivables')).data.find((r) => r.id === 'REC-ORIGIN').saleId, 'VND-ORIGIN');
  // Recebida na própria venda (caixa ligado à venda): estorno pela venda.
  await query("UPDATE receivables SET status='paid', received_amount=100 WHERE id='REC-ORIGIN'");
  const revert = await call('/finance/receivables/REC-ORIGIN/revert', 'POST', {});
  assert.equal(revert.status, 409);
  assert.match(revert.error.message, /própria venda/);
});
