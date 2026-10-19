import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
const db = new PGlite();
for (const file of fs.readdirSync('apps/api/src/db/migrations').filter((x) => x.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync('apps/api/src/db/migrations/' + file, 'utf8'));
}
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const auth = await import('../dist/services/authService.js');
const query = async (sql, args = []) => {
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });

await query(
  `INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name)
   VALUES('acc','Loja','Loja','00','a@example.com','','Test')`,
);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-a','acc','Loja A','Loja A','00')`);
await query(
  `INSERT INTO users(id,client_account_id,email,name,global_role,active)
   VALUES('user-a','acc','a@example.com','Admin','admin',true)`,
);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('us-a','user-a','store-a','admin')`);
await query(
  `INSERT INTO stock_items(id,store_id,name,sku,barcode,qty,min_qty,cost,price,kind,condition,active)
   VALUES('stk-1','store-a','iPhone 15','SKU-15','789123',5,2,1000,2500,'device','new',true)`,
);

const token = await auth.createSessionToken({
  id: 'user-a',
  email: 'a@example.com',
  name: 'Admin',
  role: 'admin',
  clientAccountId: 'acc',
  picture: null,
  provider: 'password',
});

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path, method = 'GET', body) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      authorization: 'Bearer ' + token,
      'x-store-id': 'store-a',
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};

after(async () => {
  server.close();
  await once(server, 'close');
  await pool.end();
  await db.close();
});

test('GET /stock/:id returns product', async () => {
  const res = await call('/stock/stk-1');
  assert.equal(res.status, 200);
  assert.equal(res.data.id, 'stk-1');
  assert.equal(res.data.qty, 5);
});

test('POST /stock/:id/adjust updates qty with reason in kardex', async () => {
  const res = await call('/stock/stk-1/adjust', 'POST', { qty: 8, reason: 'Contagem física balcão' });
  assert.equal(res.status, 200);
  assert.equal(res.data.newQty, 8);
  assert.equal(res.data.previousQty, 5);
  assert.equal(res.data.delta, 3);
  const moves = await call('/stock/stk-1/movements?limit=5');
  assert.equal(moves.status, 200);
  assert.ok(moves.data.some((m) => m.notes === 'Contagem física balcão'));
});

test('POST /stock/:id/price-change audits before/after', async () => {
  const res = await call('/stock/stk-1/price-change', 'POST', {
    price: 2799,
    cost: 1100,
    reason: 'Reajuste fornecedor',
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.before.price, 2500);
  assert.equal(res.data.after.price, 2799);
  assert.equal(res.data.after.cost, 1100);
  assert.ok(res.data.auditId);
  const audits = await query(`SELECT action, details FROM audit_logs WHERE id = $1`, [res.data.auditId]);
  assert.equal(audits.rows[0].action, 'stock.price_change');
  const details = typeof audits.rows[0].details === 'string' ? JSON.parse(audits.rows[0].details) : audits.rows[0].details;
  assert.equal(details.before.price, 2500);
  assert.equal(details.after.price, 2799);
});

test('lookup finds by barcode', async () => {
  const res = await call('/stock/lookup?code=789123');
  assert.equal(res.status, 200);
  assert.equal(res.data?.id, 'stk-1');
});

test('list with low filter', async () => {
  await call('/stock/stk-1/adjust', 'POST', { qty: 1, reason: 'Baixa para teste de alerta' });
  const res = await call('/stock?low=1');
  assert.equal(res.status, 200);
  assert.ok(res.data.some((item) => item.id === 'stk-1'));
});
