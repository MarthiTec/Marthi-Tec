import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Busca "entrada" no menu: mostra o nome "Entradas" e deep-link
 * /painel/produtos?aba=entradas (totem/painel — sem forçar /erp).
 */
const root = process.cwd();
const dirPath = path.join(root, 'apps/web/src/data/screenDirectory.ts');
const finderPath = path.join(root, 'apps/web/src/components/SidebarFinder.tsx');
const hubPath = path.join(root, 'apps/web/src/pages/admin/ProductsStockPage.tsx');

test('sidebar entrada: STOCK_HUB_TABS registers Entradas with painel deep-link', () => {
  const dir = fs.readFileSync(dirPath, 'utf8');
  assert.match(dir, /export const STOCK_HUB_TABS/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=entradas',\s*label: 'Entradas'/);
  assert.match(dir, /for \(const tab of STOCK_HUB_TABS\)/);
  assert.match(dir, /\/painel\/produtos\?aba=entradas': '[^']*entrada/);
  assert.ok(!dir.includes("path: '/erp/produtos?aba=entradas'"), 'prefer /painel over /erp for finder');
});

test('sidebar entrada: SidebarFinder still renders screen.label in results', () => {
  const finder = fs.readFileSync(finderPath, 'utf8');
  assert.match(finder, /<strong>\{screen\.label\}<\/strong>/);
  assert.match(finder, /navigate\(screen\.path\)/);
});

test('sidebar entrada: hub reads ?aba=entradas', () => {
  const hub = fs.readFileSync(hubPath, 'utf8');
  assert.match(hub, /id: 'entradas'/);
  assert.match(hub, /label: 'Entradas'/);
});
