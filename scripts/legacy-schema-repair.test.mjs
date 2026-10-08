import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';

const db = new PGlite();
const migrations = fs.readdirSync('apps/api/src/db/migrations').filter((f) => f.endsWith('.sql')).sort();
for (const file of migrations) await db.exec(fs.readFileSync(`apps/api/src/db/migrations/${file}`, 'utf8'));

// Recria o formato do MarthiDB de produção (herdado do Prisma): colunas que nunca chegaram
// às tabelas antigas e campos obrigatórios sem valor padrão.
await db.exec(`
  ALTER TABLE customers DROP COLUMN trade_name, DROP COLUMN document_type, DROP COLUMN customer_group,
    DROP COLUMN credit_limit, DROP COLUMN notes, DROP COLUMN updated_at;
  ALTER TABLE customers RENAME COLUMN district TO neighborhood;
  ALTER TABLE sellers ALTER COLUMN updated_at DROP DEFAULT, ALTER COLUMN updated_at SET NOT NULL;
  ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
  UPDATE cash_sessions SET updated_at = now();
  ALTER TABLE cash_sessions ALTER COLUMN updated_at SET NOT NULL, ALTER COLUMN updated_at DROP DEFAULT;
  ALTER TABLE sales_orders ALTER COLUMN amount DROP DEFAULT, ALTER COLUMN payment DROP DEFAULT;
  ALTER TABLE work_orders DROP COLUMN device_brand, DROP COLUMN device_model, DROP COLUMN serial_or_imei,
    DROP COLUMN defect_description, DROP COLUMN technical_report, DROP COLUMN labor_cost,
    DROP COLUMN parts_cost, DROP COLUMN total_amount;
`);
await db.exec(fs.readFileSync('apps/api/src/db/migrations/0058_repair_legacy_prisma_columns.sql', 'utf8'));

const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const { createSessionToken } = await import('../dist/services/authService.js');
const query = async (sql, args = []) => {
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });

await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','Test')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-a','a','Loja','Loja','1')`);
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Admin','admin',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin')`);
const token = await createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Admin', role: 'admin', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, json: await response.json() };
}
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('customers can be created and edited on the legacy production table', async () => {
  const created = await request('/customers', 'POST', { name: 'RAMON FREITAS', phone: '24992259927', document: '15350830775', email: 'cliente@example.com', city: 'PARAIBA DO SUL' });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const edited = await request('/customers/' + created.json.data.id, 'PATCH', { notes: 'Cliente da loja', district: 'Centro' });
  assert.equal(edited.status, 200, JSON.stringify(edited.json));
});

test('sellers save even though the legacy updated_at had no default', async () => {
  const seller = await request('/sellers', 'POST', { name: 'Mariana', phone: '24981231868' });
  assert.equal(seller.status, 201, JSON.stringify(seller.json));
});

test('external sale fills the legacy amount/payment columns from the current ones', async () => {
  const methods = (await request('/pickup-methods')).json.data;
  const immediate = methods.find((m) => m.kind === 'immediate');
  const stock = (await request('/stock', 'POST', { name: 'IPHONE 16', kind: 'device', qty: 2, price: 4650 })).json.data;
  const sale = await request('/sales/external', 'POST', { lines: [{ stockId: stock.id, name: 'IPHONE 16', qty: 1, unitPrice: 4650, pickupMethodId: immediate.id }], paymentMethod: 'Pix' });
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  const row = (await query('SELECT amount, payment, final_amount FROM sales_orders WHERE id=$1', [sale.json.data.id])).rows[0];
  assert.equal(Number(row.amount), Number(row.final_amount));
  assert.ok(row.payment, 'payment copied from payment_name');
});

test('external sales can be listed, searched and are scoped to the store', async () => {
  const methods = (await request('/pickup-methods')).json.data;
  const immediate = methods.find((m) => m.kind === 'immediate');
  const stock = (await request('/stock', 'POST', { name: 'CAPINHA', kind: 'part', qty: 5, price: 50 })).json.data;
  const sale = await request('/sales/external', 'POST', { customerName: 'Ana Paula', customerPhone: '24999990000', lines: [{ stockId: stock.id, name: 'CAPINHA', qty: 2, unitPrice: 50, pickupMethodId: immediate.id }], paymentMethod: 'Cartão de Crédito', installments: 18 });
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  const list = await request('/sales/external');
  assert.equal(list.status, 200, JSON.stringify(list.json));
  const row = list.json.data.find((item) => item.id === sale.json.data.id);
  assert.ok(row, 'new sale is listed');
  assert.match(row.items, /2x CAPINHA/);
  assert.match(row.payment, /18x/);
  assert.equal((await request('/sales/external?search=ana')).json.data.some((item) => item.id === row.id), true);
  assert.equal((await request('/sales/external?search=99990000')).json.data.some((item) => item.id === row.id), true);
  assert.equal((await request('/sales/external?search=ninguem')).json.data.length, 0);
  const receipt = await request(`/sales/${row.id}/receipt`);
  assert.equal(receipt.status, 200, 'receipt available for reprint');
});
