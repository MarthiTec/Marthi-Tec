import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { buildSync } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';

const { outputFiles } = buildSync({ entryPoints: ['apps/web/src/data/supplierOfferCompare.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { matchingOffers, matchingStock, rankOffers, purchaseAdvice } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

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
await query(`INSERT INTO suppliers(id,store_id,name) VALUES('sup-a','store-a','Souna'),('sup-b','store-b','Outra loja')`);
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

const offer = (over) => ({
  id: over.supplierName, supplierId: '', model: 'IPHONE 17 PRO MAX', condition: 'new', batteryLevel: null, capacities: ['256GB'], colors: ['Prateado', 'Azul'],
  deliveryDays: 0, maxInstallments: 1, installmentFeePercent: 0, origin: 'Nacional (Anatel)', warranty: '', notes: '', quotedAt: '2026-10-16', ...over,
});

test('supplier offers are saved per store, updated, listed by day and deleted', async () => {
  const created = await call('/supplier-offers', 'POST', {
    supplierId: 'sup-a', supplierName: 'Souna', model: 'IPHONE 17 PRO MAX', condition: 'new', batteryLevel: 88, capacities: ['256GB'], colors: ['Prateado'],
    price: 6900, deliveryDays: 2, maxInstallments: 10, installmentFeePercent: 0, origin: 'Nacional (Anatel)',
  });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  assert.equal(created.data.batteryLevel, null, 'a new device has no battery wear');
  assert.equal((await call('/supplier-offers', 'POST', { supplierId: 'sup-b', supplierName: 'Outra', model: 'X', price: 10 })).status, 400, 'supplier of another store');
  const edited = await call(`/supplier-offers/${created.data.id}`, 'PUT', { ...created.data, price: 6850, condition: 'used', batteryLevel: 95 });
  assert.equal(edited.status, 200, JSON.stringify(edited.error));
  assert.deepEqual([edited.data.price, edited.data.condition, edited.data.batteryLevel], [6850, 'used', 95]);
  await query(`INSERT INTO supplier_offers(id,store_id,supplier_name,model,price,quoted_at) VALUES('old','store-a','Velha','IPHONE 16',4000, CURRENT_DATE - 30)`);
  assert.deepEqual((await call('/supplier-offers?days=7')).data.map((o) => o.id), [created.data.id]);
  assert.equal((await call('/supplier-offers?days=60')).data.length, 2);
  assert.equal((await call(`/supplier-offers/${created.data.id}`, 'DELETE')).status, 200);
  assert.equal((await call(`/supplier-offers/${created.data.id}`, 'DELETE')).status, 404);
});

test('the best purchase weighs price, delivery, installments and condition, and explains pros and cons', () => {
  const offers = [
    offer({ supplierName: 'Souna', price: 6900, deliveryDays: 2, maxInstallments: 10 }),
    offer({ supplierName: 'Vaivem', price: 7050, deliveryDays: 0 }),
    offer({ supplierName: 'Importadora', price: 6500, deliveryDays: 7, origin: 'Importado (vitrine)', quotedAt: '2026-10-14' }),
    offer({ supplierName: 'Usado', price: 5200, condition: 'used', batteryLevel: 78 }),
    offer({ supplierName: 'Outro modelo', model: 'IPHONE 17 PRO', price: 5000 }),
    offer({ supplierName: 'Sem prata', price: 6000, colors: ['Laranja'] }),
  ];
  const filter = { model: 'iPhone 17 Pro Max', capacity: '256GB', color: 'prateado', condition: 'new' };
  const eligible = matchingOffers(offers, filter);
  assert.deepEqual(eligible.map((o) => o.supplierName), ['Souna', 'Vaivem', 'Importadora']);
  const ranked = rankOffers(eligible, filter, '2026-10-16');
  assert.equal(ranked[0].offer.supplierName, 'Souna');
  assert.ok(ranked[0].pros.includes('Fornecedor parcela em até 10x sem juros'));
  const vaivem = ranked.find((r) => r.offer.supplierName === 'Vaivem');
  assert.ok(vaivem.pros.includes('Pronta entrega'));
  assert.ok(vaivem.cons.some((c) => /R\$\s550,00 mais caro/.test(c)));
  const imported = ranked.find((r) => r.offer.supplierName === 'Importadora');
  assert.ok(imported.pros.some((p) => /Menor preço/.test(p)));
  assert.ok(imported.cons.some((c) => /confira garantia/.test(c)));
  assert.ok(imported.cons.some((c) => /2 dias atrás/.test(c)));
  const used = rankOffers([offers[3]], { model: 'IPHONE 17 PRO MAX' }, '2026-10-16')[0];
  assert.ok(used.cons.some((c) => /bateria 78%: o cliente pode reclamar/.test(c)));
  assert.match(purchaseAdvice(ranked, []), /^Melhor compra: Souna por R\$\s6\.900,00/);
});

test('a cheaper used phone does not beat sealed ones: each condition has its own best buy', () => {
  const offers = [
    offer({ supplierName: 'Souna', price: 6900, deliveryDays: 2, maxInstallments: 10 }),
    offer({ supplierName: 'Jamil', price: 7050, deliveryDays: 0 }),
    offer({ supplierName: 'TOP', price: 5900, condition: 'used', batteryLevel: 92, deliveryDays: 1 }),
  ];
  const ranked = rankOffers(offers, { model: 'IPHONE 17 PRO MAX', condition: 'any' }, '2026-10-16');
  assert.deepEqual(ranked.map((r) => [r.offer.supplierName, r.best]), [['Souna', true], ['Jamil', false], ['TOP', true]]);
  assert.ok(ranked[1].cons.some((text) => /^R\$\s150,00 mais caro que o menor preço entre os novos$/.test(text)));
  assert.ok(!ranked[0].cons.some((text) => /mais caro/.test(text)), 'the used one is not the price reference for sealed phones');
  assert.match(purchaseAdvice(ranked, []), /^Novo: Souna por R\$\s6\.900,00 · Usado: TOP por R\$\s5\.900,00\.$/);
});

test('if the store already has the device in stock, sell it before buying another', () => {
  const units = [
    { name: 'IPHONE 17 PRO MAX', capacity: '256GB', color: 'Prateado', condition: 'new', batteryLevel: 100, qty: 2, price: 7500 },
    { name: 'IPHONE 17 PRO MAX', capacity: '256GB', color: 'Azul', condition: 'new', batteryLevel: 100, qty: 1, price: 7500 },
    { name: 'IPHONE 17 PRO MAX', capacity: '256GB', color: 'Prateado', condition: 'new', batteryLevel: 100, qty: 0, price: 7500 },
  ];
  const found = matchingStock(units, { model: 'iphone 17 pro max', capacity: '256 gb', color: 'PRATEADO' });
  assert.equal(found.length, 1);
  assert.match(purchaseAdvice([], found), /Você já tem 2 unidades em estoque/);
});
