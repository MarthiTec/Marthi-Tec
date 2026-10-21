import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Busca "kits" / "lotes" / "almoxarifado" / "especificações": nome visível +
 * deep-link /painel/produtos?aba=especificacoes(&espec=…) — sem ressuscitar menu Retaguarda.
 */
const root = process.cwd();
const dirPath = path.join(root, 'apps/web/src/data/screenDirectory.ts');
const erpPath = path.join(root, 'apps/web/src/pages/erp/ErpLayout.tsx');
const navPath = path.join(root, 'apps/web/src/pages/admin/adminNav.ts');

test('sidebar kits/lotes/almox: STOCK_HUB_TABS deep-links to hub espec=', () => {
  const dir = fs.readFileSync(dirPath, 'utf8');
  assert.match(dir, /path: '\/painel\/produtos\?aba=especificacoes',\s*label: 'Especificações'/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=especificacoes&espec=kits',\s*label: 'Kits'/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=especificacoes&espec=lotes',\s*label: 'Lotes \/ Rastro'/);
  assert.match(dir, /path: '\/painel\/produtos\?aba=especificacoes&espec=almoxarifado',\s*label: 'Almoxarifado'/);
  assert.ok(!dir.includes("path: '/erp/kits'"), 'finder must not list standalone /erp/kits');
  assert.ok(!dir.includes("path: '/erp/produtos?aba=especificacoes'"), 'prefer /painel over /erp for finder');
});

test('sidebar kits/lotes/almox: Retaguarda NAV_PRODUCTS dropped relocated items', () => {
  const erp = fs.readFileSync(erpPath, 'utf8');
  const block = erp.slice(erp.indexOf('const NAV_PRODUCTS'), erp.indexOf('const NAV_PEOPLE'));
  assert.equal(block.includes("label: 'Kits'"), false);
  assert.equal(block.includes("label: 'Lotes / Rastro'"), false);
  assert.equal(block.includes("label: 'Almoxarifado'"), false);
  assert.equal(block.includes("label: 'Especificações'"), false);
  assert.match(block, /label: 'Produtos & Estoque'/);
  assert.match(block, /label: 'API de aparelhos'/);
  assert.match(block, /label: 'Notas de estoque'/);
});

test('sidebar kits/lotes/almox: Painel Retaguarda keeps Totem specs only', () => {
  const nav = fs.readFileSync(navPath, 'utf8');
  assert.match(nav, /to: '\/painel\/totem\/especificacoes',\s*label: 'Especificações'/);
  const erpBlock = nav.slice(nav.indexOf("id: 'erp'"), nav.indexOf("id: 'ads'"));
  assert.equal(erpBlock.includes("label: 'Especificações'"), false);
});
