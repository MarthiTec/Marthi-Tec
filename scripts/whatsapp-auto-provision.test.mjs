import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.EVOLUTION_BASE_URL = 'https://evolution.example.com';
process.env.EVOLUTION_MASTER_API_KEY = 'test-only-master-key';

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
const get = (path, store = 'store-a') => fetch(base + path, { headers: { authorization: 'Bearer ' + token, 'x-store-id': store } });

after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('first QR Code request auto-provisions a store-exclusive Evolution instance using only the master key', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), apikey: init?.headers?.apikey, method: init?.method || 'GET' });
    if (String(url).endsWith('/instance/create')) {
      assert.equal(init.headers.apikey, 'test-only-master-key');
      const body = JSON.parse(init.body);
      assert.equal(body.instanceName, 'loja-store-a');
      return new Response(JSON.stringify({ instance: { instanceName: body.instanceName, status: 'close' }, hash: 'issued-instance-token' }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).includes('/instance/connect/')) {
      assert.ok(String(url).includes('loja-store-a'));
      return new Response(JSON.stringify({ instance: { state: 'connecting' }, base64: 'fake-qr-base64' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return original(url, init);
  };
  try {
    const res = await get('/whatsapp/qrcode');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.data.base64, 'fake-qr-base64');

    const createCall = calls.find((c) => c.url.endsWith('/instance/create'));
    assert.ok(createCall, 'expected the backend to call /instance/create with the master key');

    const row = (await query('SELECT whatsapp_settings FROM stores WHERE id=$1', ['store-a'])).rows[0];
    assert.equal(row.whatsapp_settings.instance, 'loja-store-a');
    assert.equal(row.whatsapp_settings.enabled, true);
    // The per-store apiKey is never set to the master key — the server falls back to it at
    // call time, but it must never be persisted in the tenant's own row.
    assert.notEqual(row.whatsapp_settings.apiKey, 'test-only-master-key');
  } finally {
    globalThis.fetch = original;
  }
});

test('a store with an already-configured instance is never re-provisioned', async () => {
  await query(`UPDATE stores SET whatsapp_settings=$1::jsonb WHERE id='store-b'`, [JSON.stringify({ enabled: true, baseUrl: 'https://own-server.example.com', instance: 'cellponto-own', apiKey: 'tenant-own-key', storeNumber: '', notifyCustomer: false, locationLabel: '' })]);
  const tokenB = await auth.createSessionToken({ id: 'user-b', email: 'b@example.com', name: 'user-b', role: 'admin', clientAccountId: 'b' });
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('/instance/connect/')) {
      assert.equal(init.headers.apikey, 'tenant-own-key');
      assert.ok(String(url).startsWith('https://own-server.example.com'));
      return new Response(JSON.stringify({ instance: { state: 'connecting' }, base64: 'other-qr' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return original(url, init);
  };
  try {
    const res = await fetch(base + '/whatsapp/qrcode', { headers: { authorization: 'Bearer ' + tokenB, 'x-store-id': 'store-b' } });
    assert.equal(res.status, 200);
    assert.ok(!calls.some((u) => u.endsWith('/instance/create')), 'must not call /instance/create for an already-provisioned store');
  } finally {
    globalThis.fetch = original;
  }
});
