import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const web = (...parts) => path.join(root, 'apps/web/src', ...parts);

test('Fase C: no residual native <select> in apps/web src', () => {
  const srcRoot = web();
  const hits = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
        continue;
      }
      if (!/\.(tsx|jsx)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (/<select[\s>]/.test(text)) hits.push(path.relative(root, full));
    }
  }
  walk(srcRoot);
  assert.deepEqual(hits, [], `native <select> still present: ${hits.join(', ')}`);
});

test('Fase C: RepairServices + CatalogCheckout use AdminPicker from design-system', () => {
  const repairs = fs.readFileSync(web('pages/os/RepairServicesPage.tsx'), 'utf8');
  const checkout = fs.readFileSync(web('components/CatalogCheckout.tsx'), 'utf8');
  assert.match(repairs, /from ['"]\.\.\/\.\.\/design-system['"]/);
  assert.match(repairs, /AdminPicker/);
  assert.match(repairs, /CrudRowActions/);
  assert.doesNotMatch(repairs, /<select[\s>]/);
  assert.match(checkout, /from ['"]\.\.\/design-system['"]/);
  assert.match(checkout, /AdminPicker/);
  assert.doesNotMatch(checkout, /<select[\s>]/);
});

test('Fase C: kits / fiscal class / warehouse / cfop / lots use HeadingFormActions + DS imports', () => {
  for (const rel of [
    'pages/admin/KitsPage.tsx',
    'pages/admin/FiscalClassPage.tsx',
    'pages/admin/WarehousePage.tsx',
    'pages/admin/CfopPage.tsx',
    'pages/admin/LotsPage.tsx',
  ]) {
    const text = fs.readFileSync(web(rel), 'utf8');
    assert.match(text, /from ['"]\.\.\/\.\.\/design-system['"]/, rel);
    assert.match(text, /HeadingFormActions/, rel);
  }
});

test('Fase C: CRUD grids gained CrudRowActions where APIs allow', () => {
  for (const rel of [
    'pages/admin/KitsPage.tsx',
    'pages/admin/FiscalClassPage.tsx',
    'pages/admin/WarehousePage.tsx',
    'pages/admin/CfopPage.tsx',
  ]) {
    const text = fs.readFileSync(web(rel), 'utf8');
    assert.match(text, /CrudRowActions/, rel);
    assert.match(text, /confirmDelete/, rel);
  }
});

test('Fase C: fiscalCatalog exposes deleteKit + deleteWarehouse', () => {
  const catalog = fs.readFileSync(web('data/fiscalCatalog.ts'), 'utf8');
  assert.match(catalog, /export async function deleteKit/);
  assert.match(catalog, /export async function deleteWarehouse/);
  assert.match(catalog, /apiDeleteKit/);
  assert.match(catalog, /apiDeleteWarehouse/);
});
