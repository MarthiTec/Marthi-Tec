import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync('apps/web/src/data/stockCost.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { inStockCost } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('stock cost uses the entries of the units still on hand, not the average with sold units', () => {
  // 17 PRO MAX prata da Cell Ponto: 7 compras, 5 vendidas; ficaram as de R$ 6.849 e R$ 6.900.
  const entries = [
    { qty: 2, soldQty: 2, unitCost: 6900 },
    { qty: 2, soldQty: 2, unitCost: 7050 },
    { qty: 1, soldQty: 1, unitCost: 6900 },
    { qty: 1, soldQty: 0, unitCost: 6849 },
    { qty: 1, soldQty: 0, unitCost: 6900 },
  ];
  assert.equal(inStockCost(2, 6935.57, entries), 13749);
});

test('units without an entry use the average cost; adjustments below the entries are capped', () => {
  assert.equal(inStockCost(1, 2700, []), 2700);
  assert.equal(inStockCost(3, 1000, [{ qty: 1, unitCost: 1500 }]), 3500);
  assert.equal(inStockCost(1, 0, [{ qty: 2, unitCost: 1000 }]), 1000);
  assert.equal(inStockCost(0, 5000, [{ qty: 1, unitCost: 5000 }]), 0);
});
