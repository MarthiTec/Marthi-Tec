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
for (const n of ['a', 'b']) {
  await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES($1,$1,$1,$1,$1,'','Test')`, [n]);
  await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES($1,$2,$1,$1,$1)`, ['store-' + n, n]);
  await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES($1,$2,$3,$1,'admin',true)`, ['user-' + n, n, n + '@example.com']);
  await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES($1,$2,$3,'admin')`, ['m-' + n, 'user-' + n, 'store-' + n]);
}
const token = await createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'user-a', role: 'admin', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const realFetch = globalThis.fetch;
const viaCepCalls = [];
// ViaCEP simulado: um CEP e uma busca por rua em São Paulo.
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith('https://viacep.com.br/')) return realFetch(url, init);
  viaCepCalls.push(u);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (u === 'https://viacep.com.br/ws/01310100/json/') return json({ cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' });
  if (u === 'https://viacep.com.br/ws/99999999/json/') return json({ erro: 'true' });
  if (u.startsWith('https://viacep.com.br/ws/SP/S%C3%A3o%20Paulo/Paulista/')) return json([
    { cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' },
    { cep: '01311-000', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' },
  ]);
  return json([], 200);
};
async function request(path, method = 'GET', body, store = 'store-a') {
  const response = await realFetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': store, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, json: await response.json() };
}
after(async () => { globalThis.fetch = realFetch; server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('address is found by CEP and by street name, and unknown CEP returns 404', async () => {
  const byCep = await request('/address/cep/01310-100');
  assert.equal(byCep.status, 200, JSON.stringify(byCep.json));
  assert.deepEqual(byCep.json.data, { zipCode: '01310-100', street: 'Avenida Paulista', district: 'Bela Vista', city: 'São Paulo', state: 'SP', complement: '' });
  assert.equal((await request('/address/cep/99999999')).status, 404);
  const byStreet = await request('/address/search?uf=SP&city=' + encodeURIComponent('São Paulo') + '&street=Paulista');
  assert.equal(byStreet.status, 200, JSON.stringify(byStreet.json));
  assert.equal(byStreet.json.data.length, 2);
  assert.equal(byStreet.json.data[1].zipCode, '01311-000');
  assert.equal((await request('/address/search?uf=SP&city=Sa&street=Pa')).status, 400, 'too short search is refused before calling the service');
  assert.ok(viaCepCalls.every((u) => u.startsWith('https://viacep.com.br/ws/')));
});

test('customer saves company type, full address, several phones and e-mails and the responsible seller', async () => {
  await query("INSERT INTO sellers(id,store_id,name) VALUES('SEL-a','store-a','Vendedora A'),('SEL-b','store-b','Vendedor B')");
  const created = await request('/customers', 'POST', {
    name: 'Empresa Cliente', documentType: 'cnpj', document: '12.345.678/0001-90', phone: '(24) 99999-0000', email: 'compras@empresa.com',
    zipCode: '01310-100', street: 'Avenida Paulista', number: '1000', district: 'Bela Vista', city: 'São Paulo', state: 'sp',
    phones: ['(24) 3333-0000', ''], emails: ['financeiro@empresa.com'], sellerId: 'SEL-a',
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const row = (await query("SELECT * FROM customers WHERE id=$1", [created.json.data.id])).rows[0];
  assert.equal(row.document_type, 'cnpj');
  assert.equal(row.state, 'SP');
  assert.equal(row.district, 'Bela Vista');
  assert.deepEqual(row.extra_phones, ['(24) 3333-0000']);
  assert.deepEqual(row.extra_emails, ['financeiro@empresa.com']);
  assert.equal(row.seller_id, 'SEL-a');
  const listed = (await request('/customers')).json.data.find((c) => c.id === created.json.data.id);
  assert.equal(listed.documentType, 'cnpj');
  assert.deepEqual(listed.phones, ['(24) 3333-0000']);
  assert.equal(listed.sellerId, 'SEL-a');
  assert.equal((await request('/customers/' + row.id, 'PATCH', { sellerId: 'SEL-b' })).status, 400, 'seller of another store is refused');
  const cleared = await request('/customers/' + row.id, 'PATCH', { sellerId: null, phones: [], documentType: 'cpf' });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.json));
  const after = (await query("SELECT seller_id, extra_phones, document_type, street FROM customers WHERE id=$1", [row.id])).rows[0];
  assert.equal(after.seller_id, null);
  assert.deepEqual(after.extra_phones, []);
  assert.equal(after.document_type, 'cpf');
  assert.equal(after.street, 'Avenida Paulista', 'fields not sent are kept');
});

test('suppliers and sellers also keep address, person type and extra contacts', async () => {
  const supplier = await request('/suppliers', 'POST', { name: 'Distribuidora', documentType: 'cnpj', zipCode: '01310-100', street: 'Av. Paulista', number: '50', city: 'São Paulo', state: 'SP', phones: ['11 4000-0000'], emails: ['vendas@d.com'] });
  assert.equal(supplier.status, 201, JSON.stringify(supplier.json));
  const listedSupplier = (await request('/suppliers')).json.data.find((s) => s.id === supplier.json.data.id);
  assert.equal(listedSupplier.street, 'Av. Paulista');
  assert.deepEqual(listedSupplier.emails, ['vendas@d.com']);
  assert.equal(listedSupplier.documentType, 'cnpj');
  const seller = await request('/sellers', 'POST', { name: 'Vendedor Novo', zipCode: '01310-100', city: 'São Paulo', state: 'SP', phones: ['11 98888-0000'] });
  assert.equal(seller.status, 201, JSON.stringify(seller.json));
  const edited = await request('/sellers/' + seller.json.data.id, 'PATCH', { number: '12' });
  assert.equal(edited.json.data.number, '12');
  assert.equal(edited.json.data.city, 'São Paulo');
  assert.deepEqual(edited.json.data.phones, ['11 98888-0000']);
});

test('customer summary counts purchases, payment methods, products and services, also from sales without the customer link', async () => {
  const customer = (await request('/customers', 'POST', { name: 'Ramon', phone: '+55 24 99225-9927' })).json.data;
  await query("INSERT INTO sales_orders(id,store_id,customer_id,customer_name,final_amount,status,created_at) VALUES('S1','store-a',$1,'Ramon',5600,'completed','2026-10-01')", [customer.id]);
  await query("INSERT INTO sales_orders(id,store_id,customer_name,customer_phone,final_amount,status,created_at) VALUES('S2','store-a','Ramon','(24) 99225-9927',150,'completed','2026-10-05')");
  await query("INSERT INTO sales_orders(id,store_id,customer_id,customer_name,final_amount,status) VALUES('S3','store-a',$1,'Ramon',999,'cancelled')", [customer.id]);
  await query("INSERT INTO sales_orders(id,store_id,customer_name,customer_phone,final_amount,status) VALUES('S4','store-b','Outro','5524992259927',777,'completed')");
  await query("INSERT INTO sale_payments(id,sale_id,method,method_name,amount,installments) VALUES('P1','S1','credit','Cartão de Crédito',5600,10),('P2','S2','pix','PIX',150,1),('P3','S3','pix','PIX',999,1)");
  await query("INSERT INTO sales_order_lines(id,sale_id,name,qty,unit_price,total_price) VALUES('L1','S1','IPHONE 17',1,5600,5600),('L2','S2','Película 3D',2,75,150),('L3','S3','Capinha',1,999,999)");
  await query("INSERT INTO work_orders(id,store_id,customer_id,customer_name,device_brand,device_model,status,total_amount) VALUES('OS1','store-a',$1,'Ramon','Apple','iPhone 13','completed',350)", [customer.id]);
  const summary = await request('/customers/' + customer.id + '/summary');
  assert.equal(summary.status, 200, JSON.stringify(summary.json));
  const data = summary.json.data;
  assert.equal(data.salesCount, 2);
  assert.equal(data.cancelledCount, 1);
  assert.equal(data.totalSpent, 5750);
  assert.equal(data.averageTicket, 2875);
  assert.deepEqual(data.payments.map((p) => [p.method, p.amount]), [['Cartão de Crédito', 5600], ['PIX', 150]]);
  assert.deepEqual(data.products.map((p) => [p.name, p.qty]).sort(), [['IPHONE 17', 1], ['Película 3D', 2]]);
  assert.equal(data.services.length, 1);
  assert.equal(data.services[0].device, 'Apple iPhone 13');
  assert.ok([403, 404].includes((await request('/customers/' + customer.id + '/summary', 'GET', undefined, 'store-b')).status), 'another store cannot read it');
});
