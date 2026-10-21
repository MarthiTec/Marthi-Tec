import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('F2: finance advance apply/refund use ConfirmDialog', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/FinancePage.tsx'), 'utf8');
  assert.match(src, /useConfirmDialog/);
  assert.match(src, /Estornar antecipação/);
  assert.match(src, /Aplicar antecipação/);
  assert.match(src, /await confirm\(/);
});

test('F2: OS part reverse confirms before removeLine', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/WorkOrderDetailPage.tsx'), 'utf8');
  assert.match(src, /Estornar peça da OS/);
  assert.match(src, /await confirm\(/);
});

test('F2: stock movement submit confirms', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/pages/erp/StockMovementsPage.tsx'), 'utf8');
  assert.match(src, /Confirmar movimento de estoque/);
  assert.match(src, /await confirm\(/);
});

test('F2: totem discard and dirty external sale cancel confirm', () => {
  const totem = fs.readFileSync(path.join(root, 'apps/web/src/pages/caixa/CaixaPanels.tsx'), 'utf8');
  assert.match(totem, /Descartar pedido do totem/);
  const sale = fs.readFileSync(path.join(root, 'apps/web/src/pages/admin/ExternalSalePage.tsx'), 'utf8');
  assert.match(sale, /isFormDirty/);
  assert.match(sale, /Cancelar venda externa/);
  assert.match(sale, /await confirm\(/);
});
