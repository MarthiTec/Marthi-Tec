import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';

const esm = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const source = esm('apps/web/src/data/saleVariation.ts')
  .replace("'./productCondition'", JSON.stringify(url(esm('apps/web/src/data/productCondition.ts'))))
  .replace("'./stockSearch'", JSON.stringify(url(esm('apps/web/src/data/stockSearch.ts'))));
const { restoreSaleUnits, availableImeis, lineVariation } = await import(url(source));

const product = {
  id: 'p1', qty: 0,
  variations: [
    { attrs: { cor: 'Azul' }, condition: 'new', qty: 0, supplierEntries: [{ qty: 1, soldQty: 1, imeis: ['111'], soldImeis: [{ imei: '111', saleId: 'VND-1', soldAt: '' }] }] },
    { attrs: { cor: 'Prata' }, condition: 'new', qty: 1, supplierEntries: [{ qty: 2, soldQty: 1, imeis: ['222', '333'], soldImeis: [{ imei: '222', saleId: 'VND-2', soldAt: '' }] }] },
  ],
};

test('correcting a sale gives its own devices back to the on-screen stock, and only them', () => {
  const [restored] = restoreSaleUnits([product], 'VND-1', [{ stockId: 'p1', qty: 1, imei: '111', attributes: [{ id: 'cor', value: 'Azul' }] }]);
  assert.equal(restored.qty, 1);
  const azul = lineVariation(restored, [{ id: 'cor', value: 'Azul' }]);
  assert.ok(azul, 'the sold-out variation is selectable again');
  assert.deepEqual(availableImeis(restored, azul), ['111']);
  // A venda de outra pessoa continua vendida.
  assert.deepEqual(availableImeis(restored, restored.variations[1]), ['333']);
  assert.equal(product.variations[0].qty, 0, 'original list is not mutated');
});
