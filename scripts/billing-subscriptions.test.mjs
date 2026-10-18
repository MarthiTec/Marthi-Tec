import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'billing-test-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.BILLING_PROVIDER = 'manual';
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

const db = new PGlite();
for (const file of fs.readdirSync('apps/api/src/db/migrations').filter((x) => x.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(`apps/api/src/db/migrations/${file}`, 'utf8'));
}

const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const auth = await import('../dist/services/authService.js');
const { getBillingProviderStatus } = await import('../dist/services/billingProvider.js');

const query = async (sql, args = []) => {
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });

await query(
  "INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('platform','Platform','Platform','plat','platform@example.com','','Owner')",
);
await query(
  "INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name,status) VALUES('cell','Cell Ponto','Cell Ponto','cell','cell@example.com','','Owner','active')",
);
await query(
  "INSERT INTO stores(id,client_account_id,trade_name,legal_name,document,active,is_matrix) VALUES('store-cell','cell','Cell Ponto','Cell Ponto','cell',true,true)",
);
await query(
  "INSERT INTO store_licenses(id,store_id,client_account_id,plan_id,modules,final_price,billing_cycle,status) VALUES('lic-cell','store-cell','cell','golden',ARRAY['totem','os','erp'],597,'monthly','active')",
);
await query(
  "INSERT INTO users(id,client_account_id,email,name,global_role,active,password_hash) VALUES('user-platform','platform','platform@example.com','Platform','superadmin',true,'salt:hash')",
);
await query(
  "INSERT INTO users(id,client_account_id,email,name,global_role,active,password_hash) VALUES('user-cell','cell','cell@example.com','Cell','admin',true,'salt:hash')",
);
await query(
  "INSERT INTO user_stores(id,user_id,store_id,role,is_default) VALUES('us-cell','user-cell','store-cell','admin',true)",
);

const admin = await auth.createSessionToken({
  id: 'user-platform',
  email: 'platform@example.com',
  name: 'Platform',
  role: 'superadmin',
  clientAccountId: 'platform',
});
const storeUser = await auth.createSessionToken({
  id: 'user-cell',
  email: 'cell@example.com',
  name: 'Cell',
  role: 'admin',
  clientAccountId: 'cell',
});

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;

test('provider status reports manual gates without leaking secrets', () => {
  const status = getBillingProviderStatus();
  assert.equal(status.activeProvider, 'manual');
  assert.equal(status.stripe.configured, false);
  assert.ok(status.gates.length >= 1);
  assert.ok(!JSON.stringify(status).includes('sk_'));
});

test('admin list syncs subscription from store_licenses', async () => {
  const response = await fetch(`${base}/admin/subscriptions`, {
    headers: { authorization: `Bearer ${admin}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  const cell = body.data.subscriptions.find((item) => item.clientAccountId === 'cell');
  assert.ok(cell);
  assert.equal(cell.planId, 'golden');
  assert.equal(cell.amount, 597);
  assert.equal(cell.tradeName, 'Cell Ponto');
});

test('portal is gated without STRIPE_SECRET_KEY', async () => {
  const response = await fetch(`${base}/admin/subscriptions/cell/portal`, {
    method: 'POST',
    headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
});

test('store user can read own billing subscription', async () => {
  const response = await fetch(`${base}/billing/subscription`, {
    headers: { authorization: `Bearer ${storeUser}`, 'x-store-id': 'store-cell' },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.subscription.clientAccountId, 'cell');
});

test('manual paid invoice persists in MarthiDB', async () => {
  const response = await fetch(`${base}/admin/billing/invoices`, {
    method: 'POST',
    headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      clientAccountId: 'cell',
      amount: 597,
      status: 'paid',
      paymentMethod: 'pix',
      transactionRef: 'pix-ref-1',
    }),
  });
  assert.equal(response.status, 201);
  const listed = await fetch(`${base}/admin/billing/invoices?clientId=cell`, {
    headers: { authorization: `Bearer ${admin}` },
  });
  const body = await listed.json();
  assert.equal(body.data.some((item) => item.transactionRef === 'pix-ref-1'), true);
});

test('stripe webhook without secret returns gate', async () => {
  const response = await fetch(`${base}/billing/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
    body: JSON.stringify({ id: 'evt_test', type: 'invoice.paid' }),
  });
  assert.equal(response.status, 503);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});
