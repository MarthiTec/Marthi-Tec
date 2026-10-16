import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

const { outputFiles } = buildSync({ entryPoints: ['apps/web/src/data/cardInterest.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { interestBase, lineHasInterest, interestFreeLabel } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

test('by default every product pays the card interest (the iPhones today)', () => {
  assert.equal(lineHasInterest({ lineTotal: 7500 }, 10), true);
  assert.equal(interestBase([{ lineTotal: 7500 }], 7500, 10), 7500);
});

test('a product with "no interest up to N" pays no interest up to N installments, and pays above N', () => {
  const phone = { lineTotal: 2000, interestFreeInstallments: 10 };
  assert.equal(lineHasInterest(phone, 10), false);
  assert.equal(lineHasInterest(phone, 12), true);
  assert.equal(interestBase([phone], 2000, 10), 0);
  assert.equal(interestBase([phone], 2000, 12), 2000);
});

test('in a mixed cart only the share of products with interest is charged, after discount and trade-in', () => {
  const lines = [{ lineTotal: 7500 }, { lineTotal: 2500, interestFreeInstallments: 18 }];
  // R$ 10.000 em produtos, troca de R$ 2.000: cliente paga 8.000; 75% disso tem juros.
  assert.equal(interestBase(lines, 8000, 10), 6000);
});

test('the totem shows the interest-free installment', () => {
  assert.match(interestFreeLabel(4650, 10), /^10x sem juros de R\$\s465,00$/);
  assert.equal(interestFreeLabel(4650, 0), '');
});
