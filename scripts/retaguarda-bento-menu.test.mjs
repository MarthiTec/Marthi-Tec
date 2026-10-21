import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dirPath = path.join(root, 'apps/web/src/data/screenDirectory.ts');
const erpLayout = path.join(root, 'apps/web/src/pages/erp/ErpLayout.tsx');
const erpMenu = path.join(root, 'apps/web/src/components/ErpAppsMenu.tsx');
const appsGrid = path.join(root, 'apps/web/src/components/AppsGridMenu.tsx');
const panelMenu = path.join(root, 'apps/web/src/components/PanelAppsMenu.tsx');
const cssPath = path.join(root, 'apps/web/src/components/panelAppsMenu.css');

test('Retaguarda bento: ERP_TOP_SHORTCUTS has the four required tiles', () => {
  const src = fs.readFileSync(dirPath, 'utf8');
  assert.ok(src.includes('export const ERP_TOP_SHORTCUTS'), 'ERP_TOP_SHORTCUTS export');
  for (const fragment of [
    "id: 'api-aparelhos'",
    "path: '/erp/api-aparelhos'",
    "id: 'taxas'",
    "path: '/painel/taxas-cartao'",
    "id: 'relatorios'",
    "path: '/painel/relatorios'",
    "id: 'auditoria'",
    "path: '/erp/auditoria'",
  ]) {
    assert.ok(src.includes(fragment), `missing ${fragment}`);
  }
});

test('Retaguarda bento: shared AppsGridMenu + ErpAppsMenu wired in ErpLayout', () => {
  assert.ok(fs.existsSync(appsGrid), 'AppsGridMenu.tsx');
  assert.ok(fs.existsSync(erpMenu), 'ErpAppsMenu.tsx');
  const layout = fs.readFileSync(erpLayout, 'utf8');
  assert.match(layout, /import \{ ErpAppsMenu \} from/);
  assert.match(layout, /<ErpAppsMenu\s*\/>/);
  const panel = fs.readFileSync(panelMenu, 'utf8');
  assert.match(panel, /AppsGridMenu/);
});

test('Retaguarda bento: CSS covers dark theme + ERP top chrome', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('.is-theme-dark .panel-apps__btn'), 'dark theme trigger');
  assert.ok(css.includes('.erp-app__top .panel-apps__btn'), 'ERP top trigger');
  assert.ok(css.includes('@media (max-width: 600px)'), 'mobile popover');
});
