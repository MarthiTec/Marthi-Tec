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

test('Fase A+/B: ProductsStockPage hub with stock + Especificações tabs', () => {
  const hub = fs.readFileSync(hubPath, 'utf8');
  for (const id of ['produtos', 'movimentacoes', 'entradas', 'ajustes', 'especificacoes']) {
    assert.ok(hub.includes(`id: '${id}'`), `missing tab ${id}`);
  }
  assert.match(hub, /StockPage/);
  assert.match(hub, /StockMovementsPage/);
  assert.match(hub, /StockEntryPage/);
  assert.match(hub, /StockBalancePage/);
  assert.match(hub, /SpecificationsPage/);
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

test('Fase A+/B: childIsActive keeps hub active on ?aba= (+ espec=)', () => {
  const nav = fs.readFileSync(navPath, 'utf8');
  const fn = nav.slice(nav.indexOf('export function childIsActive'));
  assert.match(fn, /key === 'aba' \|\| key === 'espec'/);
  assert.match(fn, /params\.has\('aba'\)/);
});

test('Fase A+/B: Finder synonyms + named deep-links for hub abas', () => {
  const dir = fs.readFileSync(dirPath, 'utf8');
  // Nomes visíveis na busca (STOCK_HUB_TABS) + path painel-native com ?aba=.
  assert.match(dir, /STOCK_HUB_TABS/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=entradas',\s*label: 'Entradas'/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=movimentacoes',\s*label: 'Movimentações'/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=ajustes',\s*label: 'Ajustes'/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=especificacoes',\s*label: 'Especificações'/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=especificacoes&espec=kits',\s*label: 'Kits'/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=especificacoes&espec=lotes',\s*label: 'Lotes \/ Rastro'/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=especificacoes&espec=almoxarifado',\s*label: 'Almoxarifado'/);
  assert.match(dir, /\/painel\/produtos\?aba=entradas': '[^']*entrada/);
  assert.match(dir, /\/painel\/produtos\?aba=ajustes': '[^']*inventario/);
  assert.match(dir, /\/painel\/produtos\?aba=ajustes': '[^']*ajuste de estoque/);
  assert.match(dir, /\/painel\/produtos\?aba=movimentacoes': '[^']*movimentacao/);
  assert.match(dir, /\/painel\/produtos\?aba=especificacoes&espec=kits': '[^']*kits/);
  // Cadastro base não engole mais "entrada" / "kits" (apontam às abas nomeadas).
  assert.equal(
    /\/painel\/produtos': '[^']*\bentrada\b/.test(dir),
    false,
    'entrada must not remain on base /painel/produtos synonyms',
  );
  assert.equal(
    /\/painel\/produtos': '[^']*\bkits\b/.test(dir),
    false,
    'kits must not remain on base /painel/produtos synonyms',
  );
});

test('Fase A+/B: ERP nav keeps one stock hub + non-relocated product items', () => {
  const erp = fs.readFileSync(erpLayoutPath, 'utf8');
  const block = erp.slice(erp.indexOf('const NAV_PRODUCTS'), erp.indexOf('const NAV_PEOPLE'));
  assert.match(block, /to: '\/erp\/produtos'/);
  assert.match(block, /to: '\/erp\/api-aparelhos'/);
  assert.match(block, /to: '\/erp\/notas'/);
  assert.match(block, /to: '\/erp\/tabelas'/);
  assert.equal(block.includes("to: '/erp/kits'"), false);
  assert.equal(block.includes("to: '/erp/lotes'"), false);
  assert.equal(block.includes("to: '/erp/almoxarifado'"), false);
  assert.equal(block.includes("to: '/erp/especificacoes'"), false);
  assert.equal(block.includes("to: '/erp/entrada-estoque'"), false);
  assert.equal(block.includes("to: '/erp/balanco'"), false);
  assert.equal(block.includes("to: '/erp/movimentos'"), false);
});
