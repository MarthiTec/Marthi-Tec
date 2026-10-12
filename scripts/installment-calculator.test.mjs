import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(fs.readFileSync('apps/web/src/data/installmentCalculator.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { simulateInstallments, roundUpCents } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('same result as the store spreadsheet: R$ 2.100 in 7x at 10% = 7x de R$ 330,00', () => {
  assert.deepEqual(simulateInstallments(2100, 7, 10), { parcels: 7, ratePercent: 10, total: 2310, installment: 330, interest: 210 });
});

test('total and installment are rounded up to the cent, like ARREDONDAR.PARA.CIMA', () => {
  const r = simulateInstallments(4400, 18, 18.16);
  assert.equal(r.total, 5199.04);
  assert.equal(r.installment, 288.84); // 5199,04 / 18 = 288,8355… → 288,84
  assert.equal(roundUpCents(2310), 2310, 'an exact value is not pushed up by floating point');
  assert.equal(roundUpCents(0.1 + 0.2), 0.3);
});

test('installments stay between 1x and 18x and a missing rate means no interest', () => {
  assert.equal(simulateInstallments(1000, 30, 0).parcels, 18);
  assert.equal(simulateInstallments(1000, 0, 0).parcels, 1);
  assert.deepEqual(simulateInstallments(1000, 1, 0), { parcels: 1, ratePercent: 0, total: 1000, installment: 1000, interest: 0 });
});
