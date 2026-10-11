// Conexão Meta pela loja (token próprio) e publicações programadas no Instagram. As respostas da Graph API
// são simuladas SÓ aqui (transporte de teste); a produção sempre fala com a Meta de verdade.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
// Sem app do Marthi e sem META_TOKEN_KEY: a conexão da loja tem de funcionar sozinha.
delete process.env.META_APP_ID;
delete process.env.META_TOKEN_KEY;
process.env.META_APP_SECRET = 'marthi-app-secret';
process.env.FRONTEND_URL = 'https://loja.example.com';
process.env.ADS_ENVIRONMENT = 'test';

const db = new PGlite();
for (const file of fs.readdirSync('apps/api/src/db/migrations').filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(`apps/api/src/db/migrations/${file}`, 'utf8'));
}
const { app } = await import('../dist/app.js');
const { pool } = await import('../dist/db/pool.js');
const { createSessionToken } = await import('../dist/services/authService.js');
const { setGraphTransportForTests } = await import('../dist/services/ads/metaGraph.js');
const { publishSocialPost } = await import('../dist/services/ads/socialPosts.js');
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
  await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES($1,$2,$3,'admin')`, ['membership-' + n, 'user-' + n, 'store-' + n]);
}
const tokenA = await createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'user-a', role: 'admin', clientAccountId: 'a' });
const tokenB = await createSessionToken({ id: 'user-b', email: 'b@example.com', name: 'user-b', role: 'admin', clientAccountId: 'b' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
async function request(path, method = 'GET', body, store = 'store-a', token = store === 'store-b' ? tokenB : tokenA) {
  const response = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'x-store-id': store, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, json };
}
after(() => {
  setGraphTransportForTests(null);
  server.close();
});

// ── Meta simulada ─────────────────────────────────────────────
const STORE_TOKEN = 'EAAG-store-system-user-token-0123456789abcdef';
const meta = {
  calls: [],
  permissions: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'ads_management', 'ads_read', 'pages_manage_ads'],
  failPublish: null,
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
setGraphTransportForTests(async (input, init = {}) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v\d+\.\d+\//, '');
  const method = init.method ?? 'GET';
  const params = Object.fromEntries(url.searchParams.entries());
  if (init.body instanceof URLSearchParams) Object.assign(params, Object.fromEntries(init.body.entries()));
  meta.calls.push({ method, path, params });
  if (params.access_token !== STORE_TOKEN) return json({ error: { message: 'Invalid OAuth access token.', code: 190 } }, 400);
  if (path === 'me') return json({ id: 'SYSUSER1', name: 'Marthi Cell Ponto (sistema)' });
  if (path === 'me/permissions') return json({ data: meta.permissions.map((permission) => ({ permission, status: 'granted' })) });
  if (path === 'me/accounts') return json({ data: [{ id: 'PAGE1', name: 'Cell Ponto', tasks: ['ADVERTISE'], access_token: 'PAGE-TOKEN', instagram_business_account: { id: 'IG1', username: 'cellponto_' } }] });
  if (path === 'me/adaccounts') return json({ data: [{ id: 'act_111', name: 'Conta Cell', account_status: 1, currency: 'BRL', timezone_name: 'America/Sao_Paulo' }] });
  if (path === 'act_111') return json({ id: 'act_111', name: 'Conta Cell', account_status: 1, currency: 'BRL' });
  if (path === 'IG1' && method === 'GET') return json({ username: 'cellponto_', followers_count: 1520, media_count: 87 });
  if (path === 'IG1/media' && method === 'POST') return json({ id: 'CONTAINER1' });
  if (path === 'CONTAINER1') return json({ status_code: 'FINISHED' });
  if (path === 'IG1/media_publish') {
    if (meta.failPublish) {
      const error = meta.failPublish;
      meta.failPublish = null;
      return json({ error }, 400);
    }
    return json({ id: 'IGMEDIA1' });
  }
  if (path === 'IGMEDIA1') return json({ permalink: 'https://www.instagram.com/p/ABC123/' });
  return json({ error: { message: `rota simulada não tratada: ${method} ${path}`, code: 100 } }, 400);
}, 0);

/** JPEG mínimo com o cabeçalho de tamanho (o Marthi lê largura e altura do arquivo). */
function jpegDataUrl(width, height) {
  const bytes = Buffer.alloc(64);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03]).copy(bytes);
  return 'data:image/jpeg;base64,' + bytes.toString('base64');
}
function pngDataUrl(width, height) {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return 'data:image/png;base64,' + bytes.toString('base64');
}

test('store connects with its own token (no Marthi app needed): token, Page, Instagram and ad account are validated and stored encrypted', async () => {
  const bad = await request('/ads/meta/store-connection', 'POST', { token: 'EAAG-invalid-token-0000000000000000000' });
  assert.equal(bad.status, 422);
  assert.match(bad.json.error.message, /recusou o token/);

  const ok = await request('/ads/meta/store-connection', 'POST', { token: STORE_TOKEN });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const row = (await query(`SELECT * FROM ads_connections WHERE store_id='store-a'`)).rows[0];
  assert.equal(row.connection_mode, 'store_token');
  assert.equal(row.page_id, 'PAGE1');
  assert.equal(row.instagram_id, 'IG1');
  assert.equal(row.ad_account_id, 'act_111');
  assert.ok(row.token_enc.startsWith('v2.'), 'token encrypted with the server-derived key');
  assert.ok(!row.token_enc.includes(STORE_TOKEN));
  // Token da loja não leva a prova do app do Marthi (seria recusada pela Meta).
  assert.ok(meta.calls.every((call) => !call.params.appsecret_proof));

  const health = ok.json.data.health;
  assert.equal(health.checks.find((check) => check.id === 'app').ok, true);
  assert.equal(health.canAdvertise, true);

  const tested = await request('/ads/meta/store-test');
  assert.equal(tested.status, 200);
  assert.equal(tested.json.data.canPublishInstagram, true);
  assert.equal(tested.json.data.instagram.username, 'cellponto_');
  assert.equal(tested.json.data.instagram.followers, 1520);

  // Outra loja não vê nem usa essa conexão.
  assert.equal((await request('/ads/meta/store-test', 'GET', null, 'store-b')).status, 409);
});

test('Instagram post: only JPG with valid ratio; scheduled post is published by the worker with a signed image link', async () => {
  const png = await request('/ads/media/image', 'POST', { name: 'png', dataUrl: pngDataUrl(1080, 1080), rightsConfirmed: true });
  const jpg = await request('/ads/media/image', 'POST', { name: 'iphone.jpg', dataUrl: jpegDataUrl(1080, 1350), rightsConfirmed: true });
  assert.equal(jpg.status, 201, JSON.stringify(jpg.json));
  const refusedPng = await request('/ads/social-posts', 'POST', { caption: 'Teste', mediaId: png.json.data.id, scheduledAt: new Date(Date.now() + 3600_000).toISOString() });
  assert.equal(refusedPng.status, 422);
  assert.match(refusedPng.json.error.message, /JPG/);
  const tooSoon = await request('/ads/social-posts', 'POST', { caption: 'Teste', mediaId: jpg.json.data.id, scheduledAt: new Date(Date.now() + 5_000).toISOString() });
  assert.equal(tooSoon.status, 422);

  const at = new Date(Date.now() + 3600_000).toISOString();
  const created = await request('/ads/social-posts', 'POST', { caption: 'iPhone 15 Pro Max seminovo com garantia #cellponto', mediaId: jpg.json.data.id, scheduledAt: at });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.data.status, 'scheduled');
  const id = created.json.data.id;
  // Antes da hora o agendador não publica.
  await publishSocialPost(id);
  assert.equal((await query('SELECT status FROM ads_social_posts WHERE id=$1', [id])).rows[0].status, 'scheduled');
  // Chegou a hora.
  await query(`UPDATE ads_social_posts SET scheduled_at = now() - interval '1 minute' WHERE id=$1`, [id]);
  await publishSocialPost(id);
  const done = (await query('SELECT * FROM ads_social_posts WHERE id=$1', [id])).rows[0];
  assert.equal(done.status, 'published', done.error);
  assert.equal(done.external_id, 'IGMEDIA1');
  assert.equal(done.permalink, 'https://www.instagram.com/p/ABC123/');
  const container = meta.calls.find((call) => call.path === 'IG1/media');
  assert.equal(container.params.caption, 'iPhone 15 Pro Max seminovo com garantia #cellponto');
  assert.match(container.params.image_url, /^https:\/\/loja\.example\.com\/api\/v1\/public\/social-media\/IGP-/);
  // Depois de publicada, o link da imagem deixa de funcionar; link com assinatura errada nunca funciona.
  const imagePath = new URL(container.params.image_url).pathname.replace('/api/v1', '');
  assert.equal((await fetch(base + imagePath)).status, 404);
  assert.equal((await fetch(base + `/public/social-media/${id}/forjada.jpg`)).status, 404);
});

test('publish now, signed image served while publishing, failure keeps the reason and retry publishes', async () => {
  const jpg = await request('/ads/media/image', 'POST', { name: 'agora.jpg', dataUrl: jpegDataUrl(1080, 1080), rightsConfirmed: true });
  meta.failPublish = { message: 'Media ID is not available', code: 9007, error_user_msg: 'A mídia ainda não está pronta.' };
  const now = await request('/ads/social-posts', 'POST', { caption: 'Promoção do dia', mediaId: jpg.json.data.id });
  assert.equal(now.status, 201, JSON.stringify(now.json));
  assert.equal(now.json.data.status, 'failed');
  assert.ok(now.json.data.error);
  // Enquanto agendada, a imagem é servida pelo link assinado.
  await query(`UPDATE ads_social_posts SET status='scheduled' WHERE id=$1`, [now.json.data.id]);
  const imageUrl = [...meta.calls].reverse().find((call) => call.path === 'IG1/media').params.image_url;
  const served = await fetch(base + new URL(imageUrl).pathname.replace('/api/v1', ''));
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/jpeg');
  await query(`UPDATE ads_social_posts SET status='failed' WHERE id=$1`, [now.json.data.id]);
  const retried = await request(`/ads/social-posts/${now.json.data.id}/retry`, 'POST', {});
  assert.equal(retried.status, 200, JSON.stringify(retried.json));
  assert.equal(retried.json.data.status, 'published');
  // Cancelar: só agendada ou com falha; publicada não.
  assert.equal((await request(`/ads/social-posts/${now.json.data.id}/cancel`, 'POST', {})).status, 409);
  const list = await request('/ads/social-posts');
  assert.ok(list.json.data.length >= 2);
  assert.equal((await request('/ads/social-posts', 'GET', null, 'store-b')).json.data.length, 0);
});
