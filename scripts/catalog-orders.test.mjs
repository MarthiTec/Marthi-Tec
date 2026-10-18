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
await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','Test')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-a','a','Loja','Loja','1')`);
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Gestora','admin',true),('user-s','a','s@example.com','Vendedor','seller',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin'),('m-s','user-s','store-a','seller')`);
await query(`INSERT INTO sellers(id,store_id,name) VALUES('seller-1','store-a','Mariana'),('seller-2','store-a','Gilvan')`);
await query(`INSERT INTO customers(id,store_id,name,phone,phone_digits) VALUES('cust-1','store-a','Cliente Certo','','')`);
const admin = await auth.createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Gestora', role: 'admin', clientAccountId: 'a' });
const seller = await auth.createSessionToken({ id: 'user-s', email: 's@example.com', name: 'Vendedor', role: 'seller', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (path, method = 'GET', body, token = admin) => {
  const res = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json();
  return { status: res.status, data: json.data, error: json.error };
};
const sold = async (imei) => (await query("SELECT count(*)::int n FROM stock_sold_units WHERE imei=$1 AND reverted_at IS NULL", [imei])).rows[0].n;
const qty = async (id) => Number((await query('SELECT qty FROM stock_items WHERE id=$1', [id])).rows[0].qty);
after(async () => { server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

const methods = (await call('/pickup-methods')).data;
const order = methods.find((m) => m.kind === 'order');
assert.ok(order, 'store has the order (sob encomenda) method');
const cor = (await call('/attributes', 'POST', { name: 'Cor', values: ['Preto', 'Azul'] })).data.id;
// iPhone 17: Preto em estoque; Azul sem estoque mas sob encomenda (preço de encomenda R$ 6.900).
const iphone = (await call('/stock', 'POST', {
  name: 'IPHONE 17 PRO MAX', kind: 'device', qty: 0, price: 7500,
  variations: [
    { attrs: { [cor]: 'Preto' }, price: 7500, cost: 6900, qty: 1, minQty: 0, condition: 'new' },
    { attrs: { [cor]: 'Azul' }, price: 7500, cost: 6900, qty: 0, minQty: 0, condition: 'new', pickupPrices: { [order.id]: 6900 } },
  ],
})).data;
const gone = (await call('/stock', 'POST', { name: 'FONE ESGOTADO', kind: 'product', qty: 0, price: 99, cost: 30, pickupPrices: { [order.id]: null } })).data;
const catalog = (await call('/sales-catalogs', 'POST', { title: 'Catálogo', productIds: [iphone.id, gone.id] })).data;
const pub = (path, body) => fetch(`${base}/public/sales-catalogs/${catalog.token}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const preto = [{ id: cor, value: 'Preto' }, { id: '__condition', value: 'Novo' }];
const azul = [{ id: cor, value: 'Azul' }, { id: '__condition', value: 'Novo' }];
const customer = { name: 'Joana Lima', document: '123.456.789-09', phone: '(32) 99999-1234', email: 'joana@example.com', zipCode: '36000-000', street: 'Rua A', number: '10', district: 'Centro', city: 'Juiz de Fora', state: 'mg' };

test('the customer page shows stock and "sob encomenda" options, sellers by name only, never cost', async () => {
  const page = await pub('');
  assert.equal(page.status, 200);
  const item = page.data.items.find((i) => i.id === iphone.id);
  assert.deepEqual(item.variants.map((v) => [v.color, v.availability, v.price]), [['Preto', 'in_stock', 7500], ['Azul', 'order', 6900]]);
  assert.ok(item.variants[1].leadDays >= 1);
  assert.equal(page.data.items.some((i) => i.id === gone.id), false, 'no stock and no order: hidden');
  assert.deepEqual(page.data.sellers.map((s) => Object.keys(s).sort()), [['id', 'name'], ['id', 'name']]);
  assert.doesNotMatch(JSON.stringify(page.data), /6900[^,]*cost|"cost"/);
});

let orderId;
test('the order keeps the server prices, the chosen seller and the trade-in; sold-out and bots are refused', async () => {
  const bot = await pub('/orders', { customer, items: [{ productId: iphone.id, attributes: preto }], website: 'spam' });
  assert.equal(bot.status, 400);
  const badSeller = await pub('/orders', { customer, sellerId: 'SEL-OUTRA-LOJA', items: [{ productId: iphone.id, attributes: preto }] });
  assert.equal(badSeller.status, 400);
  const soldOut = await pub('/orders', { customer, items: [{ productId: gone.id, attributes: [] }] });
  assert.equal(soldOut.status, 409);
  const created = await pub('/orders', {
    requestKey: 'catalog-order-0001', customer, sellerId: 'seller-2', payment: 'Cartão de Crédito', installments: 10,
    items: [{ productId: iphone.id, attributes: preto, price: 1 }, { productId: iphone.id, attributes: azul }],
    tradeIn: { device: 'IPHONE 13', capacity: '128GB', color: 'Azul', imei: '351234567890123', battery: 84, condition: 'marks', faceIdOk: true, hasBox: true },
  });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  assert.equal(created.data.total, 14400, 'R$ 7.500 em estoque + R$ 6.900 sob encomenda, preço do servidor');
  const again = await pub('/orders', { requestKey: 'catalog-order-0001', customer, items: [{ productId: iphone.id, attributes: preto }] });
  assert.equal(again.data.id, created.data.id, 'same request does not duplicate');
  orderId = created.data.id;

  const queue = (await call('/catalog-orders')).data;
  assert.equal(queue.length, 1);
  const q = queue[0];
  assert.deepEqual([q.sellerName, q.payment, q.installments, q.tradeIn.battery, q.items.map((i) => [i.variantLabel, i.availability, Boolean(i.pickupMethodId)])], ['Gilvan', 'Cartão de Crédito', 10, 84, [['Preto', 'in_stock', false], ['Azul', 'order', true]]]);
});

test('accepting creates the customer (with address and seller); a second order of the same person links the same customer', async () => {
  const accepted = await call(`/catalog-orders/${orderId}/accept`, 'POST');
  assert.equal(accepted.status, 200, JSON.stringify(accepted.error));
  assert.equal(accepted.data.createdCustomer, true);
  const saved = (await query('SELECT name, document, city, state, seller_id FROM customers WHERE id = $1', [accepted.data.customer.id])).rows[0];
  assert.deepEqual([saved.name, saved.document, saved.city, saved.state, saved.seller_id], ['Joana Lima', '123.456.789-09', 'Juiz de Fora', 'MG', 'seller-2']);
  const signup = await pub('/orders', { kind: 'signup', customer: { ...customer, phone: '(32) 98888-0000' } });
  assert.equal(signup.status, 201, JSON.stringify(signup.error));
  const linked = await call(`/catalog-orders/${signup.data.id}/accept`, 'POST');
  assert.deepEqual([linked.data.createdCustomer, linked.data.customer.id, linked.data.order.status], [false, accepted.data.customer.id, 'sold'], 'same CPF: same customer; signup only leaves the queue');
});

test('the external sale that finishes the order takes it out of the queue; cancel works', async () => {
  const sale = await call('/sales/external', 'POST', { sellerId: 'seller-2', customerId: (await query('SELECT customer_id FROM catalog_orders WHERE id=$1', [orderId])).rows[0].customer_id, paymentMethod: 'PIX', catalogOrderId: orderId, lines: [{ stockId: iphone.id, name: 'IPHONE 17 PRO MAX', qty: 1, unitPrice: 7500, attributes: [{ id: cor, name: 'Cor', value: 'Preto' }, { id: '__condition', name: 'Condição', value: 'Novo' }] }] });
  assert.equal(sale.status, 201, JSON.stringify(sale.error));
  const row = (await query('SELECT status, sale_id FROM catalog_orders WHERE id=$1', [orderId])).rows[0];
  assert.deepEqual([row.status, row.sale_id], ['sold', sale.data.id]);
  assert.equal((await call('/catalog-orders')).data.length, 0);
  const another = await pub('/orders', { customer: { ...customer, phone: '(32) 97777-0000', document: '' }, items: [{ productId: iphone.id, attributes: azul }] });
  assert.equal((await call(`/catalog-orders/${another.data.id}/cancel`, 'POST', { reason: 'Desistiu' })).data.status, 'cancelled');
});

test('products sold by order always show in the catalog and can be ordered, even when not marked (option on by default)', async () => {
  const byOrder = (await call('/stock', 'POST', { name: 'IPHONE 18 PRO ENCOMENDA', kind: 'device', qty: 0, price: 9800, cost: 9000, pickupPrices: { [order.id]: 9800 } })).data;
  // Sem "Sob encomenda" marcado no cadastro (só pronta entrega) e sem estoque: não aparece no catálogo.
  await call('/stock', 'POST', { name: 'XIAOMI SEM ENCOMENDA', kind: 'device', qty: 0, price: 1500, cost: 1000 });
  const onlyMarked = (await call('/sales-catalogs', 'POST', { title: 'Só o iPhone 17', productIds: [iphone.id] })).data;
  assert.equal(onlyMarked.includeOrderProducts, true);
  const page = (await (await fetch(`${base}/public/sales-catalogs/${onlyMarked.token}`)).json()).data;
  const names = page.items.map((i) => i.name);
  assert.ok(names.includes('IPHONE 18 PRO ENCOMENDA'), 'order-only product shows without being marked');
  assert.equal(names.includes('FONE ESGOTADO'), false, 'no stock and no order: still hidden');
  assert.equal(names.includes('XIAOMI SEM ENCOMENDA'), false, 'order not ticked in the product: not offered');
  const notTicked = await fetch(`${base}/public/sales-catalogs/${onlyMarked.token}/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer: { ...customer, phone: '(32) 95555-0000' }, items: [{ productId: (await query("SELECT id FROM stock_items WHERE name = 'XIAOMI SEM ENCOMENDA'")).rows[0].id, attributes: [] }] }) });
  assert.notEqual(notTicked.status, 201, 'cannot order a product without order ticked');
  assert.equal(names[0], 'IPHONE 17 PRO MAX', 'the marked products come first');
  const ordered = await fetch(`${base}/public/sales-catalogs/${onlyMarked.token}/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer: { ...customer, phone: '(32) 96666-0000' }, items: [{ productId: byOrder.id, attributes: [] }] }) });
  assert.equal(ordered.status, 201, JSON.stringify(await ordered.clone().json()));
  const off = await call(`/sales-catalogs/${onlyMarked.id}`, 'PATCH', { title: 'Só o iPhone 17', productIds: [iphone.id], includeOrderProducts: false });
  assert.equal(off.data.includeOrderProducts, false);
  const offPage = (await (await fetch(`${base}/public/sales-catalogs/${onlyMarked.token}`)).json()).data;
  assert.deepEqual(offPage.items.map((i) => i.name), ['IPHONE 17 PRO MAX']);
});
