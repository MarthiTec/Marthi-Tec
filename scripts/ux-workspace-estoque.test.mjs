import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const navPath = path.join(root, 'apps/web/src/pages/admin/adminNav.ts');
const hubPath = path.join(root, 'apps/web/src/pages/admin/ProductsStockPage.tsx');
const pathsPath = path.join(root, 'apps/web/src/data/hubPaths.ts');
const appPath = path.join(root, 'apps/web/src/App.tsx');
const dirPath = path.join(root, 'apps/web/src/data/screenDirectory.ts');
const erpLayoutPath = path.join(root, 'apps/web/src/pages/erp/ErpLayout.tsx');

test('Fase A+/B: ProductsStockPage hub with four tabs', () => {
  const hub = fs.readFileSync(hubPath, 'utf8');
  for (const id of ['produtos', 'movimentacoes', 'entradas', 'ajustes']) {
    assert.ok(hub.includes(`id: '${id}'`), `missing tab ${id}`);
  }
  assert.match(hub, /StockPage/);
  assert.match(hub, /StockMovementsPage/);
  assert.match(hub, /StockEntryPage/);
  assert.match(hub, /StockBalancePage/);
  assert.match(hub, /RedirectToProductsStock/);
});

test('Fase A+/B: productsStockPath helper exists', () => {
  const src = fs.readFileSync(pathsPath, 'utf8');
  assert.match(src, /export type StockTab/);
  assert.match(src, /export function productsStockPath/);
});

test('Fase A+/B: Painel menu collapses stock family to hub', () => {
  const nav = fs.readFileSync(navPath, 'utf8');
  const erpBlock = nav.slice(nav.indexOf("id: 'erp'"), nav.indexOf("id: 'ads'"));
  assert.match(erpBlock, /to: '\/painel\/produtos',\s*label: 'Produtos & Estoque'/);
  assert.equal(erpBlock.includes("to: '/erp/entrada-estoque'"), false, 'entrada should not be a separate nav child');
  assert.equal(erpBlock.includes("to: '/erp/balanco'"), false, 'balanço should not be a separate nav child');
  assert.equal(erpBlock.includes("to: '/erp/movimentos'"), false, 'movimentos should not be a separate nav child');
});

test('Fase A+/B: App redirects legacy stock routes into hub abas', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /ProductsStockPage/);
  assert.match(app, /RedirectToProductsStock aba="entradas"/);
  assert.match(app, /RedirectToProductsStock aba="movimentacoes"/);
  assert.match(app, /RedirectToProductsStock aba="ajustes"/);
});

test('Fase A+/B: childIsActive keeps hub active on ?aba=', () => {
  const nav = fs.readFileSync(navPath, 'utf8');
  const fn = nav.slice(nav.indexOf('export function childIsActive'));
  assert.match(fn, /keys\[0\] === 'aba'/);
});

test('Fase A+/B: Finder synonyms live on hub path', () => {
  const dir = fs.readFileSync(dirPath, 'utf8');
  assert.match(dir, /\/erp\/produtos': '[^']*inventario/);
  assert.match(dir, /\/erp\/produtos': '[^']*ajuste de estoque/);
  assert.match(dir, /\/erp\/produtos': '[^']*entrada/);
});

test('Fase A+/B: ERP nav keeps one stock hub entry + advanced features', () => {
  const erp = fs.readFileSync(erpLayoutPath, 'utf8');
  const block = erp.slice(erp.indexOf('const NAV_PRODUCTS'), erp.indexOf('const NAV_PEOPLE'));
  assert.match(block, /to: '\/erp\/produtos'/);
  assert.match(block, /to: '\/erp\/kits'/);
  assert.equal(block.includes("to: '/erp/entrada-estoque'"), false);
  assert.equal(block.includes("to: '/erp/balanco'"), false);
  assert.equal(block.includes("to: '/erp/movimentos'"), false);
});
