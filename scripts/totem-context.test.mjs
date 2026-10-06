import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup() {
  const location = { pathname: '/totem', search: '?storeId=store-a' };
  const storage = new Map([['marthi.multi_store.active_store_id.v1', 'stale-store']]);
  const calls = [];
  const modules = {};
  const stubs = {
    '../data/tenantContext': { tenantScopedKey: key => key },
    './tenantContext': { getActiveTenantKey: () => 'default', tenantScopedKey: key => key },
    './config': { nestApiUrl: () => 'https://api.example.test' },
    './http': { readJson: response => response.json() },
  };
  function compile(name, file) {
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, {
      exports, require: path => modules[path] ?? stubs[path],
      window: { location }, URLSearchParams, Headers, TextDecoder, Uint8Array,
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
      fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) }; },
    });
    modules[name] = exports;
    return exports;
  }
  const context = compile('../data/totemContext', 'apps/web/src/data/totemContext.ts');
  modules['./totemContext'] = context;
  const cache = compile('cache', 'apps/web/src/data/storeCache.ts');
  const client = compile('client', 'apps/web/src/services/nestClient.ts');
  return { location, calls, cache, client };
}

test('kiosk link controls settings, catalog, attributes, pickup and order scope despite a stale panel selection', async () => {
  const { client, calls } = setup();
  for (const path of ['/totem/settings', '/totem/catalog', '/totem/attributes', '/totem/pickup-methods', '/totem/leads']) {
    await client.nestRequest(path);
    assert.equal(calls.at(-1).init.headers.get('x-store-id'), 'store-a');
  }
});

test('public settings and catalog caches cannot reuse another store or legacy global keys', () => {
  const { cache, location } = setup();
  const first = cache.storeScopedKey('settings');
  location.search = '?storeId=store-b';
  assert.notEqual(cache.storeScopedKey('settings'), first);
  location.search = '';
  assert.notEqual(cache.storeScopedKey('settings'), 'settings');
});

test('kiosk query cannot override a protected panel request or an explicit caller header', async () => {
  const { client, calls } = setup();
  await client.nestRequest('/stock');
  assert.equal(calls.at(-1).init.headers.get('x-store-id'), 'stale-store');
  await client.nestRequest('/totem/catalog', { headers: { 'x-store-id': 'caller-store' } });
  assert.equal(calls.at(-1).init.headers.get('x-store-id'), 'caller-store');
});
