import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';

const db = new PGlite();
for (const file of fs.readdirSync('apps/api/src/db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(`apps/api/src/db/migrations/${file}`, 'utf8'));
}
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const { createSessionToken } = await import('../dist/services/authService.js');
const query = async (sql, args = []) => {
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });

await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('acc','Loja','Loja','1','dono@loja.com','','Dono')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store','acc','Loja','Loja','1')`);
const people = [
  // [id, email, role, areas, permissions]
  ['owner', 'dono@loja.com', 'admin', null, null],
  ['cashier', 'caixa@loja.com', 'operator', ['pdv'], { canEdit: true, canDelete: false }],
  ['stocker', 'estoque@loja.com', 'operator', ['erp_stock', 'erp_attrs'], { canEdit: true, canDelete: true }],
  ['backoffice', 'retaguarda@loja.com', 'operator', ['erp'], { canEdit: false, canDelete: false }],
  ['seller', 'vendedor@loja.com', 'seller', ['pdv', 'erp_customers'], {}],
  ['manager', 'gerente@loja.com', 'manager', [], {}],
  ['inactive', 'saiu@loja.com', 'operator', ['erp'], { canEdit: true, canDelete: true }],
];
const tokens = {};
for (const [id, email, role, areas, permissions] of people) {
  await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES($1,'acc',$2,$1,$3,true)`, [id, email, role === 'admin' ? 'admin' : 'operator']);
  await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES($1,$2,'store',$3)`, ['m-' + id, id, role]);
  if (areas) {
    await query(
      `INSERT INTO employees(id,store_id,name,role,is_system_user,user_email,access_areas,permissions,active) VALUES($1,'store',$1,$2,true,$3,$4,$5,$6)`,
      ['EMP-' + id, role, email, JSON.stringify(areas), JSON.stringify(permissions), id !== 'inactive'],
    );
  }
  tokens[id] = await createSessionToken({ id, email, name: id, role: role === 'admin' ? 'admin' : 'operator', clientAccountId: 'acc' });
}
await query(`INSERT INTO customers(id,store_id,name,phone,phone_digits) VALUES('CUS-1','store','Cliente 1','24999990011','24999990011'),('CUS-2','store','Cliente 2','24999990012','24999990012')`);
await query(`INSERT INTO suppliers(id,store_id,name) VALUES('SUP-1','store','Fornecedor 1')`);

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
async function as(who, path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + tokens[who], 'x-store-id': 'store', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('owner, administrator and manager are never blocked', async () => {
  for (const who of ['owner', 'manager']) {
    assert.equal((await as(who, '/suppliers', 'POST', { name: 'Novo ' + who })).status, 201, who);
    assert.equal((await as(who, '/finance/entries')).status === 403, false, who + ' reads finance');
  }
});

test('a screen released to the employee works; a screen not released is blocked in the API', async () => {
  // Caixa (só PDV): pode cadastrar cliente na venda, mas não fornecedor, produto ou financeiro.
  assert.equal((await as('cashier', '/customers', 'POST', { name: 'Cliente da venda', phone: '24999990001' })).status, 201);
  const supplier = await as('cashier', '/suppliers', 'POST', { name: 'Fornecedor X' });
  assert.equal(supplier.status, 403);
  assert.equal(supplier.json.error.code, 'AREA_FORBIDDEN');
  assert.match(supplier.json.error.message, /Fornecedores/);
  assert.equal((await as('cashier', '/stock', 'POST', { name: 'Produto', qty: 0, cost: 0, price: 1 })).status, 403);
  assert.equal((await as('cashier', '/finance/entries')).status, 403, 'financial data is closed even for reading');
  assert.equal((await as('cashier', '/stock')).status, 200, 'products can still be read to sell');
  // Estoque: produtos e atributos sim, clientes não.
  assert.equal((await as('stocker', '/stock', 'POST', { name: 'Capinha', qty: 1, cost: 1, price: 2 })).status, 201);
  assert.equal((await as('stocker', '/attributes', 'POST', { name: 'Cor', values: ['Azul'] })).status === 403, false);
  assert.equal((await as('stocker', '/customers', 'POST', { name: 'Não pode', phone: '24999990002' })).status, 403);
  // Telas que antes eram só da gerência agora seguem o que foi liberado.
  assert.equal((await as('stocker', '/brands', 'POST', { name: 'Marca do estoquista' })).status, 201);
  const method = await as('stocker', '/pickup-methods', 'POST', { name: 'Retirada do estoquista', kind: 'immediate', active: true });
  assert.equal(method.status === 403, false, JSON.stringify(method.json));
  assert.equal((await as('cashier', '/brands', 'POST', { name: 'Marca do caixa' })).status, 403);
  assert.equal((await as('cashier', '/pickup-methods', 'POST', { name: 'Retirada do caixa', kind: 'immediate', active: true })).status, 403);
  // "Retaguarda (ERP)" libera todas as telas da Retaguarda.
  assert.equal((await as('backoffice', '/suppliers', 'POST', { name: 'Fornecedor da retaguarda' })).status, 201);
  // Funcionário desativado não grava em nada.
  assert.equal((await as('inactive', '/suppliers', 'POST', { name: 'Saiu da loja' })).status, 403);
});

test('edit and delete follow "pode editar" and "pode excluir"', async () => {
  const noDelete = await as('cashier', '/customers/CUS-1', 'DELETE');
  assert.equal(noDelete.status, 403);
  assert.equal(noDelete.json.error.code, 'DELETE_FORBIDDEN');
  assert.ok((await query(`SELECT 1 FROM customers WHERE id='CUS-1'`)).rows.length, 'customer still there');
  assert.equal((await as('cashier', '/customers/CUS-1', 'PATCH', { notes: 'ok' })).status, 200, 'operator edits by default');
  const backofficeEdit = await as('backoffice', '/suppliers/SUP-1', 'PATCH', { notes: 'x' });
  assert.equal(backofficeEdit.status, 403);
  assert.equal(backofficeEdit.json.error.code, 'EDIT_FORBIDDEN');
  assert.equal((await as('seller', '/customers/CUS-2', 'PATCH', { notes: 'x' })).status, 403, 'seller only edits when allowed');
  const allowedDelete = await as('stocker', '/stock/' + (await query(`SELECT id FROM stock_items WHERE name='Capinha'`)).rows[0].id, 'DELETE');
  assert.equal(allowedDelete.status, 200, JSON.stringify(allowedDelete.json));
  assert.equal((await as('owner', '/customers/CUS-2', 'DELETE')).status, 200);
});

test('saving permissions in Pessoas › Permissões changes access right away', async () => {
  assert.equal((await as('cashier', '/suppliers', 'POST', { name: 'Antes' })).status, 403);
  const saved = await as('owner', '/employees/EMP-cashier', 'PATCH', { accessAreas: ['pdv', 'erp_suppliers'], permissions: { canEdit: true, canDelete: true } });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  const row = (await query(`SELECT access_areas, permissions FROM employees WHERE id='EMP-cashier'`)).rows[0];
  assert.deepEqual(row.access_areas, ['pdv', 'erp_suppliers']);
  assert.equal(row.permissions.canDelete, true);
  assert.equal((await as('cashier', '/suppliers', 'POST', { name: 'Depois' })).status, 201);
  assert.equal((await as('cashier', '/customers/CUS-1', 'DELETE')).status, 200);
  assert.equal((await as('cashier', '/employees/EMP-cashier', 'PATCH', { accessAreas: ['erp'] })).status, 403, 'nobody grants himself more access');
});
