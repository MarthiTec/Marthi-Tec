/**
 * Regression: Google OAuth / account owners with user_stores but no employees row
 * must appear in GET /api/v1/employees (Usuários & Permissões da Loja).
 */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'usuarios-list-test-secret-'.repeat(2);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';

const db = new PGlite();
for (const file of fs.readdirSync('apps/api/src/db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(`apps/api/src/db/migrations/${file}`, 'utf8'));
}

const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const { createSessionToken } = await import('../dist/services/authService.js');
const ownerTeamSrc = fs.readFileSync('apps/api/src/services/ownerTeam.ts', 'utf8');
const registrySrc = fs.readFileSync('apps/api/src/routes/registry.ts', 'utf8');

const query = async (sql, args = []) => {
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });

await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name)
  VALUES('ACC-CELL','Cell Ponto','Cell Ponto','38297104000182','marianaveigatav@gmail.com','','Mariana Marçal')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document,is_matrix,active)
  VALUES('STR-CELL-PONTO','ACC-CELL','Cell Ponto - Matriz','Cell Ponto','38297104000182',true,true)`);
await query(`INSERT INTO store_licenses(id,store_id,client_account_id,plan_id,modules,status,final_price)
  VALUES('LIC-CELL','STR-CELL-PONTO','ACC-CELL','golden',ARRAY['totem','os','erp','fiscal'],'active',0)`);

// Google OAuth owner: null store_id on users, no password, no employees row yet.
await query(
  `INSERT INTO users(id,client_account_id,store_id,email,name,provider,password_hash,global_role,active)
   VALUES('usr-mariana','ACC-CELL',NULL,'marianaveigatav@gmail.com','Mariana Marçal','google',NULL,'admin',true)`,
);
await query(
  `INSERT INTO user_stores(id,user_id,store_id,role,is_default)
   VALUES('ust-mariana','usr-mariana','STR-CELL-PONTO','admin',true)`,
);

// Password operators already on the team list (like screenshot).
await query(
  `INSERT INTO users(id,client_account_id,email,name,provider,password_hash,global_role,active)
   VALUES('usr-gilvan','ACC-CELL','gilvanteodo@gmail.com','Gilvan Teodoro','password','salt:hash','admin',true)`,
);
await query(
  `INSERT INTO user_stores(id,user_id,store_id,role,is_default)
   VALUES('ust-gilvan','usr-gilvan','STR-CELL-PONTO','admin',false)`,
);
await query(
  `INSERT INTO employees(id,store_id,name,role,is_system_user,user_email,email,access_areas,active)
   VALUES('EMP-gilvan','STR-CELL-PONTO','Gilvan Teodoro','admin',true,'gilvanteodo@gmail.com','gilvanteodo@gmail.com',
          '["painel","pdv","erp","os","fiscal","totem","ecommerce"]'::jsonb,true)`,
);
await query(
  `INSERT INTO users(id,client_account_id,email,name,provider,password_hash,global_role,active)
   VALUES('usr-loja','ACC-CELL','cellponto.parts@gmail.com','Cell Ponto - Loja','password','salt:hash','operator',true)`,
);
await query(
  `INSERT INTO user_stores(id,user_id,store_id,role,is_default)
   VALUES('ust-loja','usr-loja','STR-CELL-PONTO','manager',false)`,
);
await query(
  `INSERT INTO employees(id,store_id,name,role,is_system_user,user_email,email,access_areas,active)
   VALUES('EMP-loja','STR-CELL-PONTO','Cell Ponto - Loja','manager',true,'cellponto.parts@gmail.com','cellponto.parts@gmail.com',
          '["pdv","os","erp"]'::jsonb,true)`,
);

assert.equal(
  (await query(`SELECT count(*)::int n FROM employees WHERE store_id='STR-CELL-PONTO'`)).rows[0].n,
  2,
  'precondition: Mariana has no employees row yet',
);

const token = await createSessionToken({
  id: 'usr-mariana',
  email: 'marianaveigatav@gmail.com',
  name: 'Mariana Marçal',
  picture: null,
  role: 'admin',
  provider: 'google',
  clientAccountId: 'ACC-CELL',
});

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;

after(async () => {
  server.close();
  await once(server, 'close');
  await pool.end();
  await db.close();
});

test('ownerTeam no longer uses fragile jsonb_populate_record cast', () => {
  assert.doesNotMatch(ownerTeamSrc, /jsonb_populate_record/);
  assert.match(ownerTeamSrc, /ensureStoreLoginTeamMembers/);
  assert.match(ownerTeamSrc, /provider \(google vs password\)/);
});

test('employees list route self-heals login memberships', () => {
  assert.match(registrySrc, /ensureStoreLoginTeamMembers/);
});

test('GET /employees includes Google OAuth admin with null users.store_id', async () => {
  const response = await fetch(`${base}/employees`, {
    headers: { authorization: `Bearer ${token}`, 'x-store-id': 'STR-CELL-PONTO' },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  const emails = body.data.map((row) => String(row.userEmail || row.email).toLowerCase()).sort();
  assert.deepEqual(emails, [
    'cellponto.parts@gmail.com',
    'gilvanteodo@gmail.com',
    'marianaveigatav@gmail.com',
  ]);
  const mariana = body.data.find((row) => /mariana/i.test(row.name));
  assert.ok(mariana);
  assert.equal(mariana.role, 'admin');
  assert.equal(mariana.isSystemUser, true);
  assert.equal(mariana.active, true);
  assert.ok(Array.isArray(mariana.accessAreas) && mariana.accessAreas.includes('painel'));
});

test('list remains idempotent and does not duplicate Mariana', async () => {
  const response = await fetch(`${base}/employees`, {
    headers: { authorization: `Bearer ${token}`, 'x-store-id': 'STR-CELL-PONTO' },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const marianaRows = body.data.filter((row) => /marianaveigatav@gmail.com/i.test(row.userEmail || row.email));
  assert.equal(marianaRows.length, 1);
});
