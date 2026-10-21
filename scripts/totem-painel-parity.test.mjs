import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const hubPaths = fs.readFileSync(path.join(root, 'apps/web/src/data/hubPaths.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'apps/web/src/App.tsx'), 'utf8');
const stock = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/StockPage.tsx'), 'utf8');
const attrs = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/AttributesPage.tsx'), 'utf8');
const productsHub = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/ProductsStockPage.tsx'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/adminNav.ts'), 'utf8');

test('productsStockPath is context-aware (totem stays on totem)', () => {
  assert.match(hubPaths, /pathname\.startsWith\('\/painel\/totem'\)/);
  assert.match(hubPaths, /\/painel\/totem\/produtos/);
  assert.match(hubPaths, /\/painel\/produtos/);
  assert.match(hubPaths, /\/erp\/produtos/);
});

test('/painel/produtos hosts ProductsStockPage (no Navigate to /erp)', () => {
  assert.match(app, /path="produtos" element=\{<ProductsStockPage \/>\}/);
  assert.equal(app.includes('path="produtos" element={<Navigate to="/erp/produtos"'), false);
});

test('Totem Catalog does not deep-link Entrada/API to /erp', () => {
  assert.match(stock, /totemSurface \? \(/);
  assert.match(stock, /!totemSurface && catalogFull/);
  assert.equal(/Cadastro completo em <Link to="\/erp\/produtos">/.test(stock), false);
  // api-aparelhos only when not on totem surface
  const apiBlock = stock.slice(stock.indexOf('stock-config-links'));
  assert.match(apiBlock, /!totemSurface && catalogFull/);
});

test('Totem helpers prefer panel specs over /erp/especificacoes', () => {
  assert.match(attrs, /\/painel\/especificacoes\?aba=atributos/);
  assert.equal(attrs.includes('/erp/especificacoes?aba=atributos'), false);
});

test('RedirectToProductsStock respects painel vs erp base', () => {
  assert.match(productsHub, /pathname\.startsWith\('\/painel'\) \? '\/painel\/produtos'/);
});

test('Painel Retaguarda nav points Produtos & Estoque to /painel/produtos', () => {
  const erpBlock = nav.slice(nav.indexOf("id: 'erp'"), nav.indexOf("id: 'ads'"));
  assert.match(erpBlock, /to: '\/painel\/produtos',\s*label: 'Produtos \& Estoque'/);
});
