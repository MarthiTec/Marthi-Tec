import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.EVOLUTION_BASE_URL = 'https://evolution.test';
process.env.EVOLUTION_MASTER_API_KEY = 'test-only-master-key';

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
await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','Test')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document,whatsapp_settings,totem_settings) VALUES('store-a','a','Cell Ponto','Cell Ponto Ltda','38297104000182',$1,$2)`, [
  JSON.stringify({ enabled: true, instance: 'loja-store-a' }),
  JSON.stringify({ storeLogo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }),
]);
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Admin','admin',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin')`);
const token = await createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Admin', role: 'admin', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const realFetch = globalThis.fetch;
const evolution = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith('https://evolution.test/')) return realFetch(url, init);
  evolution.push({ url: u, body: JSON.parse(init.body) });
  return new Response(JSON.stringify({ key: { id: 'MSG-' + evolution.length } }), { status: 201, headers: { 'content-type': 'application/json' } });
};
async function request(path, method = 'GET', body) {
  const response = await realFetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': 'store-a', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, type, json: type.includes('json') ? await response.json() : null, buffer: type.includes('pdf') ? Buffer.from(await response.arrayBuffer()) : null };
}
after(async () => { globalThis.fetch = realFetch; server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('store profile uses the totem logo until one is uploaded, and saves social networks', async () => {
  const first = await request('/store/brand-profile');
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.match(first.json.data.logo, /^data:image\/png/);
  assert.equal(first.json.data.logoFromTotem, true);
  assert.equal(first.json.data.phone, '', 'placeholder phone is not shown');
  const saved = await request('/store/brand-profile', 'PUT', { instagram: '@cellponto', website: 'cellponto.com.br', phone: '(24) 99225-0000', signature: 'Equipe Cell Ponto · Seu celular em boas mãos' });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(saved.json.data.instagram, '@cellponto');
  assert.equal((await request('/store/brand-profile', 'PUT', { email: 'não é email' })).status, 400);
  const totem = await realFetch(base + '/totem/settings', { headers: { 'x-store-id': 'store-a' } }).then((r) => r.json());
  assert.match(totem.data.storeLogo, /^data:image\/png/, 'totem keeps its logo');
});

test('receipt QR opens the store Instagram; PDF and WhatsApp (message + PDF) carry the store signature', async () => {
  const stock = (await request('/stock', 'POST', { name: 'IPHONE 17', qty: 2, cost: 4000, price: 5600 })).json.data;
  const sale = await request('/sales/external', 'POST', { paymentMethod: 'Cartão de Crédito', installments: 18, customerName: 'Ramon Freitas', customerPhone: '24992259927', warrantyType: 'manufacturer', lines: [{ stockId: stock.id, name: 'IPHONE 17', qty: 1, unitPrice: 5600, imei: '356789012345678' }] });
  assert.equal(sale.status, 201, JSON.stringify(sale.json));
  const id = sale.json.data.id || sale.json.data.saleId;
  const receipt = (await request('/sales/' + id + '/receipt')).json.data;
  assert.equal(receipt.qr.url, 'https://instagram.com/cellponto');
  assert.match(receipt.qr.label, /@cellponto/);
  assert.match(receipt.store.logo, /^data:image\/png/);
  const pdf = await request('/sales/' + id + '/receipt.pdf');
  assert.equal(pdf.status, 200);
  assert.match(pdf.type, /application\/pdf/);
  assert.equal(pdf.buffer.subarray(0, 5).toString(), '%PDF-');
  const sent = await request('/sales/' + id + '/send-warranty-whatsapp', 'POST', { phone: '24992259927' });
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  assert.equal(sent.json.data.sentViaEvolution, true, JSON.stringify(sent.json));
  assert.equal(sent.json.data.pdfSent, true, JSON.stringify(sent.json));
  const [text, document] = evolution.slice(-2);
  assert.match(text.url, /\/message\/sendText\/loja-store-a$/);
  assert.match(text.body.text, /Equipe Cell Ponto · Seu celular em boas mãos/);
  assert.match(text.body.text, /Somente garantia do fabricante/);
  assert.match(document.url, /\/message\/sendMedia\/loja-store-a$/);
  assert.equal(document.body.mediatype, 'document');
  assert.equal(document.body.mimetype, 'application/pdf');
  assert.equal(Buffer.from(document.body.media, 'base64').subarray(0, 5).toString(), '%PDF-');
  assert.equal(document.body.number, '5524992259927');
});
