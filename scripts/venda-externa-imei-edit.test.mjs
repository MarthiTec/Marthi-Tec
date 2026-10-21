import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('AdminPicker supports clearable and creatable for correction flows', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/components/AdminPicker.tsx'), 'utf8');
  assert.match(src, /clearable\??:\s*boolean/);
  assert.match(src, /creatable\??:\s*boolean/);
  assert.match(src, /admin-picker__clear/);
  assert.match(src, /Usar «/);
});

test('Venda externa correction: IMEI picker can clear/paste and cancel exits ?edit=', () => {
  const sale = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/ExternalSalePage.tsx'), 'utf8');
  assert.match(sale, /clearable=\{Boolean\(editing\)\}/);
  assert.match(sale, /creatable=\{Boolean\(editing\)\}/);
  assert.match(sale, /Limpar IMEI/);
  assert.match(sale, /Buscar, digitar ou colar IMEI/);
  // Discard must leave correction mode: do not clear openedEditRef before deleting ?edit=
  assert.match(sale, /async function cancelEdit\(\)/);
  assert.match(sale, /Não zerar openedEditRef antes de remover \?edit=/);
  assert.match(sale, /next\.delete\('edit'\)/);
  assert.match(sale, /a correção será encerrada/);
  // Mid-correction, pasted IMEI must survive attribute changes
  assert.match(sale, /if \(editing && current\?\.trim\(\)\) return current\.trim\(\)/);
});
