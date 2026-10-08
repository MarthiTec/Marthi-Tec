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
const { brandIconSlug } = await import('../dist/services/brandLogo.js');
const query = async (sql, args = []) => {
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });
await query(`INSERT INTO client_accounts(id,trade_name,legal_name,document,email,phone,contact_name) VALUES('a','a','a','a','a','','Test')`);
await query(`INSERT INTO stores(id,client_account_id,trade_name,legal_name,document) VALUES('store-a','a','Loja','Loja','1')`);
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-a','a','a@example.com','Admin','admin',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('m-a','user-a','store-a','admin')`);
const token = await createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'Admin', role: 'admin', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const realFetch = globalThis.fetch;
const iconCalls = [];
const ICON_HOSTS = ['cdn.simpleicons.org', 'cdn.jsdelivr.net', 'unpkg.com', 'www.google.com', 'icons.duckduckgo.com'];
const svg = (slug) => new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${slug}</title><path d="M0 0h24v24H0z"/></svg>`, { status: 200, headers: { 'content-type': 'image/svg+xml' } });
const png = new Uint8Array(400);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Fontes simuladas: o Simple Icons conhece apple e samsung; o espelho (jsDelivr) conhece xiaomi,
// como se o endereço principal estivesse bloqueado para ela; realme só tem o ícone do site.
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const host = new URL(u).host;
  if (!ICON_HOSTS.includes(host)) return realFetch(url, init);
  iconCalls.push(u);
  const slug = u.match(/(?:simpleicons\.org\/|icons\/)([a-z0-9]+)/)?.[1];
  if (host === 'cdn.simpleicons.org' && slug === 'xiaomi') throw new TypeError('fetch failed');
  if (host === 'cdn.simpleicons.org' && ['apple', 'samsung'].includes(slug)) return svg(slug);
  if (host === 'cdn.jsdelivr.net' && slug === 'xiaomi') return svg(slug);
  if (host === 'www.google.com' && u.includes('domain=realme.com')) return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
  return new Response('not found', { status: 404 });
};
async function request(path, method = 'GET', body, auth = true) {
  const response = await realFetch(base + path, { method, headers: { ...(auth ? { authorization: 'Bearer ' + token } : {}), 'x-store-id': 'store-a', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, json: await response.json() };
}
after(async () => { globalThis.fetch = realFetch; server.close(); await once(server, 'close'); await pool.end(); await db.close(); });

test('brand names map to the icon library slug', () => {
  assert.equal(brandIconSlug('Apple'), 'apple');
  assert.equal(brandIconSlug('iPhone'), 'apple');
  assert.equal(brandIconSlug('Redmi'), 'xiaomi');
  assert.equal(brandIconSlug('Sony Ericsson'), 'sonyericsson');
});

test('a new brand gets its default icon automatically and the totem receives it', async () => {
  const created = await request('/brands', 'POST', { name: 'Samsung' });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.match(created.json.data.logo, /^data:image\/svg\+xml;base64,/);
  assert.equal(created.json.data.logoSource, 'auto');
  const publicBrands = await request('/totem/brands', 'GET', undefined, false);
  assert.equal(publicBrands.status, 200);
  assert.ok(publicBrands.json.data.some((b) => b.name === 'Samsung' && b.logo));
});

test('unknown brands stay without icon; the store can upload one and fill the rest in bulk', async () => {
  const unknown = (await request('/brands', 'POST', { name: 'Marca Local' })).json.data;
  assert.equal(unknown.logo, null);
  assert.equal((await request(`/brands/${unknown.id}/logo/auto`, 'POST')).status, 404);
  const uploaded = await request(`/brands/${unknown.id}`, 'PATCH', { logo: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.json));
  assert.equal(uploaded.json.data.logoSource, 'upload');
  await query(`INSERT INTO store_brands(id,store_id,slug,name) VALUES('BRD-old','store-a','apple','Apple'),('BRD-x','store-a','xiaomi','Xiaomi'),('BRD-r','store-a','realme','Realme'),('BRD-z','store-a','zzz','Zzz Sem Site')`);
  const bulk = await request('/brands/logos/auto', 'POST');
  assert.equal(bulk.status, 200, JSON.stringify(bulk.json));
  assert.deepEqual(bulk.json.data.found, ['Apple', 'Realme', 'Xiaomi']);
  assert.deepEqual(bulk.json.data.missing, ['Zzz Sem Site']);
  const logos = Object.fromEntries((await query(`SELECT name, logo FROM store_brands WHERE store_id='store-a'`)).rows.map((r) => [r.name, r.logo]));
  assert.match(logos.Xiaomi, /^data:image\/svg\+xml;base64,/, 'icon comes from the mirror when the main host fails');
  assert.match(logos.Realme, /^data:image\/png;base64,/, 'brand outside the library gets its site icon');
  const removed = await request(`/brands/${unknown.id}`, 'PATCH', { logo: null });
  assert.equal(removed.json.data.logo, null);
  assert.ok(iconCalls.every((u) => ICON_HOSTS.includes(new URL(u).host) && !/[^a-z0-9./:?=&@-]/i.test(u)), 'only fixed icon hosts with a sanitized slug are called');
});
