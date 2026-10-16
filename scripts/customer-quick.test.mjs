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

let caixa, banco;

test('quick customer from a sale keeps the store form data: CPF, RG, phone and full address', async () => {
  const created = await call('/customers', 'POST', {
    name: 'Maria da Silva', documentType: 'cpf', document: '529.982.247-25', rg: '12.345.678-9', phone: '(21) 99876-5432', email: '',
    zipCode: '20040-020', street: 'Avenida Rio Branco', number: '156', complement: 'sala 2', neighborhood: 'Centro', city: 'Rio de Janeiro', state: 'rj', active: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const row = (await query('SELECT rg, document_type, zip_code, street, number, complement, district, city, state FROM customers WHERE id=$1', [created.data.id])).rows[0];
  assert.deepEqual(row, { rg: '12.345.678-9', document_type: 'cpf', zip_code: '20040-020', street: 'Avenida Rio Branco', number: '156', complement: 'sala 2', district: 'Centro', city: 'Rio de Janeiro', state: 'RJ' });
  const listed = (await call('/customers')).data.find((item) => item.id === created.data.id);
  assert.equal(listed.rg, '12.345.678-9');
  assert.equal(listed.neighborhood, 'Centro');
  assert.equal((await call(`/customers/${created.data.id}`, 'PATCH', { rg: '98.765.432-1' })).status, 200);
  assert.equal((await call(`/customers/${created.data.id}`, 'PATCH', { phone: '(21) 3333-4444' })).status, 200);
  assert.equal((await query('SELECT rg FROM customers WHERE id=$1', [created.data.id])).rows[0].rg, '98.765.432-1', 'fields not sent are kept');
});

test('a receivable can point to a registered customer and go back to a walk-in one', async () => {
  const customer = (await call('/customers', 'POST', { name: 'Cliente OS', phone: '21990000001' })).data;
  const bill = (await call('/finance/receivables', 'POST', { description: 'Conserto', customerId: customer.id, customerName: customer.name, category: 'Serviços OS', amount: 350, dueDate: '2026-10-20' })).data;
  assert.equal((await query('SELECT customer_id FROM receivables WHERE id=$1', [bill.id])).rows[0].customer_id, customer.id);
  assert.equal((await call(`/finance/receivables/${bill.id}`, 'PATCH', { customerId: '', customerName: 'Avulso' })).status, 200);
  assert.equal((await query('SELECT customer_id FROM receivables WHERE id=$1', [bill.id])).rows[0].customer_id, null);
});
