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

let caixa, banco;
import { buildSync } from 'esbuild';

const { outputFiles } = buildSync({ entryPoints: ['apps/web/src/data/productPickup.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { productAvailableForTotem, pickupFitsView } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

const methods = [
  { id: 'maos', name: 'Em mãos', kind: 'immediate', active: true },
  { id: 'encomenda', name: 'Sob encomenda', kind: 'order', active: true },
];
const both = { id: 'p1', qty: 2, price: 7500, pickupPrices: { maos: 7500, encomenda: 7300 } };
const orderOnly = { id: 'p2', qty: 0, price: 5000, pickupPrices: { encomenda: 5000 } };
const inHandSoldOut = { id: 'p3', qty: 0, price: 3000, pickupPrices: { maos: 3000 } };

test('the customer choice on the totem filters products by how they can be picked up', () => {
  assert.deepEqual([both, orderOnly, inHandSoldOut].map((stock) => productAvailableForTotem(methods, stock)), [true, true, false]);
  assert.deepEqual([both, orderOnly, inHandSoldOut].map((stock) => productAvailableForTotem(methods, stock, 'immediate')), [true, false, false]);
  assert.deepEqual([both, orderOnly, inHandSoldOut].map((stock) => productAvailableForTotem(methods, stock, 'order')), [true, true, false]);
  assert.deepEqual(methods.filter((method) => pickupFitsView('order', method)).map((method) => method.id), ['encomenda']);
  assert.deepEqual(methods.filter((method) => pickupFitsView('immediate', method)).map((method) => method.id), ['maos']);
});

test('the pickup question is on by default, keeps older saved settings working and can be turned off', async () => {
  const fresh = (await call('/totem/settings')).data.assistant;
  assert.equal(fresh.askPickup, true);
  assert.match(fresh.pickupPrompt, /em mãos, sob encomenda ou ambos/);
  // Configuração salva antes da pergunta existir (sem askPickup/pickupPrompt).
  const legacy = { enabled: false, name: '', avatar: null, whatsapp: '', sellerId: '', askIntent: true, askBrand: true, namePrompt: 'Oi', intentPrompt: 'O que busca?', brandPrompt: 'Marca?', productsPrompt: 'Produtos', closingPrompt: 'Tchau' };
  const saved = await call('/totem/settings', 'PUT', { assistant: legacy });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  assert.equal((await call('/totem/settings')).data.assistant.askPickup, true);
  assert.equal((await call('/totem/settings', 'PUT', { assistant: { ...legacy, askPickup: false, pickupPrompt: 'Pronta entrega ou encomenda, {nome}?' } })).status, 200);
  const off = (await call('/totem/settings')).data.assistant;
  assert.equal(off.askPickup, false);
  assert.equal(off.pickupPrompt, 'Pronta entrega ou encomenda, {nome}?');
});
