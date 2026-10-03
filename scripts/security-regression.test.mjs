import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { once } from 'node:events';
import { SignJWT } from 'jose';

// Isolated tests: no production credentials and no live database connections.
process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const auth = await import('../dist/services/authService.js');
const tokens = await import('../dist/services/tokenService.js');
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const user = { id: 'user-1', email: 'owner@example.com', name: 'Owner', provider: 'password', role: 'admin', clientAccountId: 'account-1' };
const row = { ...user, active: true, global_role: 'admin', client_account_id: 'account-1' };
let databaseUser = row;
let stockFailure = false;
pool.query = async (sql, values) => {
  if (sql.includes('FROM users WHERE id')) return { rows: databaseUser ? [databaseUser] : [], rowCount: databaseUser ? 1 : 0 };
  if (sql.includes('JOIN user_stores')) return { rows: values[2] && values[2] !== 'store-1' ? [] : [{ id: 'store-1' }], rowCount: 1 };
  if (sql.includes('FROM store_licenses')) return { rows: [{ plan_id: 'bronze' }], rowCount: 1 };
  if (sql.includes('FROM stock_items')) {
    if (stockFailure) throw new Error('ECONNREFUSED');
    return { rows: [], rowCount: 0 };
  }
  return { rows: [], rowCount: 0 };
};
const defaultQuery = pool.query;
async function request(path, token, init = {}) {
  const headers = { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(base + path, { ...init, headers });
}
after(async () => { server.close(); await once(server, 'close'); await pool.end(); });

test('missing token and all legacy token formats are rejected', async () => {
  for (const token of [null, 'demo', 'marthi-demo-token', 'marthi-staff-local:owner@example.com', 'marthi-client-token:account-1', 'marthi-employee-token:employee-1']) {
    assert.equal((await request('/api/v1/stock', token)).status, 401);
  }
});
test('unsigned and incorrectly signed administrator JWTs are rejected', async () => {
  const forged = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, email: user.email, role: 'superadmin' })).toString('base64url') + '.';
  assert.equal((await request('/api/v1/stock', forged)).status, 401);
  const signed = await new SignJWT({ email: user.email }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuer('marthi-api').setAudience('marthi-web').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode('incorrect-secret-'.repeat(4)));
  assert.equal((await request('/api/v1/stock', signed)).status, 401);
});
test('expired, wrong audience, and expiry-free JWTs are rejected', async () => {
  for (const kind of ['expired', 'audience', 'no-expiry']) {
    let jwt = new SignJWT({ email: user.email }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuer('marthi-api').setAudience(kind === 'audience' ? 'other' : 'marthi-web').setIssuedAt();
    if (kind !== 'no-expiry') jwt = jwt.setExpirationTime(kind === 'expired' ? 1 : '1h');
    const token = await jwt.sign(new TextEncoder().encode(process.env.JWT_SECRET));
    assert.equal((await request('/api/v1/stock', token)).status, 401);
  }
});
test('valid sessions work for their assigned store', async () => {
  const response = await request('/api/v1/stock', await auth.createSessionToken(user));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, []);
});
test('a signed role claim cannot elevate the database role', async () => {
  const token = await auth.createSessionToken({ ...user, role: 'superadmin' });
  assert.equal((await request('/api/v1/admin/clients/security-status?email=owner@example.com', token)).status, 403);
});
test('disabled and deleted users immediately lose access', async () => {
  const token = await auth.createSessionToken(user);
  for (const value of [{ ...row, active: false }, null]) {
    databaseUser = value;
    assert.equal((await request('/api/v1/stock', token)).status, 401);
  }
  databaseUser = row;
});
test('store headers cannot grant access to another tenant', async () => {
  assert.equal((await request('/api/v1/stock', await auth.createSessionToken(user), { headers: { 'x-store-id': 'other-store' } })).status, 403);
});
test('password reset and access changes invalidate previous session versions', async () => {
  const token = await auth.createSessionToken(user);
  databaseUser = { ...row, session_version: 1 };
  try { assert.equal((await request('/api/v1/stock', token)).status, 401); }
  finally { databaseUser = row; }
});
test('database failure cannot produce a successful stock response from memory', async () => {
  stockFailure = true;
  const response = await request('/api/v1/stock', await auth.createSessionToken(user));
  assert.ok(response.status >= 500);
  const json = await response.json();
  assert.equal(json.success, false);
  assert.ok(!json.error.message.includes('ECONNREFUSED'));
  stockFailure = false;
});
test('administrative payment and registration actions reject anonymous callers', async () => {
  for (const path of ['/api/v1/partners/payment-confirm', '/api/v1/auth/register', '/api/v1/auth/activate', '/api/v1/admin/clients/force-reset']) {
    assert.equal((await request(path, null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  }
});
test('dangerous public maintenance routes have been removed', async () => {
  for (const path of ['/health/migrate', '/health/cleanup-tests', '/health/db-status', '/health/email', '/api/v1/health/cleanup-tests']) {
    assert.equal((await request(path)).status, 404);
  }
});
test('legacy activation tokens and document-based guesses are invalid', async () => {
  for (const token of ['TK-DEMO-000191-anything', 'TK-DSR-000182-anything', 'account-1']) {
    assert.deepEqual(await tokens.inspectToken(token, 'activation'), { valid: false, reason: 'invalid' });
  }
});
test('password changes roll back token consumption when saving the password fails', async () => {
  const queries = [];
  const original = pool.connect;
  pool.connect = async () => ({
    query: async sql => {
      queries.push(sql);
      if (sql.includes('UPDATE auth_tokens')) return { rows: [{ email: user.email }], rowCount: 1 };
      if (sql.includes('UPDATE users')) throw new Error('database write failed');
      return { rows: [], rowCount: 0 };
    }, release() {},
  });
  try {
    await assert.rejects(auth.resetPasswordWithToken('a'.repeat(64), 'StrongPassword123!'));
    assert.ok(queries.includes('ROLLBACK'));
    assert.ok(!queries.includes('COMMIT'));
  } finally { pool.connect = original; }
});
test('passwords now use a salted slow hash', () => {
  const one = auth.hashPassword('StrongPassword123!', 'first-salt');
  const two = auth.hashPassword('StrongPassword123!', 'second-salt');
  assert.ok(one.startsWith('scrypt$'));
  assert.notEqual(one, two);
});
test('known exposed passwords do not authenticate', async () => {
  for (const password of ['123', 'Marthi170926']) {
    await assert.rejects(auth.loginWithPassword('marthi.tecnologia@gmail.com', password), error => error.status === 401);
  }
});
