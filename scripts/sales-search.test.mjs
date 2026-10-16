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
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Dona','admin',true),('user-op','a','op@example.com','Caixa','operator',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin'),('m-op','user-op','store-a','operator')`);
await query(`INSERT INTO employees(id,store_id,name,role,is_system_user,user_email,access_areas,permissions,active) VALUES('emp-op','store-a','Caixa','operator',true,'op@example.com','["pdv"]','{}',true)`);
await query(`INSERT INTO sellers(id,store_id,name) VALUES('sel-mari','store-a','Mariana'),('sel-jo','store-a','Joana')`);
const admin = await auth.createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Dona', role: 'admin', clientAccountId: 'a' });
const operator = await auth.createSessionToken({ id: 'user-op', email: 'op@example.com', name: 'Caixa', role: 'operator', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const search = async (params, token = admin) => {
  const res = await fetch(`${base}/sales/search?${new URLSearchParams(params)}`, { headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a' } });
  const json = await res.json();
  assert.equal(res.status, 200, JSON.stringify(json));
  return json.data;
};
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

const sale = async (id, type, at, customer, seller, imei, status = 'completed', phone = '') => {
  await query(
    `INSERT INTO sales_orders(id,store_id,sale_type,customer_name,customer_phone,seller_id,seller_name,status,total_amount,final_amount,created_at)
     VALUES($1,'store-a',$2,$3,$4,$5,$6,$7,1000,1000,$8)`,
    [id, type, customer, phone, seller, seller === 'sel-mari' ? 'Mariana' : 'Joana', status, at],
  );
  await query(`INSERT INTO sales_order_lines(id,sale_id,order_id,name,qty,unit_price,total_price,imei) VALUES($1,$2,$2,'IPHONE 16',1,1000,1000,$3)`, ['l-' + id, id, imei]);
};
await sale('PED-1', 'pos', '2026-10-10T15:00:00Z', 'Maria Silva', 'sel-mari', '354257902015674', 'completed', '(21) 99876-5432');
await sale('PED-2', 'pos', '2026-10-13T15:00:00Z', 'Carlos', 'sel-jo', '355628869135672', 'cancelled');
await sale('VND-3', 'external', '2026-10-14T15:00:00Z', 'Maria Souza', 'sel-mari', '351240613565891');

test('sales are searched in the database by IMEI while typing, customer (name or phone), seller, period and status', async () => {
  assert.deepEqual((await search({ imei: '354' })).items.map((s) => s.id), ['PED-1']);
  assert.deepEqual((await search({ imei: '3542579' })).items.map((s) => s.id), ['PED-1']);
  assert.deepEqual((await search({ imei: '35' })).items.length, 3, 'under 3 digits the IMEI filter is ignored');
  assert.deepEqual((await search({ customer: 'maria' })).items.map((s) => s.id), ['VND-3', 'PED-1']);
  assert.deepEqual((await search({ customer: '99876' })).items.map((s) => s.id), ['PED-1']);
  assert.deepEqual((await search({ sellerId: 'sel-jo' })).items.map((s) => s.id), ['PED-2']);
  assert.deepEqual((await search({ status: 'cancelled' })).items.map((s) => s.id), ['PED-2']);
  assert.deepEqual((await search({ from: '2026-10-12T00:00:00-03:00', to: '2026-10-13T23:59:59-03:00' })).items.map((s) => s.id), ['PED-2']);
  const [found] = (await search({ q: 'iphone 16', imei: '351240' })).items;
  assert.deepEqual([found.id, found.type, found.sessionId, found.imeis], ['VND-3', 'external', 'external', ['351240613565891']]);
});

test('the external sale register is separate: the PDV operator only sees it with the permission', async () => {
  const hidden = await search({}, operator);
  assert.equal(hidden.canSeeExternal, false);
  assert.deepEqual(hidden.items.map((s) => s.id), ['PED-2', 'PED-1']);
  assert.deepEqual((await search({ session: 'external' }, operator)).items.map((s) => s.type), ['pos', 'pos']);
  await query(`UPDATE employees SET permissions='{"viewExternalSales":true}' WHERE id='emp-op'`);
  const shown = await search({ session: 'external' }, operator);
  assert.equal(shown.canSeeExternal, true);
  assert.deepEqual(shown.items.map((s) => s.id), ['VND-3']);
  assert.deepEqual((await search({ type: 'pos' })).items.map((s) => s.id), ['PED-2', 'PED-1']);
});

test('a PDV sale is corrected in the database (customer, document, date) with history; external and cancelled sales are not', async () => {
  const patch = async (id, body, token = admin) => {
    const res = await fetch(`${base}/pos/sales/${id}`, { method: 'PATCH', headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  const ok = await patch('PED-1', { customerName: 'Maria da Silva', customerDocument: '529.982.247-25', saleAt: '2026-10-10T10:30:00-03:00', reason: 'Nome completo da cliente' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const row = (await query('SELECT customer_name, customer_document, created_at FROM sales_orders WHERE id=$1', ['PED-1'])).rows[0];
  assert.deepEqual([row.customer_name, row.customer_document, new Date(row.created_at).toISOString()], ['Maria da Silva', '529.982.247-25', '2026-10-10T13:30:00.000Z']);
  assert.equal((await query("SELECT count(*)::int n FROM sale_revisions WHERE sale_id='PED-1'")).rows[0].n, 1);
  assert.equal((await patch('PED-1', { customerName: 'X', reason: 'a' })).status, 400, 'reason is required');
  assert.equal((await patch('VND-3', { customerName: 'X', reason: 'teste' })).status, 409);
  assert.equal((await patch('PED-2', { customerName: 'X', reason: 'teste' })).status, 409);
  assert.equal((await patch('PED-1', { customerName: 'X', reason: 'teste' }, operator)).status, 403, 'operator without "pode editar"');
});
