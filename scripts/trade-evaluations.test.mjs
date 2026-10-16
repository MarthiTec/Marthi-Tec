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


test('the seller asks, the workshop evaluates at no cost, and the seller approves the suggested price by IMEI', async () => {
  const created = await call('/trade-evaluations', 'POST', { customerName: 'Joana Lima', deviceName: 'IPHONE 13 128GB', imei: ' 3561 2345 6789 012 ', notes: 'cliente diz que a tela foi trocada' });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  assert.equal(created.data.status, 'pending');
  assert.equal(created.data.imei, '356123456789012');
  const again = await call('/trade-evaluations', 'POST', { customerName: 'Joana Lima', deviceName: 'IPHONE 13', imei: '356123456789012' });
  assert.equal(again.status, 409, 'one open evaluation per IMEI');

  const board = (await call('/trade-evaluations')).data;
  assert.deepEqual(board.map((item) => [item.customerName, item.imei, item.status]), [['Joana Lima', '356123456789012', 'pending']]);
  const early = await call(`/trade-evaluations/${created.data.id}/approve`, 'POST', {});
  assert.equal(early.status, 409, 'nothing to approve before the workshop evaluates');

  const evaluated = await call(`/trade-evaluations/${created.data.id}/evaluate`, 'POST', { batteryLevel: 84, opened: true, cracked: false, notes: 'tela paralela', suggestedPrice: 1450 });
  assert.equal(evaluated.status, 200, JSON.stringify(evaluated.error));
  const byImei = (await call('/trade-evaluations/by-imei/356123456789012')).data;
  assert.deepEqual([byImei.status, byImei.batteryLevel, byImei.opened, byImei.cracked, byImei.suggestedPrice], ['evaluated', 84, true, false, 1450]);

  const approved = await call(`/trade-evaluations/${created.data.id}/approve`, 'POST', {});
  assert.deepEqual([approved.data.status, approved.data.approvedPrice], ['approved', 1450]);
  assert.equal((await call(`/trade-evaluations/${created.data.id}/evaluate`, 'POST', { batteryLevel: 80, opened: false, cracked: false, suggestedPrice: 1 })).status, 409);
  assert.equal((await call('/trade-evaluations')).data.length, 0, 'decided evaluations leave the board');
  const money = await query("SELECT (SELECT count(*) FROM work_orders) + (SELECT count(*) FROM finance_entries) AS n");
  assert.equal(Number(money.rows[0].n), 0, 'no work order and no finance entry for the customer');
});

test('rejecting, cancelling and store isolation', async () => {
  const one = (await call('/trade-evaluations', 'POST', { customerName: 'Rui', deviceName: 'GALAXY S22', imei: '351000000000001' })).data;
  await call(`/trade-evaluations/${one.id}/evaluate`, 'POST', { batteryLevel: null, opened: false, cracked: true, notes: 'traseira trincada', suggestedPrice: 600 });
  const rejected = await call(`/trade-evaluations/${one.id}/reject`, 'POST', { notes: 'cliente queria 900' });
  assert.deepEqual([rejected.data.status, rejected.data.approvedPrice, rejected.data.decisionNotes], ['rejected', null, 'cliente queria 900']);

  const two = (await call('/trade-evaluations', 'POST', { customerName: 'Ana', deviceName: 'MOTO G54', imei: '351000000000002' })).data;
  assert.equal((await call(`/trade-evaluations/${two.id}/cancel`, 'POST')).data.status, 'canceled');
  assert.equal((await call('/trade-evaluations/by-imei/351000000000002')).data, null, 'a cancelled request does not count as evaluated');
  assert.equal((await call('/trade-evaluations', 'POST', { customerName: 'Ana', deviceName: 'MOTO G54', imei: '351000000000002' })).status, 201, 'it can be asked again');

  await query("INSERT INTO trade_evaluations(id,store_id,customer_name,device_name,imei) VALUES('TEV-b','store-b','Outro','IPHONE 11','359999999999999')");
  assert.equal((await call('/trade-evaluations/by-imei/359999999999999')).data, null);
  assert.equal((await call('/trade-evaluations/TEV-b/evaluate', 'POST', { batteryLevel: 90, opened: false, cracked: false, suggestedPrice: 900 })).status, 404);
  assert.equal((await call('/trade-evaluations?status=all')).data.some((item) => item.id === 'TEV-b'), false);
});
