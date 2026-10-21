import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const hub = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/ProductsStockPage.tsx'), 'utf8');
const specs = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/SpecificationsPage.tsx'), 'utf8');
const paths = fs.readFileSync(path.join(root, 'apps/web/src/data/hubPaths.ts'), 'utf8');
const stock = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/StockPage.tsx'), 'utf8');
const hubPage = fs.readFileSync(path.join(root, 'apps/web/src/components/HubPage.tsx'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/adminNav.ts'), 'utf8');
const erp = fs.readFileSync(path.join(root, 'apps/web/src/pages/erp/ErpLayout.tsx'), 'utf8');

test('ProductsStockPage has Especificações hub tab embedding specs + support resources', () => {
  assert.match(hub, /id: 'especificacoes'/);
  assert.match(hub, /SpecificationsPage embedded includeSupportResources/);
});

test('SpecificationsPage support tabs reuse Kits/Lots/Warehouse pages', () => {
  assert.match(specs, /id: 'kits'/);
  assert.match(specs, /id: 'lotes'/);
  assert.match(specs, /id: 'almoxarifado'/);
  assert.match(specs, /<KitsPage \/>/);
  assert.match(specs, /<LotsPage \/>/);
  assert.match(specs, /<WarehousePage \/>/);
  assert.match(specs, /includeSupportResources/);
  assert.match(specs, /STOCK_SPECS_PARAM/);
  assert.match(specs, /Produtos & Estoque/);
});

test('hubPaths: productsStockSpecsPath + nested espec param', () => {
  assert.match(paths, /export type StockSpecsTab/);
  assert.match(paths, /STOCK_SPECS_PARAM = 'espec'/);
  assert.match(paths, /export function productsStockSpecsPath/);
  assert.match(paths, /'especificacoes'/);
});

test('HubPage supports nested paramKey and compact embed', () => {
  assert.match(hubPage, /paramKey = 'aba'/);
  assert.match(hubPage, /compact = false/);
  assert.match(hubPage, /hub-page--embedded/);
});

test('StockPage product helpers prefer productsStockSpecsPath (stay in workspace)', () => {
  assert.match(stock, /productsStockSpecsPath\(location\.pathname/);
  assert.equal(stock.includes('specificationsPath(location.pathname'), false);
});

test('Retaguarda/Painel menus drop relocated specs; Totem keeps Especificações', () => {
  assert.match(nav, /to: '\/painel\/totem\/especificacoes',\s*label: 'Especificações'/);
  const erpNav = nav.slice(nav.indexOf("id: 'erp'"), nav.indexOf("id: 'ads'"));
  assert.equal(erpNav.includes("to: '/painel/especificacoes'"), false, 'duplicate Especificações out of Painel Retaguarda');
  const block = erp.slice(erp.indexOf('const NAV_PRODUCTS'), erp.indexOf('const NAV_PEOPLE'));
  assert.match(block, /to: '\/erp\/produtos'/);
  assert.equal(block.includes("to: '/erp/especificacoes'"), false);
  assert.equal(block.includes("to: '/erp/kits'"), false);
  assert.equal(block.includes("to: '/erp/lotes'"), false);
  assert.equal(block.includes("to: '/erp/almoxarifado'"), false);
  assert.match(block, /to: '\/erp\/api-aparelhos'/);
  assert.match(block, /to: '\/erp\/notas'/);
});

test('Legacy kits/lotes/almox/especificacoes redirect into hub Especificações', () => {
  const hub = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/ProductsStockPage.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'apps/web/src/App.tsx'), 'utf8');
  assert.match(hub, /export function RedirectToProductsStockSpecs/);
  assert.match(app, /RedirectToProductsStockSpecs espec="kits"/);
  assert.match(app, /RedirectToProductsStockSpecs espec="lotes"/);
  assert.match(app, /RedirectToProductsStockSpecs espec="almoxarifado"/);
});
