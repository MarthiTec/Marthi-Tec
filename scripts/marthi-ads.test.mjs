// Marthi ADS — rotinas críticas. As respostas da Graph API são simuladas SÓ aqui (transporte de teste);
// a interface de produção nunca usa dados simulados.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.META_APP_ID = 'app-123';
process.env.META_APP_SECRET = 'app-secret-xyz';
process.env.META_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
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
await query(`INSERT INTO users(id,client_account_id,email,name,global_role,active) VALUES('user-m','a','m@example.com','user-m','manager',true)`);
await query(`INSERT INTO user_stores(id,user_id,store_id,role) VALUES('membership-m','user-m','store-a','manager')`);
const tokenA = await createSessionToken({ id: 'user-a', email: 'a@example.com', name: 'user-a', role: 'admin', clientAccountId: 'a' });
const tokenB = await createSessionToken({ id: 'user-b', email: 'b@example.com', name: 'user-b', role: 'admin', clientAccountId: 'b' });
const tokenM = await createSessionToken({ id: 'user-m', email: 'm@example.com', name: 'user-m', role: 'manager', clientAccountId: 'a' });
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
async function request(path, method = 'GET', body, store = 'store-a', token = store === 'store-b' ? tokenB : tokenA) {
  const response = await fetch(base + path, { method, redirect: 'manual', headers: { authorization: 'Bearer ' + token, 'x-store-id': store, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, json, location: response.headers.get('location') };
}
after(() => {
  setGraphTransportForTests(null);
  server.close();
});

// ── Meta simulada (só no teste) ────────────────────────────────
const meta = {
  calls: [],
  pages: [{ id: 'PAGE1', name: 'Cell Ponto', tasks: ['ADVERTISE', 'ANALYZE'], access_token: 'PAGE-TOKEN', instagram_business_account: { id: 'IG1', username: 'cellponto' } }],
  accounts: [{ id: 'act_111', account_id: '111', name: 'Conta Cell', account_status: 1, currency: 'BRL', timezone_name: 'America/Sao_Paulo' }],
  permissions: ['ads_management', 'ads_read', 'pages_show_list', 'pages_read_engagement', 'pages_manage_ads'],
  created: { campaigns: [], adsets: [], adcreatives: [], ads: [] },
  status: {},
  failNext: null, // { match: RegExp, kind: 'timeout'|'error', error }
  adStatus: { effective_status: 'PENDING_REVIEW' },
  insights: [],
};
let seq = 0;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function readParams(url, init) {
  const params = Object.fromEntries(url.searchParams.entries());
  if (init?.body instanceof URLSearchParams) Object.assign(params, Object.fromEntries(init.body.entries()));
  if (init?.body instanceof FormData) for (const [k, v] of init.body.entries()) params[k] = typeof v === 'string' ? v : '[file]';
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && /^[[{]/.test(v)) { try { params[k] = JSON.parse(v); } catch {} }
  return params;
}
setGraphTransportForTests(async (input, init = {}) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v\d+\.\d+\//, '');
  const method = init.method ?? 'GET';
  const params = readParams(url, init);
  meta.calls.push({ method, path, params });
  if (meta.failNext && meta.failNext.match.test(`${method} ${path}`)) {
    const fail = meta.failNext;
    meta.failNext = null;
    if (fail.kind === 'timeout') {
      if (fail.createAnyway) fail.createAnyway(params);
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
    return json({ error: fail.error }, 400);
  }
  if (path === 'oauth/access_token') return json(params.grant_type === 'fb_exchange_token' ? { access_token: 'LONG-USER-TOKEN', expires_in: 5184000 } : { access_token: 'SHORT-TOKEN', expires_in: 3600 });
  if (path === 'me' && method === 'GET') return json({ id: 'FBUSER1', name: 'Mariana' });
  if (path === 'me/permissions' && method === 'GET') return json({ data: meta.permissions.map((permission) => ({ permission, status: 'granted' })) });
  if (path === 'me/permissions' && method === 'DELETE') return json({ success: true });
  if (path === 'me/accounts') return json({ data: meta.pages });
  if (path === 'me/adaccounts') return json({ data: meta.accounts });
  if (/^act_\d+$/.test(path) && method === 'GET') return json(meta.accounts.find((a) => a.id === path));
  if (/^act_\d+\/adimages$/.test(path)) return json({ images: { 'produto.png': { hash: 'HASH1' } } });
  const create = path.match(/^act_\d+\/(campaigns|adsets|adcreatives|ads)$/);
  if (create && method === 'POST') {
    const id = `${create[1].toUpperCase()}-${++seq}`;
    meta.created[create[1]].push({ id, ...params });
    return json({ id });
  }
  if (create && method === 'GET') {
    const marker = params.filtering?.[0]?.value ?? '';
    return json({ data: meta.created[create[1]].filter((item) => String(item.name).includes(marker)).map((item) => ({ id: item.id, name: item.name })) });
  }
  if (path === 'search') return json({ data: [{ key: '2402451', name: 'Volta Redonda', region: 'Rio de Janeiro' }] });
  if (/\/insights$/.test(path)) return json({ data: meta.insights });
  if (method === 'POST' && /^(CAMPAIGNS|ADSETS|ADS)-\d+$/.test(path)) {
    meta.status[path] = params.status ?? meta.status[path];
    return json({ success: true });
  }
  if (method === 'GET' && /^ADS-\d+$/.test(path)) return json({ status: 'PAUSED', configured_status: 'PAUSED', ...meta.adStatus });
  if (method === 'GET' && /^CAMPAIGNS-\d+$/.test(path)) return json({ effective_status: meta.status[path] ?? 'PAUSED' });
  return json({ error: { message: `rota simulada não tratada: ${method} ${path}`, code: 100 } }, 400);
}, 0);

async function connectStore(store = 'store-a', token = tokenA) {
  const start = await request('/ads/meta/connect', 'POST', {}, store, token);
  assert.equal(start.status, 200, JSON.stringify(start.json));
  const state = new URL(start.json.data.url).searchParams.get('state');
  const back = await fetch(`${base}/ads/meta/callback?code=CODE&state=${state}`, { redirect: 'manual' });
  return { start, state, back };
}

async function productWithVariations() {
  const product = await request('/stock', 'POST', {
    name: 'IPHONE 15 PRO MAX',
    kind: 'device',
    qty: 0,
    price: 6000,
    cost: 1,
    imei: '359999999999999',
    images: ['data:image/png;base64,' + pngBase64(1080, 1080)],
    variations: [
      { attrs: { ATTR1: 'Preto' }, price: 6200, cost: 5000, qty: 1, minQty: 0, condition: 'used', batteryLevel: 88, imei: '351111111111111' },
      { attrs: { ATTR1: 'Azul' }, price: 6400, cost: 5100, qty: 1, minQty: 0, condition: 'new', imei: '352222222222222' },
    ],
  });
  assert.equal(product.status, 201, JSON.stringify(product.json));
  return product.json.data;
}

/** PNG mínimo válido com as dimensões pedidas (só o cabeçalho importa para a validação). */
function pngBase64(width, height) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const size = Buffer.alloc(8);
  size.writeUInt32BE(width, 0);
  size.writeUInt32BE(height, 4);
  return Buffer.concat([header, size, Buffer.alloc(20)]).toString('base64');
}

test('connection: only admin connects; state is single-use; token is stored encrypted; Page without ADVERTISE is refused; health explains blocked ad account', async () => {
  assert.equal((await request('/ads/meta/connect', 'POST', {}, 'store-a', tokenM)).status, 403, 'manager cannot connect');
  const { start, state, back } = await connectStore();
  const url = new URL(start.json.data.url);
  assert.equal(url.origin + url.pathname, 'https://www.facebook.com/v26.0/dialog/oauth');
  assert.equal(url.searchParams.get('scope'), 'ads_management,ads_read,pages_show_list,pages_read_engagement,pages_manage_ads');
  assert.equal(back.status, 302);
  assert.match(back.headers.get('location'), /\/painel\/ads\/contas\?meta=ok$/);
  // State reutilizado é recusado.
  const again = await fetch(`${base}/ads/meta/callback?code=CODE&state=${state}`, { redirect: 'manual' });
  assert.match(again.headers.get('location'), /meta=erro/);
  const row = (await query(`SELECT * FROM ads_connections WHERE store_id = 'store-a'`)).rows[0];
  assert.equal(row.status, 'connected');
  assert.ok(row.token_enc && !row.token_enc.includes('LONG-USER-TOKEN'), 'token encrypted');
  const status = await request('/ads/status');
  assert.ok(!JSON.stringify(status.json).includes('LONG-USER-TOKEN') && !JSON.stringify(status.json).includes('token_enc'), 'token never leaves the server');

  meta.pages.push({ id: 'PAGE2', name: 'Sem anúncio', tasks: ['ANALYZE'], access_token: 'X' });
  assert.equal((await request('/ads/meta/assets', 'PUT', { pageId: 'PAGE2', adAccountId: 'act_111' })).status, 400);
  meta.accounts[0].account_status = 3;
  const blocked = await request('/ads/meta/assets', 'PUT', { pageId: 'PAGE1', adAccountId: 'act_111' });
  assert.equal(blocked.status, 200, JSON.stringify(blocked.json));
  assert.equal(blocked.json.data.canAdvertise, false);
  assert.match(blocked.json.data.checks.find((c) => c.id === 'ad_account').help, /pagamento/i);
  meta.accounts[0].account_status = 1;
  const ok = await request('/ads/meta/health');
  assert.equal(ok.json.data.canAdvertise, true, JSON.stringify(ok.json.data.checks));
});

test('draft from a product: variation required; public data never carries IMEI, cost or supplier; stores are isolated', async () => {
  const product = await productWithVariations();
  const noVariation = await request('/ads/campaigns', 'POST', { productId: product.id });
  assert.equal(noVariation.status, 400);
  const variation = product.variations.find((v) => v.attrs.ATTR1 === 'Preto');
  const draft = await request('/ads/campaigns', 'POST', { productId: product.id, variationId: variation.id });
  assert.equal(draft.status, 201, JSON.stringify(draft.json));
  const text = JSON.stringify(draft.json.data);
  for (const secret of ['351111111111111', '359999999999999', '"cost"', 'avgCost', 'supplier']) assert.ok(!text.includes(secret), `leaked ${secret}`);
  assert.equal(draft.json.data.offer.price, 6200);
  assert.equal(draft.json.data.offer.conditionLabel, 'Usado');
  assert.equal(draft.json.data.offer.batteryLevel, 88);
  assert.match(draft.json.data.destinationUrl, /^https:\/\/loja\.example\.com\/oferta\/store-a\//);
  const pub = await fetch(`${base}/public/offers/store-a/${product.id}?v=${variation.id}`).then((r) => r.json());
  assert.ok(!JSON.stringify(pub).includes('351111111111111') && !JSON.stringify(pub).includes('"cost"'));
  // Isolamento: outra loja não vê nem mexe.
  assert.ok(!(await request('/ads/campaigns', 'GET', undefined, 'store-b')).json.data.some((c) => c.id === draft.json.data.id));
  assert.equal((await request(`/ads/campaigns/${draft.json.data.id}`, 'GET', undefined, 'store-b')).status, 404);
  assert.equal((await request(`/ads/campaigns/${draft.json.data.id}/submit`, 'POST', { confirm: true, submitKey: 'other-store-key' }, 'store-b')).status, 404);
});

test('submit: creates campaign, ad set, creative and ad PAUSED, saves the ids; duplicate submit does not create again; timeout reconciles instead of duplicating', async () => {
  const product = await productWithVariations();
  const variation = product.variations[0];
  const draft = (await request('/ads/campaigns', 'POST', { productId: product.id, variationId: variation.id })).json.data;
  const before = { ...meta.created };
  // Timeout no POST da campanha, mas a Meta criou: na nova tentativa o Marthi acha pela marca.
  meta.failNext = { match: /^POST act_111\/campaigns$/, kind: 'timeout', createAnyway: (params) => meta.created.campaigns.push({ id: `CAMPAIGNS-${++seq}`, ...params }) };
  const first = await request(`/ads/campaigns/${draft.id}/submit`, 'POST', { confirm: true, submitKey: 'key-1-abcdef' });
  assert.equal(first.status, 409, JSON.stringify(first.json));
  assert.match(first.json.error?.message ?? first.json.message ?? '', /demorou/);
  const campaignsAfterTimeout = meta.created.campaigns.length;
  const second = await request(`/ads/campaigns/${draft.id}/submit`, 'POST', { confirm: true, submitKey: 'key-1-abcdef' });
  assert.equal(second.status, 200, JSON.stringify(second.json));
  assert.equal(meta.created.campaigns.length, campaignsAfterTimeout, 'campaign not duplicated after timeout');
  const c = second.json.data;
  assert.equal(c.submitState, 'submitted');
  assert.ok(c.external.campaign_id && c.external.adset_id && c.external.creative_id && c.external.ad_id);
  const camp = meta.created.campaigns.find((x) => x.id === c.external.campaign_id);
  assert.equal(camp.status, 'PAUSED');
  assert.equal(camp.objective, 'OUTCOME_TRAFFIC');
  assert.deepEqual(camp.special_ad_categories, []);
  const adset = meta.created.adsets.find((x) => x.id === c.external.adset_id);
  assert.equal(adset.status, 'PAUSED');
  assert.equal(adset.optimization_goal, 'LINK_CLICKS');
  assert.equal(Number(adset.daily_budget), 2000);
  assert.deepEqual(adset.targeting.publisher_platforms, ['facebook']);
  assert.equal(adset.targeting.targeting_automation.advantage_audience, 0);
  const creative = meta.created.adcreatives.find((x) => x.id === c.external.creative_id);
  assert.equal(creative.object_story_spec.page_id, 'PAGE1');
  assert.equal(creative.object_story_spec.link_data.image_hash, 'HASH1');
  assert.match(creative.object_story_spec.link_data.link, /\/oferta\/store-a\//);
  assert.equal(meta.created.ads.find((x) => x.id === c.external.ad_id).status, 'PAUSED');
  assert.equal(c.display.key, 'review', 'new ad is under review at Meta');
  // Clique duplo / repetição: mesma chave não cria nada; outra chave é recusada.
  const counts = JSON.stringify(Object.fromEntries(Object.entries(meta.created).map(([k, v]) => [k, v.length])));
  assert.equal((await request(`/ads/campaigns/${draft.id}/submit`, 'POST', { confirm: true, submitKey: 'key-1-abcdef' })).status, 200);
  assert.equal((await request(`/ads/campaigns/${draft.id}/submit`, 'POST', { confirm: true, submitKey: 'key-2-abcdef' })).status, 409);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(meta.created).map(([k, v]) => [k, v.length]))), counts);
  void before;
});

test('activation needs admin, explicit confirmation and the exact budget; pause works; requested x effective status are separate', async () => {
  const c = (await request('/ads/campaigns')).json.data.find((x) => x.submitState === 'submitted');
  assert.equal((await request(`/ads/campaigns/${c.id}/activate`, 'POST', { confirm: true, acknowledgedBudgetMinor: 2000 }, 'store-a', tokenM)).status, 403, 'manager cannot authorize spend');
  assert.equal((await request(`/ads/campaigns/${c.id}/activate`, 'POST', { acknowledgedBudgetMinor: 2000 })).status, 400);
  assert.equal((await request(`/ads/campaigns/${c.id}/activate`, 'POST', { confirm: true, acknowledgedBudgetMinor: 999 })).status, 409);
  meta.adStatus = { effective_status: 'ACTIVE' };
  const active = await request(`/ads/campaigns/${c.id}/activate`, 'POST', { confirm: true, acknowledgedBudgetMinor: 2000 });
  assert.equal(active.status, 200, JSON.stringify(active.json));
  assert.equal(meta.status[c.external.campaign_id], 'ACTIVE');
  assert.equal(meta.status[c.external.ad_id], 'ACTIVE');
  assert.equal(active.json.data.requestedStatus, 'active');
  assert.equal(active.json.data.display.key, 'active');
  const paused = await request(`/ads/campaigns/${c.id}/pause`, 'POST', {});
  assert.equal(paused.status, 200);
  assert.equal(meta.status[c.external.campaign_id], 'PAUSED');
  assert.equal(paused.json.data.requestedStatus, 'paused');
  assert.equal(paused.json.data.display.key, 'paused');
});

test('rejection shows the reason and allows fixing and resubmitting the creative; insights distinguish "no data" from zero', async () => {
  const c = (await request('/ads/campaigns')).json.data.find((x) => x.submitState === 'submitted');
  meta.adStatus = { effective_status: 'DISAPPROVED', ad_review_feedback: { global: { 'Texto enganoso': 'O anúncio promete algo que a página não mostra.' } } };
  const synced = await request(`/ads/campaigns/${c.id}/sync`, 'POST', {});
  assert.equal(synced.json.data.display.key, 'rejected');
  assert.ok(JSON.stringify(synced.json.data.reviewFeedback).includes('Texto enganoso'));
  await request(`/ads/campaigns/${c.id}`, 'PUT', { content: { ...synced.json.data.content, message: 'iPhone 15 Pro Max usado, bateria 88%.' } });
  meta.adStatus = { effective_status: 'PENDING_REVIEW' };
  const creatives = meta.created.adcreatives.length;
  const resent = await request(`/ads/campaigns/${c.id}/resubmit`, 'POST', {});
  assert.equal(resent.status, 200, JSON.stringify(resent.json));
  assert.equal(meta.created.adcreatives.length, creatives + 1);
  assert.equal(resent.json.data.display.key, 'review');

  meta.insights = [];
  const empty = await request(`/ads/campaigns/${c.id}/insights?preset=last_7d`);
  assert.equal(empty.json.data.data, null, 'no data is not zero');
  meta.insights = [{ spend: '12.34', impressions: '1500', reach: '1200', clicks: '40', inline_link_clicks: '30', ctr: '2.6', cpc: '0.31', cpm: '8.22', frequency: '1.25' }];
  const filled = await request(`/ads/campaigns/${c.id}/insights?preset=last_7d`);
  assert.equal(filled.json.data.data.spend, '12.34');
  assert.ok(filled.json.data.fetchedAt);
  assert.equal(filled.json.data.conversionsTracked, false);
});

test('expired token: Meta error 190 marks the connection for reconnection and nothing is reported as sent', async () => {
  const product = await productWithVariations();
  const draft = (await request('/ads/campaigns', 'POST', { productId: product.id, variationId: product.variations[1].id })).json.data;
  meta.failNext = { match: /^POST act_111\/adsets$/, kind: 'error', error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190, error_subcode: 463 } };
  const res = await request(`/ads/campaigns/${draft.id}/submit`, 'POST', { confirm: true, submitKey: 'key-expired-1' });
  assert.equal(res.status, 422, JSON.stringify(res.json));
  const campaign = (await request(`/ads/campaigns/${draft.id}`)).json.data;
  assert.equal(campaign.submitState, 'error');
  assert.ok(!campaign.external.ad_id);
  assert.match(campaign.lastError, /Conecte de novo|expirou/);
  assert.equal((await query(`SELECT status FROM ads_connections WHERE store_id = 'store-a'`)).rows[0].status, 'needs_reconnect');
  // Reconectar resolve.
  await connectStore();
  assert.equal((await query(`SELECT status FROM ads_connections WHERE store_id = 'store-a'`)).rows[0].status, 'connected');
});

test('data deletion callback: valid signed_request wipes tokens; forged signature is refused; disconnect revokes', async () => {
  const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: 'FBUSER1', issued_at: 1 })).toString('base64url');
  const forged = await fetch(`${base}/ads/meta/data-deletion`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `signed_request=${'AAAA'}.${payload}` });
  assert.equal(forged.status, 400);
  const sig = createHmac('sha256', 'app-secret-xyz').update(payload).digest('base64url');
  const ok = await fetch(`${base}/ads/meta/data-deletion`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `signed_request=${sig}.${payload}` });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.ok(body.confirmation_code && body.url.includes(body.confirmation_code));
  const row = (await query(`SELECT status, token_enc FROM ads_connections WHERE store_id = 'store-a'`)).rows[0];
  assert.equal(row.status, 'revoked');
  assert.equal(row.token_enc, null);
  await connectStore();
  assert.equal((await request('/ads/meta/connection', 'DELETE', undefined, 'store-a', tokenM)).status, 403);
  assert.equal((await request('/ads/meta/connection', 'DELETE')).status, 200);
  assert.ok(meta.calls.some((call) => call.method === 'DELETE' && call.path === 'me/permissions'));
  assert.equal((await query(`SELECT token_enc FROM ads_connections WHERE store_id = 'store-a'`)).rows[0].token_enc, null);
});
