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
await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','Test'),('b','b','b','b','b','','Outra')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-a','a','Loja','Loja','1'),('store-b','b','Outra','Outra','2')`);
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Gestora','admin',true),('user-b','b','b@example.com','Outra','admin',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin'),('m-b','user-b','store-b','admin')`);
const admin = await auth.createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Gestora', role: 'admin', clientAccountId: 'a' });
const other = await auth.createSessionToken({ id: 'user-b', email: 'b@example.com', name: 'Outra', role: 'admin', clientAccountId: 'b' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path, method = 'GET', body, token = admin, store = 'store-a') => {
  const res = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': store, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });


// Tipo e modelo da plataforma (valem para todas as lojas).
await query(`INSERT INTO catalog_types (id, store_id, brand_slug, name, sort) VALUES ('CT-plat', NULL, 'samsung', 'LINHA TESTE', 1)`);
await query(`INSERT INTO catalog_models (id, store_id, type_id, name, sort) VALUES ('CM-plat', NULL, 'CT-plat', 'MODELO X1', 1), ('CM-plat2', NULL, 'CT-plat', 'MODELO X2', 2)`);

test('tipos e modelos: alterar o da plataforma vale só para a loja; o da loja muda direto', async () => {
  const renamed = await call('/catalog/types/CT-plat', 'PATCH', { name: 'Linha Galaxy A' });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.error));
  assert.deepEqual([renamed.data.name, renamed.data.originalName, renamed.data.own], ['LINHA GALAXY A', 'LINHA TESTE', false]);
  assert.equal((await call('/catalog/types?brand=samsung')).data.find((t) => t.id === 'CT-plat').name, 'LINHA GALAXY A');
  assert.equal((await call('/catalog/types?brand=samsung', 'GET', undefined, other, 'store-b')).data.find((t) => t.id === 'CT-plat').name, 'LINHA TESTE', 'outra loja não vê a mudança');

  // Ocultar modelo da plataforma: some dos cadastros da loja, continua na lista completa como inativo.
  const hidden = await call('/catalog/models/CM-plat2', 'PATCH', { active: false });
  assert.equal(hidden.data.active, false);
  assert.ok(!(await call('/catalog/models?typeId=CT-plat')).data.some((m) => m.id === 'CM-plat2'));
  assert.equal((await call('/catalog/models?typeId=CT-plat&all=1')).data.find((m) => m.id === 'CM-plat2').active, false);
  assert.ok((await call('/catalog/models?typeId=CT-plat', 'GET', undefined, other, 'store-b')).data.some((m) => m.id === 'CM-plat2'), 'outra loja continua vendo');
  // Renomear de volta para o nome original remove a sobreposição do nome.
  const back = await call('/catalog/types/CT-plat', 'PATCH', { name: 'linha teste' });
  assert.equal(back.data.name, 'LINHA TESTE');

  // Da loja: muda direto (nome, marca, tipo do modelo).
  const ownType = (await call('/catalog/types', 'POST', { brandSlug: 'samsung', name: 'Tablets' })).data;
  const ownModel = (await call('/catalog/models', 'POST', { typeId: 'CT-plat', name: 'A99 especial' })).data;
  const editedType = await call(`/catalog/types/${ownType.id}`, 'PATCH', { name: 'Galaxy Tab', brandSlug: 'Samsung' });
  assert.deepEqual([editedType.data.name, editedType.data.own], ['GALAXY TAB', true]);
  const moved = await call(`/catalog/models/${ownModel.id}`, 'PATCH', { name: 'Tab S9', typeId: ownType.id });
  assert.deepEqual([moved.data.name, moved.data.typeId], ['TAB S9', ownType.id]);
  assert.equal((await call(`/catalog/models/${ownModel.id}`, 'PATCH', { name: 'x' }, other, 'store-b')).status, 404, 'outra loja não altera');
  assert.equal((await call('/catalog/types/CT-plat', 'DELETE')).status, 404, 'o da plataforma não se exclui (oculta)');
  assert.equal((await call(`/catalog/models/${ownModel.id}`, 'DELETE')).status, 200);

  // Lista completa com contagens para a tela de Especificações.
  const all = (await call('/catalog/types?all=1')).data.find((t) => t.id === 'CT-plat');
  assert.equal(all.modelCount, 2);
});

test('o nome alterado do modelo aparece no produto da loja (e não no da outra loja)', async () => {
  await call('/catalog/models/CM-plat', 'PATCH', { name: 'Galaxy A15 4G' });
  const product = await call('/stock', 'POST', { name: 'SAMSUNG GALAXY A15', kind: 'device', qty: 1, cost: 500, price: 900, catalogTypeId: 'CT-plat', catalogModelId: 'CM-plat' });
  assert.equal(product.status, 201, JSON.stringify(product.error));
  const listed = (await call('/stock')).data.find((item) => item.id === product.data.id);
  assert.equal(listed.catalogModelName, 'GALAXY A15 4G');
  const otherProduct = await call('/stock', 'POST', { name: 'A15 LOJA B', kind: 'device', qty: 1, cost: 1, price: 2, catalogTypeId: 'CT-plat', catalogModelId: 'CM-plat' }, other, 'store-b');
  assert.equal((await call('/stock', 'GET', undefined, other, 'store-b')).data.find((item) => item.id === otherProduct.data.id).catalogModelName, 'MODELO X1');
});
