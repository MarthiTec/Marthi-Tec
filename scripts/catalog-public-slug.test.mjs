/**
 * Regressão do link curto /c/{slug}: resolução token|slug e proxy público
 * não pode devolver "Token ausente ou inválido." para rotas /api/v1/public/*.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

const RESERVED = new Set(['painel', 'catalogo', 'login', 'c', 'api', 'totem']);

function catalogPublicSlugify(input) {
  const base = String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'catalogo';
}

function isValidCatalogPublicSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 2 && slug.length <= 48 && !RESERVED.has(slug);
}

async function findSalesCatalogByPublicKey(db, key) {
  const raw = String(key ?? '').trim().slice(0, 64);
  if (!raw) return null;
  const byToken = (await db.query('token', [raw])).rows[0];
  if (byToken) return byToken;
  const slug = catalogPublicSlugify(raw);
  if (!slug) return null;
  return (await db.query('slug', [slug])).rows[0] ?? null;
}

test('catalogPublicSlugify normalizes store names', () => {
  assert.equal(catalogPublicSlugify('Cell Ponto'), 'cell-ponto');
  assert.equal(catalogPublicSlugify('  Célula!!Ponto  '), 'celula-ponto');
  assert.equal(catalogPublicSlugify(''), 'catalogo');
});

test('isValidCatalogPublicSlug accepts cell-ponto', () => {
  assert.equal(isValidCatalogPublicSlug('cell-ponto'), true);
  assert.equal(isValidCatalogPublicSlug('a'), false);
  assert.equal(isValidCatalogPublicSlug('painel'), false);
});

test('findSalesCatalogByPublicKey resolves token or slug; empty is null', async () => {
  const rows = [
    { id: 'CAT-1', token: 'longTokenValue123', public_slug: 'cell-ponto' },
    { id: 'CAT-2', token: 'otherToken', public_slug: 'outra-loja' },
  ];
  const db = {
    async query(kind, params = []) {
      if (kind === 'token') return { rows: rows.filter((r) => r.token === params[0]) };
      return { rows: rows.filter((r) => String(r.public_slug).toLowerCase() === String(params[0]).toLowerCase()) };
    },
  };
  assert.equal(await findSalesCatalogByPublicKey(db, ''), null);
  assert.equal(await findSalesCatalogByPublicKey(db, '   '), null);
  assert.equal((await findSalesCatalogByPublicKey(db, 'longTokenValue123'))?.id, 'CAT-1');
  assert.equal((await findSalesCatalogByPublicKey(db, 'cell-ponto'))?.id, 'CAT-1');
  assert.equal((await findSalesCatalogByPublicKey(db, 'CELL-PONTO'))?.id, 'CAT-1');
  assert.equal(await findSalesCatalogByPublicKey(db, 'missing-slug'), null);
});

test('catalogShareUrl prefers slug and never builds empty /catalogo/', async () => {
  const { pathToFileURL } = await import('node:url');
  // Lógica espelhada de salesCatalogApi.catalogShareUrl (sem window).
  const catalogShareUrl = (catalog, origin = 'https://marthi-totem.discloud.dev') => {
    const slug = String(catalog.publicSlug ?? '').trim();
    if (slug) return `${origin}/c/${encodeURIComponent(slug)}`;
    const token = String(catalog.token ?? '').trim();
    if (token) return `${origin}/catalogo/${encodeURIComponent(token)}`;
    return '';
  };
  assert.equal(catalogShareUrl({ publicSlug: 'cell-ponto', token: 'abc' }), 'https://marthi-totem.discloud.dev/c/cell-ponto');
  assert.equal(catalogShareUrl({ publicSlug: '', token: 'abc' }), 'https://marthi-totem.discloud.dev/catalogo/abc');
  assert.equal(catalogShareUrl({ publicSlug: '', token: '' }), '');
  assert.ok(pathToFileURL);
});

test('unmatched /api/v1/public/* must not surface auth Token ausente', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync('apps/api/src/middlewares/nestProxy.ts', 'utf8'));
  assert.match(src, /api\/v1\/public/);
  assert.match(src, /Rota pública não encontrada/);
  assert.doesNotMatch(src.split('if (path.startsWith')[1]?.slice(0, 400) ?? '', /Token ausente ou inválido/);

  // Espelho da guarda em nestProxy: paths públicos sem handler → 404, nunca requireAuth.
  const guard = (originalUrl) => {
    const path = String(originalUrl || '').split('?')[0] || '';
    if (path.startsWith('/api/v1/public/') || path === '/api/v1/public') {
      return { status: 404, message: 'Rota pública não encontrada.' };
    }
    return { status: 401, message: 'Token ausente ou inválido.' };
  };
  assert.equal(guard('/api/v1/public/sales-catalogs/').message, 'Rota pública não encontrada.');
  assert.equal(guard('/api/v1/public/sales-catalogs/cell-ponto/not-a-route').status, 404);
  assert.equal(guard('/api/v1/sales-catalogs').message, 'Token ausente ou inválido.');
});
