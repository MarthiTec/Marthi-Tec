/**
 * Guard: product cadastro simplicity + sticky description after hub wrap (#55).
 * Hard rule: Identificação lean, marca→tipo→modelo, sticky name, specs off first screen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stock = readFileSync('apps/web/src/pages/admin/StockPage.tsx', 'utf8');
const css = readFileSync('apps/web/src/pages/admin/admin.css', 'utf8');
const hub = readFileSync('apps/web/src/pages/admin/ProductsStockPage.tsx', 'utf8');

test('hub wraps StockPage (does not replace cadastro)', () => {
  assert.match(hub, /render:\s*\(\)\s*=>\s*<StockPage\s*\/>/);
  assert.match(hub, /id: 'produtos'/);
});

test('simple Identificação keeps Marca → Tipo → Modelo cascade', () => {
  assert.match(stock, /label="Marca"/);
  assert.match(stock, /label="Tipo"/);
  assert.match(stock, /label="Modelo"/);
  assert.match(stock, /applyCatalogName/);
  assert.match(stock, /stock-simple-description/);
  assert.match(stock, /placeholder="Escolha a marca, o tipo e o modelo \(ou digite\)"/);
});

test('simple mode parks supplier/group/codes on Especificações tab', () => {
  assert.match(stock, /\{ id: 'specs', label: 'Especificações' \}/);
  assert.match(stock, /ficam na aba .*Especificações/);
  assert.match(stock, /const specsNode/);
  assert.ok(stock.includes('formTab === \'specs\' ? specsNode'));
});

test('variations: compact view + Mais detalhes; edit keeps full fields', () => {
  assert.match(stock, /const compactView = readOnly/);
  assert.match(stock, /Mais detalhes/);
  assert.match(stock, /Ocultar detalhes/);
  assert.match(stock, /is-compact-view/);
});

test('sticky description CSS survives hub nesting (overflow trap)', () => {
  assert.match(css, /\.stock-simple-description\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.admin-page\.admin-page--stock-form\s*\{[^}]*overflow:\s*visible\s*!important/s);
  // Ancestor hub .admin-page must not keep overflow-x:hidden while form is open.
  assert.match(css, /\.admin-page:has\(\.admin-page--stock-form\)\s*\{[^}]*overflow:\s*visible\s*!important/s);
  assert.match(css, /\.admin__workspace:has\(\.admin-page--stock-form\)\s*\.admin__main\s*\{[^}]*overflow:\s*visible\s*!important/s);
});

test('brands blip message clears on reload + one retry (does not block cadastro)', () => {
  const brands = readFileSync('apps/web/src/data/brandStore.ts', 'utf8');
  assert.match(brands, /setError\(''\)/);
  assert.match(brands, /attempt < 2/);
  // Error is advisory next to Gerenciar marcas — form fields stay usable.
  assert.match(stock, /brandsError && <span role="alert"/);
});
